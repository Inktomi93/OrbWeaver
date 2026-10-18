// Read-only triage of one package's production Knip rows (work item 989): the rows of
// knip-production.baseline.json, or the findings outside it. It buckets each row so a lane judges only
// the hard ones and deletes nothing. The buckets are leads, not verdicts.
//
//   node scripts/triage-production-exports.ts packages/kit [--rot=<pnpm ast rot packages/kit --json --max 100000 output>]
//        [--baseline=knip-production.baseline.json] [--knip=<pnpm knip:prod --reporter json --no-exit-code output>]
//        [--out=<records.json, outside the repo>] [--list] [--root=<checkout>]
//
// Rows come from the baseline, or from --knip (the non-baselined findings). Consumers come from one ast-grep
// pass over import/export statements resolved with the TypeScript module resolver; declaration facts (tuples,
// signature types, @public, schemas, dispatch tables, bound constants) come from ast-grep rules. rot, when
// given, supplies the reachability verdicts attached to each record. No row is changed or removed here.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import ts from "typescript";

const CONSUMER_CLASSES = ["production", "samePackage", "otherPackages", "testkit", "rebuiltTests", "legacyTests", "tooling", "stringReaders"] as const;
type ConsumerClass = (typeof CONSUMER_CLASSES)[number];
const BUCKETS = ["auto-retain", "auto-candidate", "judge"] as const;
type Bucket = (typeof BUCKETS)[number];
const SITE_CAP = 5;
const EXIT_MISUSE = 3;
const MAX_BUFFER = Number.POSITIVE_INFINITY;
const STDERR_EXCERPT = 400;
const COUNT_PAD = 4;
const TEXT_CAP_BYTES = 300_000;
const SCAN_LANGS = [
  { lang: "ts", exts: [".ts", ".mts", ".cts"] },
  { lang: "tsx", exts: [".tsx"] },
  { lang: "js", exts: [".js", ".mjs", ".cjs"] },
] as const;

interface Row {
  readonly key: string;
  readonly kind: string;
  readonly file: string;
  readonly symbol: string;
}
interface Node2 {
  readonly file: string;
  readonly name: string;
}
interface Hit {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}
interface Binding {
  readonly importer: string;
  readonly target: string;
  readonly name: string | null; // null for a namespace or dynamic binding
  readonly ns: string | null;
  readonly line: number;
}
interface ConsumerSet {
  count: number;
  sites: string[];
}
interface Triaged {
  readonly key: string;
  readonly symbol: string;
  readonly kind: string;
  readonly file: string;
  readonly origin: string | null;
  readonly reexport: boolean;
  readonly ownModuleUses: number;
  readonly consumers: Record<ConsumerClass, ConsumerSet>;
  readonly rot: readonly string[];
  readonly bucket: Bucket;
  readonly reasons: readonly string[];
  readonly mintsKey: boolean;
}
interface Verdict {
  readonly bucket: Bucket;
  readonly reasons: readonly string[];
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    baseline: { type: "string" },
    knip: { type: "string" },
    rot: { type: "string" },
    out: { type: "string" },
    list: { type: "boolean" },
    root: { type: "string" },
  },
});
const pkgArg = positionals[0];
if (pkgArg === undefined) {
  console.error(
    "usage: triage-production-exports.ts <packages/name> [--rot=<rot json>] [--baseline=<file>] [--knip=<knip json>] [--out=<json>] [--list] [--root=<checkout>]",
  );
  process.exit(EXIT_MISUSE);
}
const root = resolve(values.root ?? process.cwd());
const pkgDir = pkgArg.replace(/\/+$/u, "");
const pkgName = pkgDir.split("/").pop() ?? pkgDir;

function run(cmd: string, args: readonly string[]): string {
  const res = spawnSync(cmd, args, { cwd: root, encoding: "utf8", maxBuffer: MAX_BUFFER });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} exited ${res.status}: ${res.stderr.slice(0, STDERR_EXCERPT)}`);
  }
  return res.stdout;
}

const tracked = run("git", ["ls-files", "-z"])
  .split("\0")
  .filter((f) => f !== "");
const trackedSet = new Set(tracked);
const textCache = new Map<string, string>();
function textOf(file: string): string {
  let text = textCache.get(file);
  if (text === undefined) {
    text = readFileSync(join(root, file), "utf8");
    textCache.set(file, text);
  }
  return text;
}

// ── ast-grep ────────────────────────────────────────────────────────────────────────────────────────────
interface AstMatch {
  readonly text: string;
  readonly file: string;
  readonly line: number;
}
function astGrep(language: string, rule: string, paths: readonly string[], extraArgs: readonly string[] = []): AstMatch[] {
  const yaml = `id: triage-989\nlanguage: ${language}\nrule:\n${rule}\n`;
  const out = run("ast-grep", ["scan", "--inline-rules", yaml, "--json=stream", ...extraArgs, ...paths]);
  return out
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => {
      const m = JSON.parse(l) as { text: string; file: string; range: { start: { line: number } } };
      return { text: m.text, file: m.file, line: m.range.start.line + 1 };
    });
}
const NO_VENDORED = ["--globs", "!**/devtools-frontend/**", "--globs", "!**/node_modules/**"];

// ── 1. every import/export/dynamic-import statement in the tracked tree ────────────────────────────────
const STATEMENT_RULE = `  any:
    - kind: import_statement
    - kind: export_statement
      has: { kind: export_clause }
    - kind: export_statement
      has: { kind: namespace_export }
    - kind: export_statement
      has: { field: source, kind: string }
    - kind: call_expression
      has: { field: function, kind: import }`;
const scanned: Record<string, { files: number; matched: Set<string> }> = {};
const statements: AstMatch[] = [];
for (const { lang, exts } of SCAN_LANGS) {
  const found = astGrep(lang, STATEMENT_RULE, ["."], NO_VENDORED).filter((m) => trackedSet.has(m.file));
  scanned[lang] = { files: tracked.filter((f) => exts.some((e) => f.endsWith(e))).length, matched: new Set(found.map((m) => m.file)) };
  statements.push(...found);
}

// ── 2. module resolution with the TypeScript resolver (no Program) ──────────────────────────────────────
const resolveOptions: ts.CompilerOptions = {
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  module: ts.ModuleKind.ESNext,
  allowImportingTsExtensions: true,
  resolveJsonModule: true,
};
// `@orb/*` resolves through the checkout's own package.json exports maps, so a checkout without
// node_modules (an older tree) resolves the same way and never leaks into another worktree's sources.
const workspaceDirs = new Map<string, string>(); // package name -> directory
for (const file of tracked.filter((f) => /^(?:packages\/[^/]+|tests\/support|tooling)\/package\.json$/u.test(f))) {
  const name = (JSON.parse(textOf(file)) as { name?: string }).name;
  if (name !== undefined) {
    workspaceDirs.set(name, dirname(file));
  }
}
function exportTarget(target: unknown): string | null {
  if (typeof target === "string") {
    return target;
  }
  const conditional = target as Record<string, unknown> | null;
  return typeof conditional?.["default"] === "string" ? conditional["default"] : null;
}
function workspaceTarget(spec: string): string | null {
  const [, scope, sub = ""] = /^(@orb\/[^/]+)(\/.*)?$/u.exec(spec) ?? [];
  const dir = scope === undefined ? undefined : workspaceDirs.get(scope);
  if (dir === undefined) {
    return null;
  }
  const exportsMap = (JSON.parse(textOf(`${dir}/package.json`)) as { exports?: Record<string, unknown> }).exports ?? {};
  const direct = exportTarget(exportsMap[`.${sub}`]);
  if (direct !== null) {
    return join(dir, direct);
  }
  for (const [pattern, target] of Object.entries(exportsMap)) {
    const [head = "", tail = ""] = pattern.split("*");
    const out = exportTarget(target);
    if (pattern.includes("*") && out !== null && `.${sub}`.startsWith(head) && `.${sub}`.endsWith(tail)) {
      return join(dir, out.replace("*", `.${sub}`.slice(head.length, `.${sub}`.length - tail.length)));
    }
  }
  return null;
}
const resolveCache = new Map<string, string | null>();
function resolveSpec(importer: string, spec: string): string | null {
  const cacheKey = `${dirname(importer)}\0${spec}`;
  const cached = resolveCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const workspace = workspaceTarget(spec);
  const hit = workspace ?? ts.resolveModuleName(spec, join(root, importer), resolveOptions, ts.sys).resolvedModule?.resolvedFileName;
  const rel = hit === undefined ? null : relative(root, resolve(root, hit));
  const result = rel !== null && !rel.startsWith("..") && trackedSet.has(rel) ? rel : null;
  resolveCache.set(cacheKey, result);
  return result;
}

// ── 3. the alias graph ──────────────────────────────────────────────────────────────────────────────────
const namedReexport = new Map<string, Map<string, Node2>>(); // file -> exported name -> origin node
const reexportOf = new Map<string, Node2[]>(); // "file\0name" -> nodes that re-export it by name
const starFrom = new Map<string, string[]>(); // file -> files it `export *`s
const starInto = new Map<string, string[]>(); // file -> files that `export *` it
const bindings: Binding[] = [];
const localExports = new Map<string, Set<string>>(); // file -> names in a bare `export { }` clause

function addNamedReexport(file: string, exported: string, origin: Node2): void {
  const forFile = namedReexport.get(file) ?? new Map<string, Node2>();
  forFile.set(exported, origin);
  namedReexport.set(file, forFile);
  const k = `${origin.file}\0${origin.name}`;
  reexportOf.set(k, [...(reexportOf.get(k) ?? []), { file, name: exported }]);
}
function specifiers(clause: string): { name: string; as: string }[] {
  return [...clause.matchAll(/(?:type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?/gu)]
    .filter((m) => m[1] !== "type" || m[2] !== undefined)
    .map((m) => ({ name: m[1] ?? "", as: m[2] ?? m[1] ?? "" }));
}
const COMMENTS_RE = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu;
const importedLocals = new Map<string, Map<string, Node2>>(); // file -> local binding -> origin (for `import {x}; export {x}`)

for (const st of statements) {
  const text = st.text.replace(COMMENTS_RE, "");
  const src = /(?:from\s*|import\s*\(\s*)["']([^"']+)["']/u.exec(text)?.[1];
  const target = src === undefined ? null : resolveSpec(st.file, src);
  if (text.startsWith("import(") || /^import\s*\(/u.test(text)) {
    if (target !== null) {
      bindings.push({ importer: st.file, target, name: null, ns: null, line: st.line });
    }
    continue;
  }
  if (text.startsWith("import")) {
    if (target === null) {
      continue;
    }
    const ns = /\*\s+as\s+([\w$]+)/u.exec(text)?.[1];
    if (ns !== undefined) {
      bindings.push({ importer: st.file, target, name: null, ns, line: st.line });
    }
    const named = /\{([^}]*)\}/u.exec(text)?.[1];
    for (const s of named === undefined ? [] : specifiers(named)) {
      bindings.push({ importer: st.file, target, name: s.name, ns: null, line: st.line });
      const locals = importedLocals.get(st.file) ?? new Map<string, Node2>();
      locals.set(s.as, { file: target, name: s.name });
      importedLocals.set(st.file, locals);
    }
    continue;
  }
  // export statements
  if (src !== undefined) {
    if (target === null) {
      continue;
    }
    if (/^export\s+(?:type\s+)?\*\s*(?:as\s+[\w$]+\s*)?from/u.test(text)) {
      if (/\*\s+as\s/u.test(text)) {
        bindings.push({ importer: st.file, target, name: null, ns: text.match(/\*\s+as\s+([\w$]+)/u)?.[1] ?? null, line: st.line });
      } else {
        starFrom.set(st.file, [...(starFrom.get(st.file) ?? []), target]);
        starInto.set(target, [...(starInto.get(target) ?? []), st.file]);
      }
      continue;
    }
    const clause = /\{([^}]*)\}/u.exec(text)?.[1] ?? "";
    for (const s of specifiers(clause)) {
      addNamedReexport(st.file, s.as, { file: target, name: s.name });
    }
  } else {
    const clause = /\{([^}]*)\}/u.exec(text)?.[1] ?? "";
    const set = localExports.get(st.file) ?? new Set<string>();
    for (const s of specifiers(clause)) {
      set.add(s.as);
      const imported = importedLocals.get(st.file)?.get(s.name);
      if (imported !== undefined) {
        addNamedReexport(st.file, s.as, imported);
      }
    }
    localExports.set(st.file, set);
  }
}

const DECL_RE = (name: string): RegExp =>
  new RegExp(
    `export\\s+(?:declare\\s+)?(?:const\\s+enum|const|let|var|async\\s+function\\*?|function\\*?|abstract\\s+class|class|interface|type|enum|namespace)\\s+${name.replace(/\$/gu, "\\$")}(?![\\w$])`,
    "u",
  );
function declaredHere(file: string, name: string): boolean {
  return (
    DECL_RE(name).test(textOf(file).replace(COMMENTS_RE, "")) || (localExports.get(file)?.has(name) === true && namedReexport.get(file)?.has(name) !== true)
  );
}
/** Follow named re-exports and `export *` down to the declaring file. */
function originOf(file: string, name: string, seen = new Set<string>()): Node2 | null {
  const key = `${file}\0${name}`;
  if (seen.has(key)) {
    return null;
  }
  seen.add(key);
  const named = namedReexport.get(file)?.get(name);
  if (named !== undefined) {
    return originOf(named.file, named.name, seen);
  }
  if (declaredHere(file, name)) {
    return { file, name };
  }
  for (const target of starFrom.get(file) ?? []) {
    const found = originOf(target, name, seen);
    if (found !== null) {
      return found;
    }
  }
  return null;
}
/** The node itself plus every node above it that re-exports it (named, aliased or starred). */
function upwardClosure(start: Node2): Node2[] {
  const out: Node2[] = [];
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const node = queue.shift() as Node2;
    const key = `${node.file}\0${node.name}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(node);
    queue.push(...(reexportOf.get(key) ?? []));
    for (const above of starInto.get(node.file) ?? []) {
      queue.push({ file: above, name: node.name });
    }
  }
  return out;
}

// ── 4. consumer classification ──────────────────────────────────────────────────────────────────────────
function importerClass(file: string): ConsumerClass | null {
  if (file.startsWith("tests/support/")) {
    return "testkit";
  }
  if (file.startsWith("tests/legacy/")) {
    return "legacyTests";
  }
  if (file.startsWith("tests/")) {
    return "rebuiltTests";
  }
  if (file.startsWith("packages/")) {
    return file.startsWith(`${pkgDir}/`) ? "samePackage" : "otherPackages";
  }
  return file.startsWith("tooling/") || file.startsWith("scripts/") || !file.includes("/") ? "tooling" : null;
}
function emptyConsumers(): Record<ConsumerClass, ConsumerSet> {
  return {
    production: { count: 0, sites: [] },
    samePackage: { count: 0, sites: [] },
    otherPackages: { count: 0, sites: [] },
    testkit: { count: 0, sites: [] },
    rebuiltTests: { count: 0, sites: [] },
    legacyTests: { count: 0, sites: [] },
    tooling: { count: 0, sites: [] },
    stringReaders: { count: 0, sites: [] },
  };
}
function addSite(set: ConsumerSet, file: string, line: number): void {
  set.count += 1;
  if (set.sites.length < SITE_CAP) {
    set.sites.push(`${file}:${line}`);
  }
}

const bindingsByTarget = new Map<string, Binding[]>();
for (const b of bindings) {
  bindingsByTarget.set(b.target, [...(bindingsByTarget.get(b.target) ?? []), b]);
}
const nsUse = (importer: string, ns: string, name: string): boolean =>
  new RegExp(`(?<![\\w$.])${ns.replace(/\$/gu, "\\$")}(?:\\.|\\?\\.|\\[\\s*["'])${name.replace(/\$/gu, "\\$")}(?![\\w$])`, "u").test(textOf(importer));
const wordIn = (text: string, name: string): boolean => new RegExp(`(?<![\\w$])${name.replace(/\$/gu, "\\$")}(?![\\w$])`, "u").test(text);

function bindingNames(b: Binding, node: Node2): boolean {
  if (b.name !== null) {
    return b.name === node.name;
  }
  // A namespace import reads `ns.name`; a dynamic import has no binding, so any word use counts.
  return b.ns === null ? wordIn(textOf(b.importer), node.name) : nsUse(b.importer, b.ns, node.name);
}
function consumersOf(closure: readonly Node2[], rowFile: string): Record<ConsumerClass, ConsumerSet> {
  const out = emptyConsumers();
  const seen = new Set<string>();
  for (const node of closure) {
    for (const b of bindingsByTarget.get(node.file) ?? []) {
      const dedupe = `${b.importer}:${b.line}:${node.name}`;
      const cls = importerClass(b.importer);
      if (cls === null || b.importer === rowFile || seen.has(dedupe) || !bindingNames(b, node)) {
        continue;
      }
      seen.add(dedupe);
      addSite(out[cls], b.importer, b.line);
      if (cls === "samePackage" || cls === "otherPackages") {
        addSite(out.production, b.importer, b.line);
      }
    }
  }
  return out;
}

// ── 5. string readers: tooling, scripts, root configs and the barrel header ─────────────────────────────
const readerFiles = tracked.filter(
  (f) =>
    (f.startsWith("tooling/") || f.startsWith("scripts/") || !f.includes("/")) &&
    /\.(?:ts|tsx|js|mjs|cjs|mts|json)$/u.test(f) &&
    !f.includes("devtools-frontend") &&
    f !== "knip-production.baseline.json" &&
    f !== relative(root, process.argv[1] ?? ""),
);
const TOKEN_RE = /[\p{ID_Start}$_][\p{ID_Continue}$]*/gu;
const lineAt = (text: string, offset: number): number => text.slice(0, offset).split("\n").length;
function readersOf(wanted: ReadonlySet<string>): Map<string, Hit[]> {
  const found = new Map<string, Hit[]>();
  for (const file of readerFiles) {
    const text = textOf(file);
    if (text.length > TEXT_CAP_BYTES) {
      continue;
    }
    for (const m of text.matchAll(TOKEN_RE)) {
      const list = found.get(m[0]) ?? [];
      if (wanted.has(m[0]) && !list.some((h) => h.file === file)) {
        list.push({ file, line: lineAt(text, m.index), text: "" });
        found.set(m[0], list);
      }
    }
  }
  return found;
}
function headerOf(file: string): string {
  const lines: string[] = [];
  for (const l of textOf(file).split("\n")) {
    const t = l.trim();
    if (t !== "" && !t.startsWith("//") && !t.startsWith("/*") && !t.startsWith("*")) {
      break;
    }
    lines.push(l);
  }
  return lines.join("\n");
}

// ── 6. rows ─────────────────────────────────────────────────────────────────────────────────────────────
const baselinePath = values.baseline ?? "knip-production.baseline.json";
const baselineKeys = JSON.parse(readFileSync(resolve(root, baselinePath), "utf8")) as string[];
// `pnpm knip:prod --reporter json` prints only the findings the baseline does not admit; each becomes the key
// knip-baseline.config.ts would write, so both sources feed one pipeline. A `files` finding names itself.
interface KnipJson {
  readonly issues: readonly {
    readonly file: string;
    readonly exports: readonly { name: string }[];
    readonly types: readonly { name: string }[];
    readonly files: readonly { name: string }[];
  }[];
}
const findingKeys: string[] =
  values.knip === undefined
    ? []
    : (JSON.parse(readFileSync(resolve(root, values.knip), "utf8")) as KnipJson).issues.flatMap((i) => [
        ...i.exports.map((e) => JSON.stringify(["exports", i.file, "", e.name])),
        ...i.types.map((t) => JSON.stringify(["types", i.file, "", t.name])),
        ...i.files.map((f) => JSON.stringify(["files", i.file, "", f.name])),
      ]);
const knownKeys = new Set([...baselineKeys, ...findingKeys]);
const rows: Row[] = (values.knip === undefined ? baselineKeys : findingKeys)
  .map((key) => {
    const [kind, file, , symbol] = JSON.parse(key) as [string, string, string, string];
    return { key, kind: kind ?? "", file: file ?? "", symbol: symbol ?? "" };
  })
  .filter((r) => r.file.startsWith(`${pkgDir}/`));

// ── 7. declaration facts from ast-grep rules, over the package's own sources ────────────────────────────
const pkgLangs = [
  { lang: "ts", glob: "!**/*.tsx" },
  { lang: "tsx", glob: "**/*.tsx" },
] as const;
function pkgScan(rule: string): AstMatch[] {
  return pkgLangs.flatMap(({ lang }) => astGrep(lang, rule, [pkgDir]));
}
const nameAfter = (re: RegExp, text: string): string | undefined => re.exec(text)?.[1];

const tupleNames = new Map<string, Hit[]>(); // `X = [...] as const` declarations by name
for (const m of pkgScan(`  kind: variable_declarator
  has:
    field: value
    any:
      - pattern: '[$$$] as const'
      - pattern: '[$$$] as const satisfies $T'`)) {
  const n = nameAfter(/^([\w$]+)/u, m.text);
  if (n !== undefined) {
    tupleNames.set(`${m.file}\0${n}`, [{ file: m.file, line: m.line, text: "" }]);
  }
}
const typeofUses = new Map<string, Hit[]>(); // tuple name -> `typeof NAME` sites in the package
for (const m of pkgScan("  kind: type_query")) {
  const n = nameAfter(/typeof\s+([\w$]+)/u, m.text);
  if (n !== undefined) {
    typeofUses.set(n, [...(typeofUses.get(n) ?? []), { file: m.file, line: m.line, text: "" }]);
  }
}
// `z.enum(NAME)` builds the union a schema parses from the tuple, the zod spelling of `(typeof NAME)[number]`.
for (const m of pkgScan("  pattern: z.enum($T)")) {
  const n = nameAfter(/^z\.enum\(\s*([\w$]+)\s*\)/u, m.text);
  if (n !== undefined) {
    typeofUses.set(n, [...(typeofUses.get(n) ?? []), { file: m.file, line: m.line, text: "" }]);
  }
}
const derivedUnions = new Map<string, string[]>(); // `file\0Type` for `type Type = ... typeof X ...`
for (const m of pkgScan(`  kind: type_alias_declaration
  has: { kind: type_query, stopBy: end }`)) {
  const n = nameAfter(/type\s+([\w$]+)/u, m.text);
  if (n !== undefined) {
    derivedUnions.set(
      `${m.file}\0${n}`,
      [...m.text.matchAll(/typeof\s+([\w$]+)/gu)].map((t) => t[1] ?? ""),
    );
  }
}
const tupleByName = new Set([...tupleNames.keys()].map((k) => k.split("\0")[1]));
const signatureUses = new Map<string, Hit[]>(); // type name -> uses inside an exported declaration's signature
for (const m of pkgScan(`  kind: type_identifier
  inside: { kind: export_statement, stopBy: end }
  not:
    any:
      - inside: { kind: statement_block, stopBy: end }
      - inside:
          field: name
          any: [{ kind: type_alias_declaration }, { kind: interface_declaration }, { kind: class_declaration }]`)) {
  signatureUses.set(m.text, [...(signatureUses.get(m.text) ?? []), { file: m.file, line: m.line, text: "" }]);
}
const publicTagged = new Set<string>(); // `file\0name` for declarations whose TSDoc carries @public
for (const m of pkgScan("  kind: comment\n  regex: '@public(?:$|[\\s-])'")) {
  const after = textOf(m.file)
    .split("\n")
    .slice(m.line - 1 + m.text.split("\n").length - 1)
    .join("\n");
  const decl =
    /export\s+(?:declare\s+)?(?:const\s+enum|const|let|var|async\s+function\*?|function\*?|abstract\s+class|class|interface|type|enum)\s+([\w$]+)/u.exec(
      after,
    )?.[1];
  if (decl !== undefined) {
    publicTagged.add(`${m.file}\0${decl}`);
  }
  for (const s of (/export\s+(?:type\s+)?\{([^}]*)\}/u.exec(after)?.[1] ?? "").split(",")) {
    publicTagged.add(
      `${m.file}\0${
        s
          .trim()
          .split(/\s+as\s+/u)
          .pop() ?? ""
      }`,
    );
  }
}
const schemaDecls = new Set<string>(); // `file\0name` for module-level `const x = z....`
if (pkgDir === "packages/contracts") {
  for (const m of pkgScan(`  kind: variable_declarator
  any:
    - has: { field: value, regex: '^z\\s*\\.' }
    - has: { field: name, regex: 'Schema$' }
  inside:
    kind: lexical_declaration
    inside: { any: [{ kind: program }, { kind: export_statement }] }`)) {
    const n = nameAfter(/^([\w$]+)/u, m.text);
    if (n !== undefined) {
      schemaDecls.add(`${m.file}\0${n}`);
    }
  }
}

// Dispatch tables: `X: Record<Union, ...>` or `{...} satisfies Record<Union, ...>`. A `string` or `number` key is
// a lookup map, not an axis that fails `tsc` when a member is added, so it does not count.
const DISPATCH_RE =
  /^[\w$]+\s*:\s*(?:Readonly<\s*)?Record<\s*(?!string\b|number\b|symbol\b)|\bsatisfies\s+(?:Readonly<\s*)?Record<\s*(?!string\b|number\b|symbol\b)/u;
const dispatchTables = new Set<string>(); // `file\0name`
for (const m of pkgScan(`  kind: variable_declarator
  any:
    - has: { kind: type_annotation, regex: '^:\\s*(?:Readonly<\\s*)?Record<' }
    - has: { field: value, kind: satisfies_expression, regex: 'satisfies\\s+(?:Readonly<\\s*)?Record<' }`)) {
  const n = nameAfter(/^([\w$]+)/u, m.text);
  if (n !== undefined && DISPATCH_RE.test(m.text)) {
    dispatchTables.add(`${m.file}\0${n}`);
  }
}
// Bound constants: a literal, a computed literal, an `as const` object, or an alias of one. Spine-Testing
// section 10 has tests import limits, ids and prefixes from their production home, so a bound constant is a
// test anchor the module may not have yet.
const boundConstants = new Set<string>(); // `file\0name`
const MODULE_CONST = "inside: { kind: lexical_declaration, regex: '^const\\b', inside: { any: [{ kind: program }, { kind: export_statement }] } }";
for (const m of pkgScan(`  kind: variable_declarator
  ${MODULE_CONST}
  has:
    field: value
    any:
      - kind: number
      - kind: string
      - kind: regex
      - kind: 'true'
      - kind: 'false'
      - kind: unary_expression
      - kind: binary_expression
      - kind: template_string
      - kind: as_expression
        has: { kind: object }`)) {
  const n = nameAfter(/^([\w$]+)/u, m.text);
  if (n !== undefined) {
    boundConstants.add(`${m.file}\0${n}`);
  }
}
const boundNames = new Set([...boundConstants].map((k) => k.split("\0")[1]));
for (const m of pkgScan(`  kind: variable_declarator
  ${MODULE_CONST}
  has: { field: value, kind: identifier }`)) {
  const [, name, target] = /^([\w$]+)\s*=\s*([\w$]+)\s*$/u.exec(m.text) ?? [];
  if (name !== undefined && target !== undefined && boundNames.has(target)) {
    boundConstants.add(`${m.file}\0${name}`);
  }
}
// A tuple read with `.includes` is a membership list; no type derives from it, so only the author knows if it is a door.
const includesReceivers = new Set<string>();
for (const m of pkgScan("  pattern: $T.includes($$$)")) {
  const n = nameAfter(/^\(?\s*([\w$]+)/u, m.text);
  if (n !== undefined) {
    includesReceivers.add(n);
  }
}
// Names the law cites in code spans: docs/law and docs/adr are the reasons an export stays.
const lawNames = new Map<string, string>(); // name -> first doc
for (const file of tracked.filter((f) => /^docs\/(?:law|adr)\/.+\.md$/u.test(f))) {
  const spans = [...textOf(file).matchAll(/```[\s\S]*?```|`[^`\n]+`/gu)].map((s) => s[0]);
  for (const span of spans) {
    for (const t of span.matchAll(TOKEN_RE)) {
      if (!lawNames.has(t[0])) {
        lawNames.set(t[0], file);
      }
    }
  }
}
// A `{@link Name}` in a door's TSDoc names an export the door deliberately presents.
const linkedNames = new Map<string, string>(); // name -> `file:line`
for (const file of tracked.filter((f) => f.startsWith(`${pkgDir}/`) && /\/index\.tsx?$/u.test(f))) {
  const text = textOf(file);
  for (const m of text.matchAll(/\{@link\s+([\w$]+)/gu)) {
    if (!linkedNames.has(m[1] ?? "")) {
      linkedNames.set(m[1] ?? "", `${file}:${lineAt(text, m.index)}`);
    }
  }
}

// uses of each row's name inside its own file (the declaration is one use; a bare export clause is another)
const rowFiles = [...new Set(rows.map((r) => r.file))];
const allSymbols = [...new Set(rows.map((r) => r.symbol))];
const ownUseCount = new Map<string, number>();
if (rowFiles.length > 0) {
  const regex = `^(?:${allSymbols.map((s) => s.replace(/[$.*+?^()|[\]{}\\]/gu, "\\$&")).join("|")})$`;
  for (const { lang } of pkgLangs) {
    for (const m of astGrep(
      lang,
      `  any: [{ kind: identifier }, { kind: type_identifier }, { kind: shorthand_property_identifier }, { kind: shorthand_property_identifier_pattern }]\n  regex: '${regex.replace(/'/gu, "''")}'`,
      rowFiles.filter((f) => (lang === "tsx") === f.endsWith(".tsx")),
    )) {
      const k = `${m.file}\0${m.text}`;
      ownUseCount.set(k, (ownUseCount.get(k) ?? 0) + 1);
    }
  }
}

// ── 8. rot ──────────────────────────────────────────────────────────────────────────────────────────────
// `pnpm ast rot --json` prints one JSON value per section, back to back, each closing with a lone `}`.
// Every hit leads its text with the export name; the section label and hit kind become the row's tags.
interface RotSection {
  readonly label: string;
  readonly total: number;
  readonly shown: number;
  readonly hits: readonly { file: string; line: number; kind: string; text: string }[];
}
function parseRot(raw: string): RotSection[] {
  if (/^\s*\{\s*\}\s*$/u.test(raw)) {
    return []; // an explicit "no rot input" file
  }
  return raw
    .split(/^\}\s*$/mu)
    .filter((chunk) => chunk.trim() !== "")
    .map((chunk) => JSON.parse(`${chunk}}`) as RotSection);
}
// `pnpm ast rot` runs for tens of minutes on a large package, so its verdicts are optional.
const rotSections = values.rot === undefined ? [] : parseRot(readFileSync(resolve(root, values.rot), "utf8"));
const rotTruncated = rotSections.filter((s) => s.shown < s.total).map((s) => s.label);
const rotTags = new Map<string, string[]>();
for (const section of rotSections) {
  for (const hit of section.hits) {
    const name = /^([\w$]+)/u.exec(hit.text)?.[1];
    const k = `${hit.file}\0${name}`;
    rotTags.set(k, [...new Set([...(rotTags.get(k) ?? []), `${section.label.split("::").pop()?.trim()}:${hit.kind}`])]);
  }
}

// ── 9. the verdict ──────────────────────────────────────────────────────────────────────────────────────
interface Case {
  readonly row: Row;
  readonly origin: Node2 | null;
  readonly at: Node2; // the declaration, or the row itself when the chain does not resolve
  readonly consumers: Record<ConsumerClass, ConsumerSet>;
  readonly ownUses: number;
  readonly rot: readonly string[];
  readonly reexport: boolean;
  readonly outside: number; // importers of any class other than production (a subset) and string readers
}
const keyOf = (n: Node2): string => `${n.file}\0${n.name}`;
const firstSite = (hits: readonly Hit[] | undefined): string => (hits?.[0] === undefined ? "" : `${hits[0].file}:${hits[0].line}`);

// Each retained shape from the merged adjudication batches; the first column is the reason text.
const RETAIN_RULES: readonly ((c: Case) => string | null)[] = [
  (c: Case): string | null => (c.consumers.rebuiltTests.count + c.consumers.testkit.count > 0 ? "imported by a rebuilt test or the testkit" : null),
  (c: Case): string | null =>
    tupleNames.has(keyOf(c.at)) && (typeofUses.get(c.at.name)?.length ?? 0) > 0
      ? `as const tuple behind a derived union (${firstSite(typeofUses.get(c.at.name))})`
      : null,
  (c: Case): string | null => ((derivedUnions.get(keyOf(c.at)) ?? []).some((t) => tupleByName.has(t)) ? "derived union of an as const tuple" : null),
  (c: Case): string | null =>
    c.row.kind === "types" && signatureUses.has(c.at.name) ? `type used in an exported signature (${firstSite(signatureUses.get(c.at.name))})` : null,
  (c: Case): string | null => (publicTagged.has(keyOf(c.at)) || publicTagged.has(`${c.row.file}\0${c.row.symbol}`) ? "@public TSDoc" : null),
  (c: Case): string | null =>
    c.consumers.stringReaders.count + c.consumers.tooling.count > 0
      ? `name read by tooling, scripts or root config (${c.consumers.stringReaders.sites[0] ?? c.consumers.tooling.sites[0] ?? ""})`
      : null,
  (c: Case): string | null =>
    pkgDir === "packages/contracts" && !c.reexport && schemaDecls.has(keyOf(c.at)) ? "module-level contract schema (contract-structural-copy reads it)" : null,
  (c: Case): string | null => (dispatchTables.has(keyOf(c.at)) ? "dispatch table" : null),
  (c: Case): string | null => {
    const doc = lawNames.get(c.row.symbol) ?? lawNames.get(c.at.name);
    const link = linkedNames.get(c.row.symbol) ?? linkedNames.get(c.at.name);
    return doc !== undefined || link !== undefined ? `named in law (${link ?? doc})` : null;
  },
];

// Shapes a deletion must not decide alone. They skip the candidate bucket and land in judge.
const JUDGE_RULES: readonly ((c: Case) => string | null)[] = [
  // A barrel link to a bound constant is still a removable door; only the declaration is the test anchor.
  (c: Case): string | null => (!c.reexport && boundConstants.has(keyOf(c.at)) && usedInModule(c.at) ? "bound constant (Spine-Testing §10)" : null),
  (c: Case): string | null =>
    tupleNames.has(keyOf(c.at)) && includesReceivers.has(c.at.name) ? "as const tuple read with .includes and no derived union" : null,
];
function usedInModule(node: Node2): boolean {
  const uses = [
    ...textOf(node.file)
      .replace(COMMENTS_RE, "")
      .matchAll(new RegExp(`(?<![\\w$])${node.name.replace(/\$/gu, "\\$")}(?![\\w$])`, "gu")),
  ];
  return uses.length > 1;
}

function candidateReason(c: Case): string | null {
  // A swallowed export can be load-bearing through the namespace that swallows it.
  if (c.rot.some((t) => t.startsWith("swallowed"))) {
    return null;
  }
  if (c.reexport && c.consumers.production.count === 0 && c.outside === c.consumers.legacyTests.count) {
    return c.consumers.legacyTests.count === 0 ? "barrel re-export with no importer" : "barrel re-export reached only by legacy tests";
  }
  return !c.reexport && c.outside === 0 && c.ownUses > 0 ? "declaration used only in its own module" : null;
}
function judgeReasons(c: Case): string[] {
  const why: (string | false)[] = [
    c.row.kind === "files" && "whole file unused; deletion is a separate decision",
    c.consumers.production.count > 0 && "production importer exists",
    !c.reexport && c.consumers.legacyTests.count > 0 && "declaration anchored by legacy tests",
    !c.reexport && c.outside === 0 && c.ownUses === 0 && c.row.kind !== "files" && "declared and used nowhere; deletion is a separate decision",
    c.rot.some((t) => t.startsWith("swallowed")) && "rot: swallowed by a namespace",
    c.origin === null && c.row.kind !== "files" && "origin not resolved",
  ];
  const reasons = why.filter((w): w is string => w !== false);
  return reasons.length > 0 ? reasons : ["no rule matched"];
}
function verdictOf(c: Case): Verdict {
  const retain = RETAIN_RULES.map((rule) => rule(c)).filter((r): r is string => r !== null);
  if (retain.length > 0) {
    return { bucket: "auto-retain", reasons: retain };
  }
  const hard = JUDGE_RULES.map((rule) => rule(c)).filter((r): r is string => r !== null);
  if (hard.length > 0) {
    return { bucket: "judge", reasons: hard };
  }
  const candidate = c.row.kind === "files" ? null : candidateReason(c);
  return candidate === null ? { bucket: "judge", reasons: judgeReasons(c) } : { bucket: "auto-candidate", reasons: [candidate] };
}

const wantedReaders = readersOf(new Set(allSymbols));
function addStringReaders(consumers: Record<ConsumerClass, ConsumerSet>, closure: readonly Node2[], symbol: string): void {
  for (const h of wantedReaders.get(symbol) ?? []) {
    addSite(consumers.stringReaders, h.file, h.line);
  }
  // A barrel's own header comment can name the symbol it deliberately exposes.
  for (const file of new Set(closure.map((n) => n.file))) {
    if (/\/index\.tsx?$/u.test(file) && wordIn(headerOf(file), symbol)) {
      addSite(consumers.stringReaders, file, 1);
    }
  }
}
function triage(row: Row): Triaged {
  const origin = row.kind === "files" ? null : originOf(row.file, row.symbol);
  const closure = upwardClosure({ file: row.file, name: row.symbol });
  const consumers = consumersOf(closure, row.file);
  addStringReaders(consumers, closure, row.symbol);
  // The declaration is one use and a bare `export { }` clause another; neither is a use in the module.
  const ownUses =
    row.kind === "files" ? 0 : (ownUseCount.get(`${row.file}\0${row.symbol}`) ?? 0) - 1 - (localExports.get(row.file)?.has(row.symbol) === true ? 1 : 0);
  const at = origin ?? { file: row.file, name: row.symbol };
  const rot = [...new Set([...(rotTags.get(keyOf(at)) ?? []), ...(rotTags.get(`${row.file}\0${row.symbol}`) ?? [])])];
  const outside = CONSUMER_CLASSES.filter((c) => c !== "production" && c !== "stringReaders").reduce((n, c) => n + consumers[c].count, 0);
  const reexport = origin !== null && origin.file !== row.file;
  const verdict = verdictOf({ row, origin, at, consumers, ownUses, rot, reexport, outside });
  // Dropping a barrel link leaves the origin export unused in production; when the baseline has no row for it,
  // Knip may report it as a new key.
  const mintsKey = reexport && !knownKeys.has(JSON.stringify([row.kind, at.file, "", at.name]));
  return {
    key: row.key,
    symbol: row.symbol,
    kind: row.kind,
    file: row.file,
    origin: origin === null ? null : `${origin.file}#${origin.name}`,
    reexport,
    ownModuleUses: ownUses,
    consumers,
    rot,
    bucket: verdict.bucket,
    reasons: verdict.reasons,
    mintsKey,
  };
}
const records = rows.map(triage);

// ── 10. output ──────────────────────────────────────────────────────────────────────────────────────────
const counts = Object.fromEntries(BUCKETS.map((b) => [b, records.filter((r) => r.bucket === b).length]));
const reasonCounts = new Map<string, number>();
for (const r of records) {
  const head = `${r.bucket}: ${r.reasons[0]?.replace(/\s*\(.*$/u, "") ?? ""}`;
  reasonCounts.set(head, (reasonCounts.get(head) ?? 0) + 1);
}
const summary = {
  package: pkgDir,
  baseline: baselinePath,
  rows: records.length,
  counts,
  scanned: Object.fromEntries(Object.entries(scanned).map(([k, v]) => [k, { trackedFiles: v.files, filesWithStatements: v.matched.size }])),
  readerFilesScanned: readerFiles.length,
  rotTaggedRows: records.filter((r) => r.rot.length > 0).length,
  rotSections: rotSections.map((s) => ({ label: s.label, total: s.total, shown: s.shown })),
  rotTruncated,
};
if (values.out !== undefined) {
  writeFileSync(resolve(root, values.out), `${JSON.stringify({ summary, records }, null, 2)}\n`);
}
console.log(`${pkgName}: ${records.length} rows -> ${BUCKETS.map((b) => `${b} ${counts[b]}`).join(", ")}`);
for (const [reason, n] of [...reasonCounts].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(COUNT_PAD)}  ${reason}`);
}
if (values.list === true) {
  for (const r of records.filter((x) => x.bucket === "auto-candidate")) {
    const importers = CONSUMER_CLASSES.filter((c) => r.consumers[c].count > 0).map((c) => `${c}=${r.consumers[c].count}`);
    console.log(
      `CANDIDATE ${r.kind} ${r.file}#${r.symbol} | ${r.reasons[0]} | origin ${r.origin ?? "unresolved"} | own-uses ${r.ownModuleUses} | importers ${importers.join(",") || "none"}${r.mintsKey ? " | mints a key" : ""}`,
    );
  }
}
console.log(JSON.stringify(summary.scanned), `readerFiles=${summary.readerFilesScanned}`, `rotTaggedRows=${summary.rotTaggedRows}`);
if (rotTruncated.length > 0) {
  console.error(`rot output was truncated in: ${rotTruncated.join(", ")}; rerun pnpm ast rot with --max 100000 so no hit is missing`);
}
