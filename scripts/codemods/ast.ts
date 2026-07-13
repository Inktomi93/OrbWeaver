#!/usr/bin/env tsx
// pnpm ast — no-script structural search over the whole workspace: symbol layer (ts-morph — refs/
// callers/importers/exports/jsx/ident + rot lenses orphans/testonly/cycles/aliases) and module-graph
// layer (depcruise pass-throughs flow/reaches, same config the gates run). Run bare for full usage
// with examples (the USAGE block below is the doc). Prefer this over grep for CODE questions.
import { spawnSync } from "node:child_process";
import process from "node:process";
import type { ExportDeclaration, ImportDeclaration, Project, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { getWorkspace } from "../ts-workspace.ts";
import { CodemodError } from "./codemod-kit.ts";

const REPO_ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/u, "");

const SNIPPET_CAP = 120;
const DEPCRUISE_MAX_BUFFER_BYTES = 67_108_864; // 64 MiB
const DEFAULT_MAX = 60;
// Past this many hits, raw lines stop helping — collapse to per-file counts (what a reader
// actually wants at that scale: WHERE, not 200 snippets). --max overrides.
const COLLAPSE_THRESHOLD = 60;
const STAR_SNIFF_CAP = 40;
const TEST_FILE_RE = /\.(test|ct)\.tsx?$/u;
const STAR_CLAUSE_RE = /export\s+\*|import\s+\*/u;

type Flags = { in: string | null; json: boolean; max: number; filesOnly: boolean };
type Hit = { file: string; line: number; kind: string; text: string };
type NamedClause = {
  getNamedImports?: () => Array<{ getName: () => string }>;
  getNamedExports?: () => Array<{ getName: () => string }>;
};

function parseFlags(rest: string[]): Flags {
  const flags: Flags = { in: null, json: false, max: DEFAULT_MAX, filesOnly: false };
  for (let i = 0; i < rest.length; i += 1) {
    const t = rest[i];
    if (t === "--in") {
      flags.in = rest[i + 1] ?? null;
      i += 1;
    } else if (t === "--json") {
      flags.json = true;
    } else if (t === "--files") {
      flags.filesOnly = true;
    } else if (t === "--max") {
      flags.max = Number(rest[i + 1] ?? DEFAULT_MAX) || DEFAULT_MAX;
      i += 1;
    }
  }
  return flags;
}

function hitOf(node: Node, kind: string): Hit {
  const sf = node.getSourceFile();
  const line = sf.getLineAndColumnAtPos(node.getStart()).line;
  const raw = sf.getFullText().split("\n")[line - 1] ?? "";
  const text = raw.trim().slice(0, SNIPPET_CAP);
  const full = sf.getFilePath();
  const file = full.startsWith(`${REPO_ROOT}/`) ? full.slice(REPO_ROOT.length + 1) : full;
  return { file, line, kind, text };
}

function dedupe(hits: Hit[], flags: Flags): Hit[] {
  const filtered = flags.in === null ? hits : hits.filter((h) => h.file.includes(flags.in ?? ""));
  const seen = new Set<string>();
  return filtered.filter((h) => {
    const k = `${h.file}:${h.line}:${h.kind}`;
    if (seen.has(k)) {
      return false;
    }
    seen.add(k);
    return true;
  });
}

function perFileCounts(hits: Hit[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const h of hits) {
    counts.set(h.file, (counts.get(h.file) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function emit(hits: Hit[], flags: Flags, label: string): void {
  const unique = dedupe(hits, flags).sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line,
  );
  const files = new Set(unique.map((h) => h.file)).size;
  if (flags.json) {
    const shown = unique.slice(0, flags.max);
    console.log(
      JSON.stringify({ label, total: unique.length, shown: shown.length, hits: shown }, null, 1),
    );
    return;
  }
  if (
    flags.filesOnly ||
    (unique.length > Math.max(flags.max, COLLAPSE_THRESHOLD) && flags.max === DEFAULT_MAX)
  ) {
    // The at-a-glance mode: WHERE the hits live, one line per file. Explicit via --files, or
    // automatic when raw lines would flood the reader (pass --max <n> to force raw lines).
    for (const [file, n] of perFileCounts(unique)) {
      console.log(`${file}  (${n})`);
    }
    console.log(
      `RESULT ast ${label}: ${unique.length} hit(s) in ${files} file(s) — per-file counts${flags.filesOnly ? "" : " (auto-collapsed; pass --max <n> for raw lines)"}`,
    );
    return;
  }
  const shown = unique.slice(0, flags.max);
  for (const h of shown) {
    console.log(`${h.file}:${h.line}  [${h.kind}]  ${h.text}`);
  }
  const overflow = unique.length > shown.length ? ` (showing ${shown.length} — raise --max)` : "";
  console.log(
    unique.length === 0
      ? `RESULT ast ${label}: no results`
      : `RESULT ast ${label}: ${unique.length} hit(s)${overflow} in ${files} file(s)`,
  );
}

// One workspace project per invocation, via the ONE sanctioned bootstrap (scripts/ts-workspace.ts).
// types:true = root-tsconfig resolution options + full-workspace globs (the refs verb needs the
// language service to follow @orb/* exports and #aliases); types:false = the fast pure-AST arm.
function loadProject(needTypes: boolean): Project {
  return getWorkspace({ root: REPO_ROOT, types: needTypes });
}

/** Every exported (workspace-wide) or module-local (same-file refs still matter) declaration named `name`. */
function declarationsNamed(project: Project, name: string): Node[] {
  const out: Node[] = [];
  for (const sf of project.getSourceFiles()) {
    const exported = sf.getExportedDeclarations().get(name);
    if (exported) {
      out.push(...exported);
    }
    for (const fn of sf.getFunctions()) {
      if (fn.getName() === name && !fn.isExported()) {
        out.push(fn);
      }
    }
    for (const v of sf.getVariableDeclarations()) {
      if (v.getName() === name && !v.isExported()) {
        out.push(v);
      }
    }
  }
  return out;
}

function cmdRefs(project: Project, name: string, flags: Flags): void {
  const decls = declarationsNamed(project, name);
  if (decls.length === 0) {
    emit([], flags, `refs ${name} (no declaration found — try \`pnpm ast ident ${name}\`)`);
    return;
  }
  const hits: Hit[] = [];
  const declStarts = new Set(
    decls.map((d) => `${d.getSourceFile().getFilePath()}:${d.getStart()}`),
  );
  for (const decl of decls) {
    hits.push(hitOf(decl, "def"));
    if (Node.isReferenceFindable(decl)) {
      for (const ref of decl.findReferencesAsNodes()) {
        const key = `${ref.getSourceFile().getFilePath()}:${ref.getStart()}`;
        if (!declStarts.has(key)) {
          hits.push(hitOf(ref, "ref"));
        }
      }
    }
  }
  emit(hits, flags, `refs ${name} (${decls.length} declaration(s))`);
}

function cmdCallers(project: Project, name: string, flags: Flags): void {
  const hits: Hit[] = [];
  for (const sf of project.getSourceFiles()) {
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = call.getExpression();
      const isMethod = Node.isPropertyAccessExpression(expr);
      const tail = isMethod ? expr.getName() : expr.getText();
      if (tail === name) {
        hits.push(hitOf(call, isMethod ? "method-call" : "call"));
      }
    }
  }
  emit(hits, flags, `callers ${name}`);
}

function staticImporterHits(sf: SourceFile, spec: string): Hit[] {
  const out: Hit[] = [];
  const decls: Array<ImportDeclaration | ExportDeclaration> = [
    ...sf.getImportDeclarations(),
    ...sf.getExportDeclarations(),
  ];
  for (const d of decls) {
    const m = d.getModuleSpecifierValue();
    if (m !== undefined && m.includes(spec)) {
      out.push(hitOf(d, "import"));
    }
  }
  return out;
}

function dynamicImporterHits(sf: SourceFile, spec: string): Hit[] {
  const out: Hit[] = [];
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) {
      continue;
    }
    const arg = call.getArguments()[0];
    if (arg !== undefined && Node.isStringLiteral(arg) && arg.getLiteralText().includes(spec)) {
      out.push(hitOf(call, "dynamic-import"));
    }
  }
  return out;
}

function cmdImporters(project: Project, spec: string, flags: Flags): void {
  const hits: Hit[] = [];
  for (const sf of project.getSourceFiles()) {
    hits.push(...staticImporterHits(sf, spec), ...dynamicImporterHits(sf, spec));
  }
  emit(hits, flags, `importers ${spec}`);
}

function cmdExports(project: Project, path: string, flags: Flags): void {
  const hits: Hit[] = [];
  for (const sf of project.getSourceFiles()) {
    if (!sf.getFilePath().includes(path)) {
      continue;
    }
    for (const [name, decls] of sf.getExportedDeclarations()) {
      const d = decls[0];
      if (d !== undefined) {
        const h = hitOf(d, "export");
        h.text = `${name}  —  ${h.text}`;
        hits.push(h);
      }
    }
  }
  emit(hits, flags, `exports ${path}`);
}

function cmdJsx(project: Project, name: string, flags: Flags): void {
  const hits: Hit[] = [];
  for (const sf of project.getSourceFiles()) {
    for (const kind of [SyntaxKind.JsxOpeningElement, SyntaxKind.JsxSelfClosingElement] as const) {
      for (const el of sf.getDescendantsOfKind(kind)) {
        if (el.getTagNameNode().getText() === name) {
          hits.push(hitOf(el, "jsx"));
        }
      }
    }
  }
  emit(hits, flags, `jsx ${name}`);
}

function cmdIdent(project: Project, name: string, flags: Flags): void {
  const hits: Hit[] = [];
  for (const sf of project.getSourceFiles()) {
    for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
      if (id.getText() === name) {
        hits.push(hitOf(id, "ident"));
      }
    }
  }
  emit(hits, flags, `ident ${name}`);
}

/** Every named-import/-export name used anywhere in the workspace, + whether star clauses exist. */
function collectUsedNames(project: Project): { used: Set<string>; star: boolean } {
  const used = new Set<string>();
  let star = false;
  for (const sf of project.getSourceFiles()) {
    for (const d of [...sf.getImportDeclarations(), ...sf.getExportDeclarations()]) {
      const clause = d as unknown as NamedClause;
      for (const n of clause.getNamedImports?.() ?? []) {
        used.add(n.getName());
      }
      for (const n of clause.getNamedExports?.() ?? []) {
        used.add(n.getName());
      }
      if (STAR_CLAUSE_RE.test(d.getText().slice(0, STAR_SNIFF_CAP))) {
        star = true;
      }
    }
  }
  return { used, star };
}

function orphanHitsForFile(sf: SourceFile, used: Set<string>, star: boolean): Hit[] {
  const fp = sf.getFilePath();
  const barrel = fp.endsWith("/index.ts") || fp.endsWith("/index.tsx");
  const out: Hit[] = [];
  for (const [name, decls] of sf.getExportedDeclarations()) {
    if (used.has(name) || (star && barrel)) {
      continue;
    }
    const d = decls[0];
    if (d !== undefined) {
      const h = hitOf(d, "orphan-export");
      h.text = `${name}  —  ${h.text}`;
      out.push(h);
    }
  }
  return out;
}

function cmdOrphans(project: Project, pkg: string, flags: Flags): void {
  const prefix = `/packages/${pkg}/src/`;
  const { used, star } = collectUsedNames(project);
  const hits: Hit[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (fp.includes(prefix) && !TEST_FILE_RE.test(fp)) {
      hits.push(...orphanHitsForFile(sf, used, star));
    }
  }
  const note = star ? " (star re-exports present: barrel orphans suppressed)" : "";
  emit(hits, flags, `orphans ${pkg}${note}`);
}

function addClauseNames(d: ImportDeclaration | ExportDeclaration, bucket: Set<string>): void {
  const clause = d as unknown as NamedClause;
  for (const n of clause.getNamedImports?.() ?? []) {
    bucket.add(n.getName());
  }
  for (const n of clause.getNamedExports?.() ?? []) {
    bucket.add(n.getName());
  }
}

/** Named-import/-export names split by importer kind: production code vs test paths. */
function collectUsageSplit(project: Project): { usedProd: Set<string>; usedTest: Set<string> } {
  const usedProd = new Set<string>();
  const usedTest = new Set<string>();
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    const isTest = TEST_FILE_RE.test(fp) || fp.includes("/tests/");
    for (const d of [...sf.getImportDeclarations(), ...sf.getExportDeclarations()]) {
      addClauseNames(d, isTest ? usedTest : usedProd);
    }
  }
  return { usedProd, usedTest };
}

function testOnlyHitsForFile(sf: SourceFile, usedProd: Set<string>, usedTest: Set<string>): Hit[] {
  const out: Hit[] = [];
  for (const [name, decls] of sf.getExportedDeclarations()) {
    if (usedProd.has(name) || !usedTest.has(name)) {
      continue;
    }
    const d = decls[0];
    if (d !== undefined) {
      const h = hitOf(d, "test-only-export");
      h.text = `${name}  —  ${h.text}`;
      out.push(h);
    }
  }
  return out;
}

/** Exports of packages/<pkg> imported ONLY from test paths — code alive solely because a test calls it. */
function cmdTestOnly(project: Project, pkg: string, flags: Flags): void {
  const prefix = `/packages/${pkg}/src/`;
  const { usedProd, usedTest } = collectUsageSplit(project);
  const hits: Hit[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (fp.includes(prefix) && !TEST_FILE_RE.test(fp)) {
      hits.push(...testOnlyHitsForFile(sf, usedProd, usedTest));
    }
  }
  emit(hits, flags, `testonly ${pkg}`);
}

/** RESOLVED intra-package file graph: edges via getModuleSpecifierSourceFile (relative, #alias,
 *  @orb subpath all resolve) — needs the types:true arm. */
function resolvedGraph(project: Project, prefix: string): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const sf of project.getSourceFiles()) {
    const from = sf.getFilePath();
    if (!from.includes(prefix)) {
      continue;
    }
    const edges: string[] = [];
    for (const d of [...sf.getImportDeclarations(), ...sf.getExportDeclarations()]) {
      const target = d.getModuleSpecifierSourceFile()?.getFilePath();
      if (target !== undefined && target.includes(prefix) && target !== from) {
        edges.push(target);
      }
    }
    graph.set(from, edges);
  }
  return graph;
}

function findCycles(graph: Map<string, string[]>): string[][] {
  const state = new Map<string, number>();
  const stack: string[] = [];
  const found: string[][] = [];
  const walk = (n: string): void => {
    state.set(n, 1);
    stack.push(n);
    for (const m of graph.get(n) ?? []) {
      const s = state.get(m) ?? 0;
      if (s === 0) {
        walk(m);
      } else if (s === 1) {
        const i = stack.indexOf(m);
        if (i >= 0) {
          found.push(stack.slice(i));
        }
      }
    }
    stack.pop();
    state.set(n, 2);
  };
  for (const n of graph.keys()) {
    if ((state.get(n) ?? 0) === 0) {
      walk(n);
    }
  }
  return found;
}

/** Intra-package import cycles with FULL specifier resolution — cycles laundered through aliases or
 *  barrels are visible (a relative-only walk reports a false 0). */
function cmdCycles(project: Project, pkg: string, flags: Flags): void {
  const prefix = `/packages/${pkg}/src/`;
  const hits: Hit[] = [];
  for (const cycle of findCycles(resolvedGraph(project, prefix))) {
    const first = project.getSourceFile(cycle[0] ?? "");
    if (first !== undefined) {
      const h = hitOf(first, "cycle");
      h.text = cycle.map((p) => p.split(prefix)[1] ?? p).join(" → ");
      hits.push(h);
    }
  }
  emit(hits, flags, `cycles ${pkg} (alias-resolved)`);
}

function renameSpecifierHits(sf: SourceFile): Hit[] {
  const out: Hit[] = [];
  for (const d of sf.getImportDeclarations()) {
    for (const spec of d.getNamedImports()) {
      const alias = spec.getAliasNode();
      if (alias !== undefined) {
        const h = hitOf(spec, "rename-import");
        h.text = `${spec.getName()} as ${alias.getText()}`;
        out.push(h);
      }
    }
  }
  for (const d of sf.getExportDeclarations()) {
    for (const spec of d.getNamedExports()) {
      const alias = spec.getAliasNode();
      if (alias !== undefined) {
        const h = hitOf(spec, "rename-export");
        h.text = `${spec.getName()} as ${alias.getText()}`;
        out.push(h);
      }
    }
  }
  return out;
}

function rebindHits(sf: SourceFile): Hit[] {
  const out: Hit[] = [];
  for (const t of sf.getTypeAliases()) {
    const tn = t.getTypeNode();
    if (tn !== undefined && Node.isTypeReference(tn) && tn.getTypeArguments().length === 0) {
      const h = hitOf(t, "type-rename");
      h.text = `type ${t.getName()} = ${tn.getText()}`;
      out.push(h);
    }
  }
  for (const v of sf.getVariableDeclarations()) {
    const init = v.getInitializer();
    if (v.isExported() && init !== undefined && Node.isIdentifier(init)) {
      const h = hitOf(v, "const-rename");
      h.text = `const ${v.getName()} = ${init.getText()}`;
      out.push(h);
    }
  }
  return out;
}

/** Rename-alias laundering: `import/export { X as Y }`, exported `const Y = X`, and bare `type Y = X`
 *  renames — the same declaration living under N public names. Scope with --in <pkg-substr>. */
function cmdAliases(project: Project, scope: string, flags: Flags): void {
  const hits: Hit[] = [];
  for (const sf of project.getSourceFiles()) {
    if (!sf.getFilePath().includes(scope)) {
      continue;
    }
    hits.push(...renameSpecifierHits(sf), ...rebindHits(sf));
  }
  emit(hits, flags, `aliases ${scope}`);
}

const VERBS: Record<string, (project: Project, arg: string, flags: Flags) => void> = {
  refs: cmdRefs,
  callers: cmdCallers,
  importers: cmdImporters,
  exports: cmdExports,
  jsx: cmdJsx,
  ident: cmdIdent,
  orphans: cmdOrphans,
  testonly: cmdTestOnly,
  cycles: cmdCycles,
  aliases: cmdAliases,
};

// depcruise pass-throughs — the module-graph layer (the same config + rules the gates run), in
// agent-readable text instead of the pnpm scripts' mermaid. flow = X's direct edges both ways;
// reaches = every module that can transitively reach X (the credential-firewall question shape).
const DEPCRUISE_VERBS: Record<string, string> = { flow: "--focus", reaches: "--reaches" };

function runDepcruise(mode: string, pattern: string): void {
  const res = spawnSync(
    "node_modules/.bin/depcruise",
    ["packages", "--config", ".dependency-cruiser.cjs", "--output-type", "text", mode, pattern],
    { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: DEPCRUISE_MAX_BUFFER_BYTES },
  );
  const out = (res.stdout ?? "").trim();
  console.log(out === "" ? `RESULT ast ${mode} ${pattern}: no edges` : out);
  if (res.status !== 0 && out === "") {
    console.error((res.stderr ?? "").trim());
    process.exitCode = 1;
  }
}

const VERB_LIST = [...Object.keys(VERBS), ...Object.keys(DEPCRUISE_VERBS)].join("|");
const USAGE = [
  `usage: pnpm ast <${VERB_LIST}> <arg> [--in substr] [--files] [--json] [--max n]`,
  "",
  "Symbol-aware workspace search (ts-morph). Prefer this over grep for CODE questions:",
  "it follows aliases/re-exports and ignores comments + string contents.",
  "",
  "  pnpm ast refs MessageView          every real reference to the symbol (defs marked) — slow, exact",
  "  pnpm ast callers sendTurn          call sites (incl. method tails obj.sendTurn())",
  "  pnpm ast importers @orb/ui/badge   who imports a module (static + dynamic import())",
  "  pnpm ast exports preset/lib        exported symbols of a file or dir",
  "  pnpm ast jsx ListRow               JSX usages of a component",
  "  pnpm ast ident probeMode           raw identifier occurrences (fast; comments/strings excluded)",
  "  pnpm ast orphans server            exports never imported anywhere (rot signal)",
  "  pnpm ast testonly server           exports kept alive only by tests (rot signal)",
  "  pnpm ast cycles client             import cycles, alias-resolved — slow, exact",
  "  pnpm ast aliases packages/server   rename-bindings (X as Y / const Y = X / type Y = X)",
  "  pnpm ast flow chat/engine          module graph: X's direct edges both ways (depcruise, text)",
  "  pnpm ast reaches agent-sdk         every module that can transitively reach X (depcruise)",
  "",
  "Flags: --in <substr> path filter · --files per-file counts only (cheapest output) ·",
  "       --max <n> raw-line cap (default 60; big result sets auto-collapse to per-file counts) ·",
  "       --json machine output. Syntactic verbs load in ~10s; refs/cycles resolve types (~30-60s).",
].join("\n");

function main(): void {
  const [verb, arg, ...rest] = process.argv.slice(2);
  if (verb !== undefined && arg !== undefined && DEPCRUISE_VERBS[verb] !== undefined) {
    runDepcruise(DEPCRUISE_VERBS[verb], arg);
    return;
  }
  const run = verb === undefined ? undefined : VERBS[verb];
  if (run === undefined || arg === undefined) {
    console.log(USAGE);
    return;
  }
  run(loadProject(verb === "refs" || verb === "cycles"), arg, parseFlags(rest));
}

try {
  main();
} catch (e) {
  if (e instanceof CodemodError) {
    console.error(`ast: ${e.message}`);
    process.exitCode = 1;
  } else {
    throw e;
  }
}
