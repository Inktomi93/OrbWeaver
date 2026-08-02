#!/usr/bin/env tsx
// pnpm ast — no-script structural search over the whole workspace: symbol layer (ts-morph — refs/
// callers/importers/exports/jsx/ident + rot lenses orphans/testonly/cycles/aliases) and module-graph
// layer (depcruise pass-throughs flow/reaches, same config the gates run). Run bare for full usage
// with examples (the USAGE block below is the doc). Prefer this over grep for CODE questions.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";
import type { ExportDeclaration, ImportDeclaration, Project, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import knipConfig from "../../knip.ts";
import { getWorkspace } from "../ts-workspace.ts";
import { CodemodError } from "./codemod-kit.ts";

const REPO_ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/u, "");

const SNIPPET_CAP = 120;
const DEPCRUISE_MAX_BUFFER_BYTES = 67_108_864; // 64 MiB
const DEFAULT_MAX = 60;
// Past this many hits, raw lines stop helping — collapse to per-file counts (what a reader
// actually wants at that scale: WHERE, not 200 snippets). --max overrides.
const COLLAPSE_THRESHOLD = 60;
const TEST_FILE_RE = /\.(test|ct)\.tsx?$/u;
const WORKSPACE_PACKAGES = ["kit", "contracts", "db", "server", "client", "ui"] as const;
const GLOB_STAR_RE = /\*+/gu;
const TS_SUFFIX_RE = /\.tsx?$/u;
const DOT_SLASH_RE = /^\.\//u;
const BANG_SUFFIX_RE = /!$/u;
const LEADING_SLASHES_RE = /^\/+/u;
const TRAILING_SLASHES_RE = /\/+$/u;
// (declFile, declStart) identity separator — a NUL can never appear in a path or a decimal offset.
const KEY_SEP = "\u0000";

type Flags = { in: string | null; json: boolean; max: number; filesOnly: boolean };
type Hit = { file: string; line: number; kind: string; text: string };

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

/** A test source file (a `.test`/`.ct` file or anything under a `/tests/` tree) — never a prod node. */
function isTestPath(fp: string): boolean {
  return TEST_FILE_RE.test(fp) || fp.includes("/tests/");
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
  const unique = dedupe(hits, flags).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  const files = new Set(unique.map((h) => h.file)).size;
  if (flags.json) {
    const shown = unique.slice(0, flags.max);
    console.log(JSON.stringify({ label, total: unique.length, shown: shown.length, hits: shown }, null, 1));
    return;
  }
  if (flags.filesOnly || (unique.length > Math.max(flags.max, COLLAPSE_THRESHOLD) && flags.max === DEFAULT_MAX)) {
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
  console.log(unique.length === 0 ? `RESULT ast ${label}: no results` : `RESULT ast ${label}: ${unique.length} hit(s)${overflow} in ${files} file(s)`);
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
  const declStarts = new Set(decls.map((d) => `${d.getSourceFile().getFilePath()}:${d.getStart()}`));
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
  const decls: Array<ImportDeclaration | ExportDeclaration> = [...sf.getImportDeclarations(), ...sf.getExportDeclarations()];
  for (const d of decls) {
    // Two independent match strategies, OR'd: (1) the raw specifier text — catches package/#alias specs
    // the caller quotes verbatim (`@orb/ui/badge`); (2) the RESOLVED target file's path — catches relative
    // specs (`../assembly/shape`, `./context`) that share no substring with a file-path query at all. Without
    // (2), querying by file path silently misses every relative importer (a false "0 importers" dead-code
    // signal) — resolution handles relative/#alias/@orb subpath uniformly (same technique as resolvedGraph).
    const raw = d.getModuleSpecifierValue();
    const rawHit = raw?.includes(spec);
    const resolved = d.getModuleSpecifierSourceFile()?.getFilePath();
    const resolvedHit = resolved?.includes(spec);
    if (rawHit || resolvedHit) {
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

// ── Resolution-based liveness (the substrate for orphans + testonly) ──────────────────────────
// The rot lenses answer "is this (declaring-file, export) reached by anyone?" — keyed on RESOLVED
// identity, never bare name. A bare-name lens both over-reports (same-file use invisible; the ~170
// exported *Props class) and MISSES real dead code on name collisions (three `requireParticipant`s,
// two `MemoryLogEntry`s) — see reports/stickler/2026-07-17-knip-testonly-liveness.md §6.
//
// THE KEYING RULE (one rule, both sides): a candidate export and every consumer of it key on the
// ORIGIN DECLARATION NODE — `<declaration's file>` + `<declaration's start offset>` — never on a NAME.
// `getExportedDeclarations()` follows re-export hops to the ORIGIN decl, so a symbol surfaced through N
// barrels still keys to one home; keying on the NODE means an alias on any hop cannot fork that home.
// A name cannot serve as the key half: a renaming barrel (`export { createCreate as createCreateBook }
// from "./create"` — the world-info/portability verb groups) hands the consumer side the ALIAS while the
// candidate side holds the origin's own name, and `export { Inner as Outer }` forks it inside one file.
// That mismatch reported 15 wired verbs as orphans (2026-08-02). The declaration node is the only
// identity BOTH sides observe identically (verified: barrel and origin resolve `createCreateBook` and
// `createCreate` to the same FunctionDeclaration at the same offset). Displayed names still come from
// the origin file's own export map — what a reader should go look for.
//
// WHY THERE IS NO REGISTRY SPECIAL-CASE (investigated 2026-08-03; do not re-litigate without new evidence).
// The repo's string-keyed dispatch tables (the client chrome/modal/section/settings-pane/home-tile
// contributor registries, `TEMPLATE_DEFS`, the 16 `as const satisfies Record<…>` maps across contracts/kit/
// server/ui) look like a consumption seam import-liveness cannot see — they are not. A registry property
// VALUE is either (a) an identifier IMPORTED into the registry file, which `markNamedAlive` resolves to the
// ORIGIN declaration and keys alive, or (b) declared in the same file, which `isReferencedInOwnFile` keeps
// alive. Receipt: `orphans client` reports ZERO — the package where every one of those registries lives.
// A marking pass over registry values could therefore only re-mark already-alive origins, i.e. add a
// false-NEGATIVE surface for nothing.
// THE BOUNDARY CONDITION — this holds ONLY while registry values are inline literals or imported
// identifiers. A registry that resolves its members from a CONSTRUCTED string breaks the guarantee:
// a template-literal dynamic import (`import(\`./features/${name}.ts\`)` — `resolveModule` reads string
// LITERALS only; there are currently ZERO such sites in packages/*/src) or a string-keyed module map that
// names files rather than importing them. The day one lands, the registry-value marking pass is the fix.
//
// THE ERR-ALIVE ARM AND ITS COST (the `swallowed` lens's whole reason to exist). Two consumption arms mark a
// module's ENTIRE export surface alive without naming a single member: `import * as ns` (markModuleAlive) and
// a dynamic `import()`. That is deliberate — a namespace object can be indexed at runtime in ways no static
// pass can enumerate, so erring alive is the only honest verdict for the LIVENESS sets. But it hides rot: db's
// `drizzle(client, { schema })` (packages/db/src/client/index.ts) hands the whole `#schema` namespace to a
// library, which kept the functionally-unused `usersRelations` reading as consumed for five weeks. So liveness
// records, IN PARALLEL, WHICH arm marked each key (`Liveness.arms`) plus every namespace-import SITE and the
// export names it exposes (`Liveness.namespaceSites`). Neither changes a liveness verdict — orphans/testonly/
// clientgap/the ratchet still read the same sets they always did. They exist so `swallowed` can ask the
// narrower question the sets cannot: "is `namespace` this key's ONLY arm, and does no swallowing file ever
// spell the member's name?" EXPIRY: the arm record is only as complete as `markImportConsumption` — a new
// consumption arm (a `require`, a registry-value marking pass, an `export * as ns` treated as consumption)
// MUST record its own arm there, or every key it marks becomes a false swallowed candidate.

/** `<declFile>` + `<declStart>` — the identity a candidate export and every consumer of it agree on. */
function declKey(decl: Node): string {
  return `${decl.getSourceFile().getFilePath()}${KEY_SEP}${decl.getStart()}`;
}

/** The consumption arms a key can be marked alive by. `named` NAMES the member (a named/default import);
 *  `namespace` and `dynamic` mark a module's WHOLE surface without naming anything (the err-alive arms). */
type ConsumptionArm = "named" | "namespace" | "dynamic";

/** Records that `key` was marked alive by `arm`. Kept BESIDE the liveness buckets — recording an arm never
 *  changes who is alive, only what we can say about WHY. */
type ArmRecorder = (key: string, arm: ConsumptionArm) => void;

/** ONE `import * as <alias> from "…"` site: the importing file, the local alias, and the export NAMES the
 *  namespace exposes each origin key under (the spelling an `alias.<member>` access would have to use —
 *  it is the BARREL's name, which a renaming re-export hop can make differ from the origin's own). */
type NamespaceSite = {
  readonly file: SourceFile;
  readonly alias: string;
  readonly exposed: ReadonlyMap<string, readonly string[]>;
};

type Liveness = {
  /** origin-keys reached by a NAMED import / namespace access / dynamic import from PROD code —
   *  the UNION of client + server prod consumption (orphans/testonly/prodonly key on this). */
  usedProd: Set<string>;
  /** the client-package slice of `usedProd` (importing file under `/packages/client/`). */
  usedClientProd: Set<string>;
  /** the non-client (server/kit/contracts/db/ui) slice of `usedProd`. */
  usedServerProd: Set<string>;
  /** same, from TEST paths. */
  usedTest: Set<string>;
  /** files targeted by an `export *` clause somewhere — a candidate there may be reached by a
   *  star-namespace consumer we can't cheaply name; suppress + count it for honesty. */
  starTargets: Set<string>;
  /** origin-key → the consumption ARMS that marked it (prod AND test importers alike — "no named import
   *  reaches it ANYWHERE" is the swallowed question). Never consulted by a liveness verdict. */
  arms: Map<string, Set<ConsumptionArm>>;
  /** every `import * as` site in the workspace — the files `swallowed` re-scans for `alias.<member>`. */
  namespaceSites: NamespaceSite[];
};

/** The client package's src prefix — the seam that buckets prod consumption into client vs server. */
const CLIENT_SRC_PREFIX = "/packages/client/";

/** Decl-key every export of `target` (its own decls AND re-exported ones — getExportedDeclarations
 *  resolves through `export *` and through renaming `export { X as Y } from` hops), added to `bucket`.
 *  Used for namespace imports and dynamic imports, both of which keep a module's WHOLE export surface
 *  alive (err toward alive, never false-dead). The barrel's export NAME is irrelevant here — only the
 *  declarations it resolves to are recorded, which is what makes an alias hop invisible to the key. */
function markModuleAlive(target: SourceFile, bucket: Set<string>, record: ArmRecorder, arm: ConsumptionArm): void {
  for (const decls of target.getExportedDeclarations().values()) {
    for (const d of decls) {
      const key = declKey(d);
      bucket.add(key);
      record(key, arm);
    }
  }
}

/** origin-key → the export NAME(s) `target` surfaces it under. The inverse of `getExportedDeclarations()`,
 *  which is keyed by NAME: a namespace consumer writes `ns.<the barrel's name>`, so the swallowed lens needs
 *  the barrel's spelling for a key it identifies by declaration node. (A key can carry several names — a
 *  barrel may re-export the same declaration twice under different aliases.) */
function exposedNames(target: SourceFile): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [name, decls] of target.getExportedDeclarations()) {
    for (const d of decls) {
      const key = declKey(d);
      out.set(key, [...(out.get(key) ?? []), name]);
    }
  }
  return out;
}

/** Resolve one named-import specifier to its ORIGIN decls and mark them alive. `getExportedDeclarations()
 *  .get(<the name the CONSUMER wrote>)` follows the re-export chain — including renames — to the real
 *  declarations; those declaration nodes ARE the key the candidate side uses, so the consumer's spelling
 *  never enters the identity. */
function markNamedAlive(target: SourceFile, name: string, bucket: Set<string>, record: ArmRecorder): void {
  const decls = target.getExportedDeclarations().get(name);
  if (decls === undefined) {
    return;
  }
  for (const d of decls) {
    const key = declKey(d);
    bucket.add(key);
    record(key, "named");
  }
}

/** Consumption from ONE static import declaration: named specifiers + `import * as` namespaces resolve
 *  to origins. `export { X } from "…"` is a re-export PASS-THROUGH (not consumption — the MemoryLogEntry
 *  miss class: a file re-exporting its own symbol must not mark it "used" and hide deadness elsewhere),
 *  so this only walks IMPORT declarations. */
function markImportConsumption(imp: ImportDeclaration, sink: ConsumptionSink): void {
  const target = imp.getModuleSpecifierSourceFile();
  if (target === undefined) {
    return;
  }
  const ns = imp.getNamespaceImport();
  if (ns !== undefined) {
    const exposed = exposedNames(target);
    for (const key of exposed.keys()) {
      sink.bucket.add(key);
      sink.record(key, "namespace");
    }
    sink.namespaceSites.push({ file: imp.getSourceFile(), alias: ns.getText(), exposed });
    return;
  }
  for (const spec of imp.getNamedImports()) {
    markNamedAlive(target, spec.getName(), sink.bucket, sink.record);
  }
  if (imp.getDefaultImport() !== undefined) {
    markNamedAlive(target, "default", sink.bucket, sink.record);
  }
}

/** Where one importing file's consumption lands: its liveness bucket, the arm recorder, and the shared
 *  namespace-site log. One object so a new arm cannot be added without a place to record it. */
type ConsumptionSink = { readonly bucket: Set<string>; readonly record: ArmRecorder; readonly namespaceSites: NamespaceSite[] };

/** Same-file references: an export used within its own module (a component using its own `*Props`, a
 *  worker's exported-for-test helper called by the file's live loop) is NOT an orphan. Cheap identifier
 *  scan of the declaring file; the declaration's own name node is excluded by the `n > 1` count.
 *  Both spellings are scanned because a file may rename its own export (`const Inner = …; export { Inner
 *  as Outer }`): the export-map name is `Outer` while every in-file use says `Inner`. */
function isReferencedInOwnFile(sf: SourceFile, name: string, decl: Node): boolean {
  // The declaration's OWN symbol name (a TS sentinel such as `__function` for anonymous shapes simply
  // never matches an identifier, so no special-casing is needed).
  const names = new Set([name, decl.getSymbol()?.getName() ?? name]);
  let count = 0;
  for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (names.has(id.getText())) {
      count += 1;
      if (count > 1) {
        return true;
      }
    }
  }
  return false;
}

/** Dynamic `import()` keeps the whole target module alive (the two rot verbs were blind to it while the
 *  `importers` verb saw it — the DevTools/installLongTaskTracer false-orphan class). Walks the file's
 *  `import(…)` calls and marks each resolved target's exports alive in `bucket`. */
function markDynamicImports(sf: SourceFile, project: Project, bucket: Set<string>, record: ArmRecorder): void {
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) {
      continue;
    }
    const arg = call.getArguments()[0];
    if (arg === undefined || !Node.isStringLiteral(arg)) {
      continue;
    }
    const target = resolveModule(project, sf.getDirectoryPath(), arg.getLiteralText());
    if (target !== undefined) {
      markModuleAlive(target, bucket, record, "dynamic");
    }
  }
}

/** Record `export * from "./x"` targets: a member of x may be reached via a namespace consumer of the
 *  re-exporting barrel that we can't name, so it stays a suppress-and-count candidate. Named re-exports
 *  (`export { X } from`) are pass-throughs — deliberately no consumption. */
function collectStarTargets(sf: SourceFile, starTargets: Set<string>): void {
  for (const exp of sf.getExportDeclarations()) {
    if (exp.isNamespaceExport()) {
      const t = exp.getModuleSpecifierSourceFile();
      if (t !== undefined) {
        starTargets.add(t.getFilePath());
      }
    }
  }
}

/** Pick the consumption bucket for an importing file: test path → usedTest; client-package src →
 *  usedClientProd; everything else → usedServerProd. Flat (no nested ternary) for the linter. */
function prodBucketFor(fp: string, buckets: { usedTest: Set<string>; usedClientProd: Set<string>; usedServerProd: Set<string> }): Set<string> {
  if (isTestPath(fp)) {
    return buckets.usedTest;
  }
  return fp.includes(CLIENT_SRC_PREFIX) ? buckets.usedClientProd : buckets.usedServerProd;
}

/** ONE resolution pass over the workspace: builds the prod/test origin-key sets and the star-target set.
 *  Runs in the same ~10s envelope as the old name pass — getModuleSpecifierSourceFile is memoized by
 *  ts-morph after the first resolve. */
function buildLiveness(project: Project): Liveness {
  const usedClientProd = new Set<string>();
  const usedServerProd = new Set<string>();
  const usedTest = new Set<string>();
  const starTargets = new Set<string>();
  const arms = new Map<string, Set<ConsumptionArm>>();
  const namespaceSites: NamespaceSite[] = [];
  const record: ArmRecorder = (key, arm) => {
    const set = arms.get(key) ?? new Set<ConsumptionArm>();
    set.add(arm);
    arms.set(key, set);
  };
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    // Prod consumption is bucketed by the IMPORTING file's package (client vs everything-else); a test
    // path always wins into usedTest. clientgap reads the split; orphans/testonly/prodonly read the union.
    const bucket = prodBucketFor(fp, { usedTest, usedClientProd, usedServerProd });
    for (const imp of sf.getImportDeclarations()) {
      markImportConsumption(imp, { bucket, record, namespaceSites });
    }
    collectStarTargets(sf, starTargets);
    markDynamicImports(sf, project, bucket, record);
  }
  const usedProd = new Set<string>([...usedClientProd, ...usedServerProd]);
  return { usedProd, usedClientProd, usedServerProd, usedTest, starTargets, arms, namespaceSites };
}

const MODULE_FILE_EXTS = [".ts", ".tsx"] as const;

/** Resolve a relative import specifier to its workspace source file (used for dynamic `import()` — which
 *  ts-morph gives no resolution primitive for). Non-relative specs (#alias/@orb) are left unresolved here;
 *  the dev-only dynamic imports that mattered for the false-orphan class are all relative. */
function resolveModule(project: Project, fromDir: string, spec: string): SourceFile | undefined {
  if (!spec.startsWith(".")) {
    return;
  }
  const base = `${fromDir}/${spec}`;
  const candidates = [base, ...MODULE_FILE_EXTS.map((e) => `${base}${e}`), ...MODULE_FILE_EXTS.map((e) => `${base}/index${e}`)];
  return candidates.map((c) => project.getSourceFile(c)).find((sf) => sf !== undefined);
}

type Scope = { prefix: string; label: string };

/** Normalize a scope arg into a path SUBSTRING the file-loop matches on. A bare package name becomes the
 *  package src prefix; a path form (`packages/server/src/x`, with or without a leading `/`) becomes that
 *  path wrapped so `.includes()` bites. The scope is NOT trusted — the caller proves it matches ≥1 file. */
function normalizeScope(arg: string): Scope {
  const cleaned = arg.replace(LEADING_SLASHES_RE, "").replace(TRAILING_SLASHES_RE, "");
  if ((WORKSPACE_PACKAGES as readonly string[]).includes(cleaned)) {
    return { prefix: `/packages/${cleaned}/src/`, label: cleaned };
  }
  if (cleaned.startsWith("packages/")) {
    return { prefix: `/${cleaned}`, label: cleaned };
  }
  // Bare, non-package word (a typo, or a sub-path missing its `packages/` root) — build the most likely
  // intended prefix and let the file-count gate reject it with a spelling hint.
  return { prefix: `/packages/${cleaned}`, label: cleaned };
}

/** Resolve + VALIDATE a scope arg for the rot verbs. A scope that matches zero non-test source files is a
 *  tool error (the `/packages/packages/…` silent-green footgun — a bad arg once read as a clean package),
 *  so it prints what was tried + a suggestion and exits 2. Never returns a zero-file scope. */
function resolveScope(project: Project, arg: string, verb: string): Scope {
  const scope = normalizeScope(arg);
  const matched = project.getSourceFiles().some((sf) => {
    const fp = sf.getFilePath();
    return fp.includes(scope.prefix) && !TEST_FILE_RE.test(fp);
  });
  if (matched) {
    return scope;
  }
  const guess = WORKSPACE_PACKAGES.find((p) => arg.includes(p));
  const hint =
    guess === undefined
      ? `expected one of: ${WORKSPACE_PACKAGES.join(", ")}, or a path like packages/server/src/domain`
      : `did you mean \`pnpm ast ${verb} ${guess}\` (a package name), or a path under packages/${guess}/src/?`;
  console.error(`ast ${verb}: scope "${arg}" (tried path substring "${scope.prefix}") matched no source files — ${hint}`);
  process.exit(2);
}

/** A candidate export of `sf` that a consumer might reach: `(name, first-decl)` for each export whose
 *  ORIGIN is `sf` (re-export slots — decls that live elsewhere — belong to their own file, not here). */
export function* ownExports(sf: SourceFile): Generator<{ name: string; decl: Node }> {
  const fp = sf.getFilePath();
  for (const [name, decls] of sf.getExportedDeclarations()) {
    const d = decls[0];
    if (d !== undefined && d.getSourceFile().getFilePath() === fp) {
      yield { name, decl: d };
    }
  }
}

/** ONE orphan candidate — its export NAME plus the ORIGIN declaration node (the identity everything keys
 *  on, and the node a reader of leading comments needs). `starSuppressed` = the declaring file is the
 *  target of an `export *` somewhere, so a namespace consumer we cannot cheaply name MIGHT reach it: the
 *  candidate is reported and NAMED, but never counted as a hit. This is the SHARED substrate — the
 *  `orphans` verb prints it and the push-tier ratchet (`scripts/verify/orphan-export-ratchet.ts`) judges
 *  it, so there is exactly one definition of "orphan candidate" in the repo. */
export type OrphanCandidate = {
  readonly name: string;
  readonly decl: Node;
  readonly starSuppressed: boolean;
};

/** Every orphan candidate whose DECLARING file satisfies `inScope` — exports reached by nobody (prod or
 *  test) and unused in their own file. Pure enumeration: no printing, no exemption policy (the ratchet
 *  owns `@public`; the verb owns the display). */
export function collectOrphanCandidates(project: Project, live: Liveness, inScope: (filePath: string) => boolean): OrphanCandidate[] {
  const out: OrphanCandidate[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (!inScope(fp) || TEST_FILE_RE.test(fp)) {
      continue;
    }
    for (const { name, decl } of ownExports(sf)) {
      const key = declKey(decl);
      if (live.usedProd.has(key) || live.usedTest.has(key) || isReferencedInOwnFile(sf, name, decl)) {
        continue;
      }
      out.push({ name, decl, starSuppressed: live.starTargets.has(fp) });
    }
  }
  return out;
}

/** Is this ORIGIN declaration reached by a prod (non-test) consumer? The keying lives here, never at a
 *  caller: the ratchet's stale-`@public` arm asks this question and must not re-derive `declKey`. */
export function isProdConsumed(live: Liveness, decl: Node): boolean {
  return live.usedProd.has(declKey(decl));
}

/** A candidate as a printable Hit — `<name>  —  <declaration line>`, the form both lists use. */
function candidateHit(candidate: OrphanCandidate, kind: string): Hit {
  const h = hitOf(candidate.decl, kind);
  h.text = `${candidate.name}  —  ${h.text}`;
  return h;
}

/** Name every star-suppressed candidate (file:line + symbol), never a bare per-file count: the 14 hidden
 *  contracts/rpg candidates are the ones a reader must actually go look at, and "8 files" told them
 *  nothing. Capped by `--max` with an explicit elision line (the count is always exact). */
function printSuppressed(suppressed: readonly Hit[], hitCount: number, flags: Flags): void {
  if (suppressed.length === 0) {
    return;
  }
  const unique = dedupe([...suppressed], flags).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  if (unique.length === 0) {
    return;
  }
  const files = new Set(unique.map((h) => h.file)).size;
  console.log(
    `orphans: ${unique.length} of ${hitCount + unique.length} candidate(s) SUPPRESSED by star re-exports in ${files} file(s) — named below, NOT counted as hits (a namespace consumer of the re-exporting barrel may reach them):`,
  );
  for (const h of unique.slice(0, flags.max)) {
    console.log(`  ~ ${h.file}:${h.line}  [${h.kind}]  ${h.text}`);
  }
  if (unique.length > flags.max) {
    console.log(`  … and ${unique.length - flags.max} more (raise --max)`);
  }
}

/** Exports of a scope never imported anywhere (prod OR test) and never used in their own file — the rot
 *  signal. Star-suppressed candidates are counted + named PER SYMBOL, never silently swallowed (the
 *  permanent-zero `orphans contracts` bug: 100%-barrel packages reported clean while blind). */
function cmdOrphans(project: Project, arg: string, flags: Flags): void {
  const scope = resolveScope(project, arg, "orphans");
  const live = buildLiveness(project);
  const candidates = collectOrphanCandidates(project, live, (fp) => fp.includes(scope.prefix));
  const hits = candidates.filter((c) => !c.starSuppressed).map((c) => candidateHit(c, "orphan-export"));
  const suppressed = candidates.filter((c) => c.starSuppressed).map((c) => candidateHit(c, "star-suppressed"));
  printSuppressed(suppressed, dedupe(hits, flags).length, flags);
  emit(hits, flags, `orphans ${scope.label}`);
}

function scanTestOnly(sf: SourceFile, live: Liveness): Hit[] {
  const out: Hit[] = [];
  for (const { name, decl } of ownExports(sf)) {
    const key = declKey(decl);
    // Prod-reached (named import, namespace, dynamic import, or same-file production use) → alive, skip.
    if (live.usedProd.has(key) || isReferencedInOwnFile(sf, name, decl)) {
      continue;
    }
    if (!live.usedTest.has(key)) {
      continue;
    }
    const h = hitOf(decl, "test-only-export");
    h.text = `${name}  —  ${h.text}`;
    out.push(h);
  }
  return out;
}

/** Exports of `<scope>` reached ONLY from test paths — code alive solely because a test imports it. */
function cmdTestOnly(project: Project, arg: string, flags: Flags): void {
  const scope = resolveScope(project, arg, "testonly");
  const live = buildLiveness(project);
  const hits: Hit[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (fp.includes(scope.prefix) && !TEST_FILE_RE.test(fp)) {
      hits.push(...scanTestOnly(sf, live));
    }
  }
  emit(hits, flags, `testonly ${scope.label}`);
}

// ── prodonly: entry-closure FILE reachability (the knip Unused-files lens) ─────────────────────
// testonly/orphans are SYMBOL lenses; prodonly is the FILE lens they can't be. It walks the resolved
// import graph from the workspace's real PRODUCTION entry points and reports source files no entry can
// reach — the instrument that sees the whole rpg pending-seam cluster (dead FILES, not dead symbols).
//
// A file reachable ONLY from a test is prod-unreachable BY DESIGN of this lens (that's its whole point —
// it complements testonly). So tests/ + scripts/ are NOT entries and NOT graph nodes here.

/** The production entry FILES, derived honestly from the two authorities (never a parallel definition):
 *   1. knip.ts's per-workspace `entry` globs (kit/contracts/db = every nested barrel index, client = html);
 *   2. each package.json `exports` map (the auto-detected surface for ui/server/client) — Node resolves
 *      `./*` across slashes, so every nested `index.ts` addressable as a subpath is an entry.
 *  The `!` production markers are stripped (they already mean "production entry"). index.html isn't a
 *  source file, so its `<script type=module>` target `src/main.tsx` stands in (knip's own auto-detection). */
function deriveEntryFiles(project: Project): Set<string> {
  const entries = new Set<string>();
  const add = (fp: string): void => {
    if (project.getSourceFile(fp) !== undefined) {
      entries.add(fp);
    }
  };
  for (const pkg of WORKSPACE_PACKAGES) {
    const dir = `${REPO_ROOT}/packages/${pkg}`;
    for (const glob of knipEntryGlobs(pkg)) {
      addGlobMatches(project, `${dir}/${glob}`, entries);
    }
    for (const rel of exportsEntryPaths(dir)) {
      addGlobMatches(project, `${dir}/${rel}`, entries);
    }
  }
  add(`${REPO_ROOT}/packages/client/src/main.tsx`); // index.html <script> target
  add(`${REPO_ROOT}/packages/ui/src/tokens/tokens.build.ts`); // the tokens:build package script
  return entries;
}

// knip.ts's explicit entry globs for a workspace, bang-stripped and index.html-dropped (not a source
// file — its resolved target is added separately). Empty for auto-from-exports workspaces (ui/server).
function knipEntryGlobs(pkg: string): string[] {
  const workspaces = (knipConfig as { workspaces?: Record<string, { entry?: string | string[] }> }).workspaces ?? {};
  const entry = workspaces[`packages/${pkg}`]?.entry ?? [];
  const globs = Array.isArray(entry) ? entry : [entry];
  return globs.map((g) => g.replace(BANG_SUFFIX_RE, "")).filter((g) => TS_SUFFIX_RE.test(g));
}

// The .ts/.tsx targets of a package.json exports map (relative to the package dir), stars kept as glob
// tokens for the resolver. This is the entry surface knip auto-detects for ui/server/client.
function exportsEntryPaths(pkgDir: string): string[] {
  const raw = readFileSync(`${pkgDir}/package.json`, "utf8");
  const exp = (JSON.parse(raw) as { exports?: Record<string, string> }).exports ?? {};
  return Object.values(exp)
    .filter((v) => typeof v === "string" && TS_SUFFIX_RE.test(v))
    .map((v) => v.replace(DOT_SLASH_RE, ""));
}

/** Add every project source file matching an absolute glob (`*` = one path segment, `**` = many) to `set`.
 *  Node's exports `*` matches across slashes, so a single-`*` exports pattern is treated as `**` here. */
function addGlobMatches(project: Project, absGlob: string, set: Set<string>): void {
  if (!absGlob.includes("*")) {
    if (project.getSourceFile(absGlob) !== undefined) {
      set.add(absGlob);
    }
    return;
  }
  const re = globToRegExp(absGlob);
  for (const sf of project.getSourceFiles()) {
    if (re.test(sf.getFilePath())) {
      set.add(sf.getFilePath());
    }
  }
}

const GLOB_META_RE = /[.+^${}()|[\]\\]/gu;

// Absolute glob to anchored RegExp. Every run of stars matches any chars incl slashes (Node exports
// semantics: a single-star exports pattern such as the contracts/db one addresses every nested index).
function globToRegExp(absGlob: string): RegExp {
  const escaped = absGlob.replace(GLOB_META_RE, "\\$&").replace(GLOB_STAR_RE, ".*");
  return new RegExp(`^${escaped}$`, "u");
}

// Resolved out-edges of a file: every static import / re-export target (named, namespace, star, alias,
// and @orb subpath all resolve via getModuleSpecifierSourceFile) plus dynamic import() targets.
function fileEdges(sf: SourceFile, project: Project): SourceFile[] {
  const out: SourceFile[] = [];
  for (const d of [...sf.getImportDeclarations(), ...sf.getExportDeclarations()]) {
    const t = d.getModuleSpecifierSourceFile();
    if (t !== undefined) {
      out.push(t);
    }
  }
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) {
      continue;
    }
    const arg = call.getArguments()[0];
    if (arg !== undefined && Node.isStringLiteral(arg)) {
      const t = resolveModule(project, sf.getDirectoryPath(), arg.getLiteralText());
      if (t !== undefined) {
        out.push(t);
      }
    }
  }
  return out;
}

/** Files reachable from the entry set by a resolved-edge BFS (no test files as nodes — a test importer
 *  cannot keep a prod file alive in this lens). */
function reachableFrom(entries: Set<string>, project: Project): Set<string> {
  const seen = new Set<string>(entries);
  const stack = [...entries];
  while (stack.length > 0) {
    const fp = stack.pop();
    const sf = fp === undefined ? undefined : project.getSourceFile(fp);
    if (sf === undefined) {
      continue;
    }
    for (const t of fileEdges(sf, project)) {
      const tp = t.getFilePath();
      if (!(seen.has(tp) || isTestPath(tp))) {
        seen.add(tp);
        stack.push(tp);
      }
    }
  }
  return seen;
}

/** Source FILES in `<scope>` no production entry can reach (the knip Unused-files verdict, entry-closure
 *  from the package exports maps). A file reached only from a test is prod-unreachable — the point of the
 *  lens. Complements testonly's per-symbol view. */
function cmdProdOnly(project: Project, arg: string, flags: Flags): void {
  const scope = resolveScope(project, arg, "prodonly");
  const reachable = reachableFrom(deriveEntryFiles(project), project);
  const hits: Hit[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    // `.d.ts` ambient declarations are consumed by the type system, never by an import edge — they are
    // never "reachable" and are not orphans (knip excludes them from unused-files too).
    if (fp.includes(scope.prefix) && !TEST_FILE_RE.test(fp) && !fp.endsWith(".d.ts") && !reachable.has(fp)) {
      hits.push(hitOf(sf, "prod-unreachable"));
    }
  }
  emit(hits, flags, `prodonly ${scope.label} (entry closure from package.json exports + knip.ts entries)`);
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
      if (target?.includes(prefix) && target !== from) {
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

// ── unwired: server tRPC procedures with NO client consumer (the PD-138 blind spot) ────────────
// Import-based liveness CANNOT see this — the client consumes a procedure through the typed proxy
// (`trpc.<ns>.<proc>` / `Trpc["<ns>"]["<proc>"]`), never an import edge to the server router. So we
// enumerate both surfaces STRUCTURALLY and diff them:
//   • server: every `t.router({ … })` object-literal, wired to its appRouter namespace, keyed
//     `<ns>.<proc>` (loose root procs — health/echo/clientError — key on their bare name).
//   • client: every `trpc.<ns>.<proc>` property-access chain AND `Trpc["<ns>"]["<proc>"]` indexed
//     type, scanned across client prod (non-test) files.
// `serverProcedures − clientConsumed` is emitted at each unwired procedure's SERVER definition site.

/** The full name a server procedure and its client consumer agree on: `<ns>.<proc>`, or bare `<proc>`
 *  for a loose root procedure (namespace ""). */
function procFullName(ns: string, proc: string): string {
  return ns === "" ? proc : `${ns}.${proc}`;
}

/** The object-literal keys of a `t.router({ … })` call — the procedure/sub-router names. Returns null
 *  if `node` is not a `t.router(objectLiteral)` call (so a caller can probe any expression cheaply). */
function routerObjectKeys(node: Node): string[] | null {
  if (!Node.isCallExpression(node)) {
    return null;
  }
  const expr = node.getExpression();
  if (!(Node.isPropertyAccessExpression(expr) && expr.getName() === "router")) {
    return null;
  }
  const arg = node.getArguments()[0];
  if (arg === undefined || !Node.isObjectLiteralExpression(arg)) {
    return null;
  }
  const keys: string[] = [];
  for (const prop of arg.getProperties()) {
    if (Node.isPropertyAssignment(prop) || Node.isShorthandPropertyAssignment(prop)) {
      const nameNode = prop.getNameNode();
      keys.push(Node.isStringLiteral(nameNode) ? nameNode.getLiteralText() : nameNode.getText());
    }
  }
  return keys;
}

/** Resolve an appRouter property VALUE (a sub-router identifier like `pluginRouter`) to the `t.router`
 *  call that defines it, following the variable declaration's initializer. */
function resolveRouterInitializer(value: Node): Node | undefined {
  if (!Node.isIdentifier(value)) {
    return;
  }
  return value
    .getDefinitionNodes()
    .filter((d) => Node.isVariableDeclaration(d))
    .map((d) => d.getInitializer())
    .find((init) => init !== undefined && routerObjectKeys(init) !== null);
}

type ServerProc = { full: string; decl: Node };

/** Enumerate every server tRPC procedure as `<ns>.<proc>` (loose root procs bare), each paired with its
 *  definition site (the object-literal property — the node the unwired hit points at). Derived from the
 *  root `appRouter = t.router({ … })`: an identifier value is a namespaced sub-router; any other value
 *  (a `publicProcedure…` chain) is a loose root procedure keyed on its own name. */
function collectServerProcedures(project: Project): ServerProc[] {
  const out: ServerProc[] = [];
  for (const sf of project.getSourceFiles()) {
    for (const v of sf.getVariableDeclarations()) {
      if (v.getName() !== "appRouter") {
        continue;
      }
      const init = v.getInitializer();
      const arg = init !== undefined && Node.isCallExpression(init) ? init.getArguments()[0] : undefined;
      if (arg === undefined || !Node.isObjectLiteralExpression(arg)) {
        continue;
      }
      collectFromAppRouter(arg, out);
    }
  }
  return out;
}

/** Walk the appRouter object-literal: each property is a namespaced sub-router (identifier value → its
 *  `t.router` keys) or a loose root procedure (any other value → its own name). */
function collectFromAppRouter(appLiteral: Node, out: ServerProc[]): void {
  if (!Node.isObjectLiteralExpression(appLiteral)) {
    return;
  }
  for (const prop of appLiteral.getProperties()) {
    if (!Node.isPropertyAssignment(prop)) {
      continue;
    }
    const ns = prop.getName();
    const value = prop.getInitializerOrThrow();
    const subRouter = resolveRouterInitializer(value);
    if (subRouter === undefined) {
      // A loose root procedure (`health: publicProcedure.query(…)`) — bare name, defined right here.
      out.push({ full: procFullName("", ns), decl: prop });
      continue;
    }
    for (const proc of routerObjectKeys(subRouter) ?? []) {
      out.push({ full: procFullName(ns, proc), decl: procDeclNode(subRouter, proc) });
    }
  }
}

/** The definition node for procedure `proc` inside a `t.router({ … })` call — its object-literal property
 *  (so an unwired hit points at the verb), falling back to the router call itself. */
function procDeclNode(routerCall: Node, proc: string): Node {
  if (Node.isCallExpression(routerCall)) {
    const arg = routerCall.getArguments()[0];
    if (arg !== undefined && Node.isObjectLiteralExpression(arg)) {
      const match = arg.getProperties().find((p) => (Node.isPropertyAssignment(p) || Node.isShorthandPropertyAssignment(p)) && p.getName() === proc);
      if (match !== undefined) {
        return match;
      }
    }
  }
  return routerCall;
}

/** `<ns>.<proc>` full names the CLIENT consumes, from prod (non-test) client files: property-access
 *  chains `X.<ns>.<proc>` (root identifier untrusted — matched by the known namespace+proc pair) and
 *  indexed-access types `Trpc["<ns>"]["<proc>"]`. Loose root procs match a bare `X.<proc>` chain. */
function collectClientConsumed(project: Project, valid: Set<string>): Set<string> {
  const consumed = new Set<string>();
  const looseProcs = new Set([...valid].filter((f) => !f.includes(".")));
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (!fp.includes(CLIENT_SRC_PREFIX) || isTestPath(fp)) {
      continue;
    }
    for (const pa of sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
      markConsumedFromAccess(pa, valid, looseProcs, consumed);
    }
    for (const ia of sf.getDescendantsOfKind(SyntaxKind.IndexedAccessType)) {
      markConsumedFromIndexedType(ia, valid, consumed);
    }
  }
  return consumed;
}

/** A `X.<ns>.<proc>` access marks `<ns>.<proc>` consumed; a `X.<proc>` access whose tail is a known loose
 *  root procedure marks that bare name consumed. */
function markConsumedFromAccess(pa: Node, valid: Set<string>, looseProcs: Set<string>, consumed: Set<string>): void {
  if (!Node.isPropertyAccessExpression(pa)) {
    return;
  }
  const proc = pa.getName();
  const inner = pa.getExpression();
  if (Node.isPropertyAccessExpression(inner)) {
    const full = `${inner.getName()}.${proc}`;
    if (valid.has(full)) {
      consumed.add(full);
    }
  }
  if (looseProcs.has(proc)) {
    consumed.add(proc);
  }
}

/** A `Trpc["<ns>"]["<proc>"]` indexed type marks `<ns>.<proc>` consumed — the type-level consumption the
 *  import-liveness is blind to. */
function markConsumedFromIndexedType(ia: Node, valid: Set<string>, consumed: Set<string>): void {
  if (!Node.isIndexedAccessTypeNode(ia)) {
    return;
  }
  const outerKey = literalOfIndex(ia.getIndexTypeNode());
  const objectType = ia.getObjectTypeNode();
  if (outerKey === undefined || !Node.isIndexedAccessTypeNode(objectType)) {
    return;
  }
  const nsKey = literalOfIndex(objectType.getIndexTypeNode());
  if (nsKey === undefined) {
    return;
  }
  const full = `${nsKey}.${outerKey}`;
  if (valid.has(full)) {
    consumed.add(full);
  }
}

/** The string value of a literal type index node (`"list"` → `list`), else undefined. */
function literalOfIndex(node: Node): string | undefined {
  if (!Node.isLiteralTypeNode(node)) {
    return;
  }
  const lit = node.getLiteral();
  return Node.isStringLiteral(lit) ? lit.getLiteralText() : undefined;
}

// The two HONEST exemption categories for a client-unconsumed procedure — each a distinct marker whose
// NAME states the truth (never the old catch-all `@unwired-exempt`, which conflated them):
//   • @server-only: <reason>   — no client consumer BY DESIGN; the proc is not a UI surface at all
//                                (break-glass admin KV, ops-only escape hatches). It ships to serve
//                                server/ops callers, never the front-end.
//   • @test-fixture: <reason>  — a prod-router proc kept alive as a DELIBERATE, ratified always-ship
//                                fixture for a test or the cross-tenant sweep (the CT typed-read template,
//                                the sweep's own IDOR probe target). Its only consumer is a test — and
//                                that is on purpose, stated here.
// Both require a non-empty reason after the colon (mirrors `biome-ignore` discipline — a bare marker with
// no rationale is not a legal exemption).
const SERVER_ONLY_RE = /@server-only:\s*\S/u;
const TEST_FIXTURE_RE = /@test-fixture:\s*\S/u;

/** True if `decl` (the procedure's object-literal property) carries a leading `// @server-only: <reason>`
 *  or `// @test-fixture: <reason>` comment — the two honest reasons a client never consumes it. The reason
 *  is required; a bare marker (empty after the colon) does NOT exempt. */
function isUnwiredExempt(decl: Node): boolean {
  return decl.getLeadingCommentRanges().some((range) => {
    const text = range.getText();
    return SERVER_ONLY_RE.test(text) || TEST_FIXTURE_RE.test(text);
  });
}

/** Server tRPC procedures no client file consumes (via the typed proxy or a `Trpc[…]` inference) — the
 *  import-liveness blind spot that ships a verb the front-end never wires. Optional scope = a `<ns>.<proc>`
 *  full-name substring (a router name); default = all procedures. A procedure marked
 *  `// @server-only: <reason>` (no client consumer by design) or `// @test-fixture: <reason>` (a deliberate
 *  always-ship test/sweep fixture) is excluded from the report. */
function cmdUnwired(project: Project, scope: string, flags: Flags): void {
  const procs = collectServerProcedures(project);
  const valid = new Set(procs.map((p) => p.full));
  const consumed = collectClientConsumed(project, valid);
  const hits: Hit[] = [];
  for (const { full, decl } of procs) {
    if (consumed.has(full) || (scope !== "" && !full.includes(scope)) || isUnwiredExempt(decl)) {
      continue;
    }
    const h = hitOf(decl, "unwired-proc");
    h.text = `${full}  —  ${h.text}`;
    hits.push(h);
  }
  emit(hits, flags, `unwired${scope === "" ? "" : ` ${scope}`} (${procs.length} server procedure(s) enumerated)`);
}

// ── clientgap: client-facing contract exports the SERVER consumes but the CLIENT never does ─────
// The liveness extension: an export in usedServerProd but NOT usedClientProd and NOT usedTest. Raw this
// is noisy (server-only contracts are legion), so default-scope is `@orb/contracts` filtered to the
// client-facing WIRE shapes (a `*View`/`*Summary` name heuristic — the surface a UI actually renders).
// CANDIDATE lens (like orphans): a hit may be client-consumed via a re-exported barrel or a `Trpc[…]`
// inference the import-liveness can't see — VERIFY before acting.

const CLIENT_FACING_SUFFIX_RE = /(View|Summary)$/u;
const CONTRACTS_SRC_PREFIX = "/packages/contracts/src/";

/** Exports of a scope the SERVER prod-consumes but the CLIENT never does (and no test does) — a wire
 *  shape that never made it to the front-end. Default scope `contracts`, filtered to `*View`/`*Summary`
 *  client-facing names; a path/package scope overrides. A CANDIDATE lens — verify, don't act blind. */
function cmdClientGap(project: Project, arg: string, flags: Flags): void {
  const scoped = arg === "" ? "contracts" : arg;
  const scope = resolveScope(project, scoped, "clientgap");
  const isContracts = scope.prefix.includes(CONTRACTS_SRC_PREFIX);
  const live = buildLiveness(project);
  const hits: Hit[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (!fp.includes(scope.prefix) || TEST_FILE_RE.test(fp)) {
      continue;
    }
    for (const { name, decl } of ownExports(sf)) {
      const key = declKey(decl);
      const gap = live.usedServerProd.has(key) && !live.usedClientProd.has(key) && !live.usedTest.has(key);
      // On the default contracts scope, gate to client-facing wire names (else it floods with server-only
      // contracts). A caller-supplied scope trusts the caller — report every gap in it.
      if (!gap || (isContracts && !CLIENT_FACING_SUFFIX_RE.test(name))) {
        continue;
      }
      const h = hitOf(decl, "client-gap");
      h.text = `${name}  —  ${h.text}`;
      hits.push(h);
    }
  }
  console.log(
    "clientgap is a CANDIDATE lens — a contract may be client-consumed via a re-exported barrel or a `Trpc[…]` inference the import-liveness can't see; verify before acting.",
  );
  emit(hits, flags, `clientgap ${scope.label}${isContracts ? " (client-facing *View/*Summary names)" : ""}`);
}

// ── swallowed: exports alive ONLY because a namespace import swallowed the whole module ─────────
// The rot-hider class, proven on the real tree: `packages/db/src/client/index.ts` does
// `import * as schema from "#schema"` and hands the namespace to `drizzle(client, { schema })`. That single
// import marks EVERY schema export alive (markModuleAlive's deliberate err-alive arm), so a functionally
// unused export inside the barrel reads as consumed forever — `usersRelations` did, for five weeks.
//
// The lens reports exports whose ONLY liveness arm is `namespace` AND whose member NAME no swallowing file
// ever spells (`ns.member`, `ns["member"]`, `const { member } = ns`) AND that no named import reaches
// anywhere (prod or test) AND that their own file never uses. An export the swallowing file passes
// WHOLESALE into a call — the drizzle shape — is exactly what stays a candidate: that is the class.
//
// CANDIDATE lens, never a death sentence: the swallowing API may itself use the member (drizzle DOES read a
// `relations()` config when one is present). It finds candidates for a HUMAN verdict. A deliberate keep is
// tagged `// @swallowed-ok: <reason>` on the declaration, and that tag is TWO-SIDED — a tag on an export the
// lens no longer considers swallowed is reported STALE and exits 1.

const SWALLOWED_OK_RE = /@swallowed-ok:\s*\S/u;

/** The node whose LEADING comments document a declaration. A `// …` line above `export const x = …` attaches
 *  to the VariableStatement, not to the VariableDeclaration `getExportedDeclarations()` hands back — reading
 *  comments off the declaration alone would make every `const`-shaped marker invisible. */
function commentHost(decl: Node): Node {
  return decl.getFirstAncestorByKind(SyntaxKind.VariableStatement) ?? decl;
}

/** True if the declaration carries a leading `// @swallowed-ok: <reason>` — a deliberate keep of an export
 *  only a namespace consumer reaches. The reason is required (bare marker does NOT exempt, as with
 *  `@server-only:`/`@test-fixture:` at the unwired lens). */
export function isSwallowedExempt(decl: Node): boolean {
  return commentHost(decl)
    .getLeadingCommentRanges()
    .some((range) => SWALLOWED_OK_RE.test(range.getText()));
}

/** Every member name a namespace-importing file SPELLS on its `import * as <alias>` binding: `alias.member`,
 *  `alias["member"]`, and `const { member } = alias`. A member named here is genuinely consumed — it is the
 *  arm that separates "the module was swallowed" from "this export was actually used through it". */
function namedMembersOf(site: NamespaceSite): Set<string> {
  const named = new Set<string>();
  for (const pa of site.file.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    if (pa.getExpression().getText() === site.alias) {
      named.add(pa.getName());
    }
  }
  for (const ea of site.file.getDescendantsOfKind(SyntaxKind.ElementAccessExpression)) {
    const arg = ea.getArgumentExpression();
    if (ea.getExpression().getText() === site.alias && arg !== undefined && Node.isStringLiteral(arg)) {
      named.add(arg.getLiteralText());
    }
  }
  for (const v of site.file.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const init = v.getInitializer();
    const binding = v.getNameNode();
    if (init?.getText() !== site.alias || !Node.isObjectBindingPattern(binding)) {
      continue;
    }
    for (const element of binding.getElements()) {
      named.add((element.getPropertyNameNode() ?? element.getNameNode()).getText());
    }
  }
  return named;
}

/** ONE swallowed candidate: the export, plus the namespace-import sites that are its ENTIRE liveness (the
 *  files a human must read to render the verdict — "does the API this namespace is handed to use it?"). */
export type SwallowedCandidate = {
  readonly name: string;
  readonly decl: Node;
  readonly sites: readonly string[];
};

/** Exports of `inScope` whose only liveness arm is `namespace` and whose name no swallowing file spells.
 *  Pure enumeration — no exemption policy, no printing (the verb owns both), so the self-test drives the
 *  same function the CLI does. */
export function collectSwallowedCandidates(project: Project, live: Liveness, inScope: (filePath: string) => boolean): SwallowedCandidate[] {
  const spelledAt = memoizedSpelledMembers();
  const out: SwallowedCandidate[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (inScope(fp) && !TEST_FILE_RE.test(fp)) {
      out.push(...swallowedInFile(sf, live, spelledAt));
    }
  }
  return out;
}

/** `namedMembersOf` behind a per-run cache: without it every candidate re-walks every swallowing file's
 *  identifiers (the `#schema` barrel has one namespace site per consumer and dozens of exports). */
function memoizedSpelledMembers(): (site: NamespaceSite) => Set<string> {
  const cache = new Map<NamespaceSite, Set<string>>();
  return (site) => {
    const hit = cache.get(site);
    if (hit !== undefined) {
      return hit;
    }
    const fresh = namedMembersOf(site);
    cache.set(site, fresh);
    return fresh;
  };
}

/** ONE file's swallowed candidates — the three exclusions in order: a non-namespace arm reached it (a NAMED
 *  import anywhere, or a dynamic import — a different err-alive shape), its own file uses it, or a swallowing
 *  file spells its name. Nothing reaching it at all is an `orphans` hit, not this lens's business. */
function swallowedInFile(sf: SourceFile, live: Liveness, spelledAt: (site: NamespaceSite) => Set<string>): SwallowedCandidate[] {
  const out: SwallowedCandidate[] = [];
  for (const { name, decl } of ownExports(sf)) {
    const key = declKey(decl);
    const arms = live.arms.get(key);
    if (arms === undefined || arms.size !== 1 || !arms.has("namespace") || isReferencedInOwnFile(sf, name, decl)) {
      continue;
    }
    const sites = live.namespaceSites.filter((s) => s.exposed.has(key));
    if (sites.some((s) => (s.exposed.get(key) ?? []).some((exportName) => spelledAt(s).has(exportName)))) {
      continue;
    }
    out.push({ name, decl, sites: sites.map((s) => relPath(s.file.getFilePath())).sort(byProdFirst) });
  }
  return out;
}

/** Swallowing sites sort SHIPPED code first: the hit only shows the first couple, and the site that decides
 *  the verdict is the production one (db's `drizzle(client, { schema })`), not a test helper that happens to
 *  namespace-import the same barrel. */
function byProdFirst(a: string, b: string): number {
  const rank = (p: string): number => (p.startsWith("packages/") && !isTestPath(`/${p}`) ? 0 : 1);
  return rank(a) - rank(b) || a.localeCompare(b);
}

/** Repo-relative form of an absolute workspace path (the form every Hit prints). */
function relPath(full: string): string {
  return full.startsWith(`${REPO_ROOT}/`) ? full.slice(REPO_ROOT.length + 1) : full;
}

/** How many swallowing sites a hit names before it collapses to a count — the drizzle-shaped `#schema`
 *  namespace is imported from many files and the list is not the point, the FIRST one is. */
const SWALLOW_SITES_SHOWN = 2;

function swallowedHit(candidate: SwallowedCandidate): Hit {
  const shown = candidate.sites.slice(0, SWALLOW_SITES_SHOWN).join(", ");
  const more = candidate.sites.length > SWALLOW_SITES_SHOWN ? ` +${candidate.sites.length - SWALLOW_SITES_SHOWN} more` : "";
  const h = hitOf(candidate.decl, "swallowed-export");
  h.text = `${candidate.name}  ←  namespace-swallowed by ${shown}${more}  —  ${h.text}`;
  return h;
}

/** The STALE side of the `@swallowed-ok` marker: a tag on an export the lens no longer calls swallowed — it
 *  is named-imported now, spelled at a namespace site, used in its own file, or dead outright. Printed and
 *  exit-1 so the marker cannot rot into a permanent lie (the two-sided-gate law). */
function printStaleSwallowedTags(project: Project, inScope: (fp: string) => boolean, candidateKeys: Set<string>): void {
  const stale: Hit[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (!inScope(fp) || TEST_FILE_RE.test(fp)) {
      continue;
    }
    for (const { name, decl } of ownExports(sf)) {
      if (!isSwallowedExempt(decl) || candidateKeys.has(declKey(decl))) {
        continue;
      }
      const h = hitOf(decl, "stale-swallowed-ok");
      h.text = `${name}  —  ${h.text}`;
      stale.push(h);
    }
  }
  if (stale.length === 0) {
    return;
  }
  console.log(
    `swallowed: ${stale.length} STALE \`@swallowed-ok:\` marker(s) — the export is no longer namespace-swallowed (a named import or an \`ns.<member>\` access reaches it, its own file uses it, or nothing reaches it at all and it is an \`orphans\` hit). Delete the marker or re-state the reason:`,
  );
  for (const h of stale) {
    console.log(`  ! ${h.file}:${h.line}  [${h.kind}]  ${h.text}`);
  }
  process.exitCode = 1;
}

/** Exports alive ONLY because an `import * as ns` handed their whole module to something — and whose member
 *  name no swallowing file ever spells. Optional scope (a package name / path); bare = every package. A
 *  deliberate keep carries `// @swallowed-ok: <reason>`; a stale marker is reported and exits 1. */
function cmdSwallowed(project: Project, arg: string, flags: Flags): void {
  const scope = arg === "" ? { prefix: "/packages/", label: "(all packages)" } : resolveScope(project, arg, "swallowed");
  const live = buildLiveness(project);
  const inScope = (fp: string): boolean => fp.includes(scope.prefix);
  const candidates = collectSwallowedCandidates(project, live, inScope);
  printStaleSwallowedTags(project, inScope, new Set(candidates.map((c) => declKey(c.decl))));
  const hits = candidates.filter((c) => !isSwallowedExempt(c.decl)).map(swallowedHit);
  const exempt = candidates.length - hits.length;
  console.log(
    `swallowed is a CANDIDATE lens — a hit may be load-bearing THROUGH the swallowing API itself (drizzle reads a \`relations()\` config it is handed without your code ever naming it). It finds exports whose only liveness is a whole-module \`import * as\`; the verdict is a human's. Keep one deliberately with \`// @swallowed-ok: <reason>\` on the declaration.${exempt === 0 ? "" : ` (${exempt} candidate(s) exempted by a reasoned marker.)`}`,
  );
  emit(hits, flags, `swallowed ${scope.label}`);
}

// ── respell: a domain `contract/` shape STRUCTURALLY identical to an @orb/contracts shape ───────
// The gate (`contract-derives-not-respells`) catches a re-spell that kept the OWNER'S NAME. This lens
// catches the one that renamed it — the shape a syntactic reader cannot see, because nothing about
// `interface SeatKnobs { … }` in `domain/chat/contract/` says it is `RosterMemberSpec`'s body again.
//
// It is a CANDIDATE lens, and deliberately NOT a gate: structural identity is EVIDENCE of a re-spell, never
// proof of one. Two shapes may agree today by coincidence (`{id, name, createdAt}`) and be free to diverge
// tomorrow — reding a commit on that would train agents to rename a field to dodge the gate, which is worse
// than the rot. So it prints candidates for a human/agent to judge, exactly like `clientgap`.
//
// The comparison is the shape's PROPERTY SIGNATURE — sorted `name:typeText` pairs, resolved through the
// checker so a `z.infer<…>` contracts export compares as its inferred object. Floor: 3 properties (a 1-2
// property agreement is noise — every `{id}` in the repo would match).

/** How many properties a shape needs before an exact structural match means anything. */
const RESPELL_PROPERTY_FLOOR = 3;

type ShapeEntry = { readonly name: string; readonly decl: Node; readonly signature: string };

/** The compiler checker's mutual-assignability primitive. It is a TS INTERNAL, so it is resolved once and
 *  its ABSENCE is a tool error (exit 2), never a silent zero — a lens that quietly stops comparing is worse
 *  than no lens. (Present on TS 5.x/TS7's checker object; re-verify on a TypeScript bump.) */
type AssignabilityChecker = { isTypeAssignableTo: (source: unknown, target: unknown) => boolean };

export function assignabilityChecker(project: Project): AssignabilityChecker {
  const compiler = project.getTypeChecker().compilerObject as unknown as Partial<AssignabilityChecker>;
  if (typeof compiler.isTypeAssignableTo !== "function") {
    console.error(
      "ast respell: this TypeScript build exposes no `checker.isTypeAssignableTo` (a TS internal this lens depends on) — the comparison cannot run. Re-verify the API after a TypeScript bump; scripts/codemods/ast.ts.",
    );
    process.exit(2);
  }
  return { isTypeAssignableTo: compiler.isTypeAssignableTo.bind(compiler) };
}

/** MUTUALLY assignable = the same shape, whatever the two spell their fields' types as. Assignability (not
 *  type TEXT) is the comparison because a text signature is ALIAS-SENSITIVE: `CharacterId` and
 *  `TypeIdOf<"character">` print differently and are the same type, so a text lens reports a clean zero on a
 *  literal re-spell (measured — the first cut of this lens missed a planted twin for exactly that reason). */
function mutuallyAssignable(checker: AssignabilityChecker, a: Node, b: Node): boolean {
  const ta = a.getType().compilerType;
  const tb = b.getType().compilerType;
  return checker.isTypeAssignableTo(ta, tb) && checker.isTypeAssignableTo(tb, ta);
}

/** The sorted PROPERTY-NAME signature of a declaration's type — the cheap prefilter that keeps the O(n²)
 *  assignability probe off every unrelated pair. Undefined when it is not an object shape with at least
 *  {@link RESPELL_PROPERTY_FLOOR} properties (a union/primitive/function type has no signature here). */
function shapeSignature(decl: Node): string | undefined {
  const type = decl.getType();
  if (type.isUnion() || type.isIntersection()) {
    return; // a discriminated union is not the re-spell class; its arms are compared on their own if exported
  }
  // OBJECT shapes only. A primitive (a numeric `const` such as TOOL_RECURSE_LIMIT_DEFAULT) reports its
  // APPARENT type's members — `toFixed`/`toString`/… — which sails past the property floor and matched every
  // other numeric constant in the repo (measured, first run of this lens). Functions and arrays are likewise
  // not the re-spell class.
  if (!type.isObject() || type.isArray() || type.isTuple() || type.getCallSignatures().length > 0) {
    return;
  }
  const props = type.getProperties();
  if (props.length < RESPELL_PROPERTY_FLOOR) {
    return;
  }
  return props
    .map((p) => p.getName())
    .sort()
    .join("|");
}

/** Every exported declaration of the files under `prefix` that HAS a shape signature. */
function shapesUnder(project: Project, prefix: string): ShapeEntry[] {
  const out: ShapeEntry[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (!fp.includes(prefix) || TEST_FILE_RE.test(fp)) {
      continue;
    }
    for (const { name, decl } of ownExports(sf)) {
      const signature = shapeSignature(decl);
      if (signature !== undefined) {
        out.push({ name, decl, signature });
      }
    }
  }
  return out;
}

/** Domain dirs under `packages/server/src/domain/` that have a `contract/`, filtered by an optional arg. */
function domainsWithContracts(project: Project, arg: string): string[] {
  const found = new Set<string>();
  for (const sf of project.getSourceFiles()) {
    const domain = DOMAIN_CONTRACT_DIR_RE.exec(sf.getFilePath())?.groups?.["domain"];
    if (domain !== undefined && (arg === "" || domain === arg)) {
      found.add(domain);
    }
  }
  return [...found].sort();
}

const DOMAIN_CONTRACT_DIR_RE = /\/packages\/server\/src\/domain\/(?<domain>[^/]+)\/contract\//u;

/** The origin declaration keys a BARE type alias names — `export type X = Y` where `Y` is a plain type
 *  reference with no type arguments — resolved through import/re-export alias hops to the declaration(s) it
 *  ultimately points at. Empty for anything else (an object-literal type, a generic instantiation, an indexed
 *  access): those are not derives.
 *
 *  WHY (2026-08-03): the lens used to flag the very fix it recommends. `export type MemoryBackfillCounts =
 *  MemoryBackfillResult` IS the derive, and it is of course mutually assignable with its own RHS — so the
 *  steady state was "3 hits, all already resolved", which trains a reader to ignore the lens. A hit is only
 *  meaningful when the domain shape RE-DECLARES the body; an alias that names the contracts symbol is the
 *  destination, not the defect. */
function bareAliasTargetKeys(decl: Node): Set<string> {
  const keys = new Set<string>();
  if (!Node.isTypeAliasDeclaration(decl)) {
    return keys;
  }
  const typeNode = decl.getTypeNode();
  if (typeNode === undefined || !Node.isTypeReference(typeNode) || typeNode.getTypeArguments().length > 0) {
    return keys;
  }
  const entity = typeNode.getTypeName();
  const identifier = Node.isQualifiedName(entity) ? entity.getRight() : entity;
  const symbol = identifier.getSymbol();
  if (symbol === undefined) {
    return keys;
  }
  // An IMPORTED name's own symbol is the import alias; getAliasedSymbol follows the whole re-export chain to
  // the declaration the contracts side keys on. A same-file reference has no alias — use the symbol itself.
  for (const d of (symbol.getAliasedSymbol() ?? symbol).getDeclarations()) {
    keys.add(declKey(d));
  }
  return keys;
}

/** ONE domain's structural twins: every `contract/` shape MUTUALLY ASSIGNABLE with a shape the sibling
 *  `@orb/contracts/<domain>` exports (property-name signature prefilter, then the real probe), MINUS the
 *  aliases that already ARE the derive ({@link bareAliasTargetKeys}). */
export function respellHitsFor(project: Project, checker: AssignabilityChecker, domain: string): Hit[] {
  const contractsShapes = shapesUnder(project, `/packages/contracts/src/${domain}/`);
  if (contractsShapes.length === 0) {
    return [];
  }
  const bySignature = new Map<string, ShapeEntry[]>();
  for (const shape of contractsShapes) {
    bySignature.set(shape.signature, [...(bySignature.get(shape.signature) ?? []), shape]);
  }
  const hits: Hit[] = [];
  for (const domainShape of shapesUnder(project, `/packages/server/src/domain/${domain}/contract/`)) {
    const derivedFrom = bareAliasTargetKeys(domainShape.decl);
    for (const twin of bySignature.get(domainShape.signature) ?? []) {
      // The domain shape IS this contracts symbol, under a local name — the recommended derive, not a hit.
      if (derivedFrom.has(declKey(twin.decl)) || !mutuallyAssignable(checker, domainShape.decl, twin.decl)) {
        continue;
      }
      const h = hitOf(domainShape.decl, domainShape.name === twin.name ? "respell-same-name" : "respell-renamed");
      h.text = `${domainShape.name}  ≡  @orb/contracts/${domain}::${twin.name}`;
      hits.push(h);
    }
  }
  return hits;
}

/** Domain `contract/` shapes structurally identical to a shape the sibling `@orb/contracts/<domain>` already
 *  exports — the RENAMED re-spell the syntactic gate cannot see. Optional arg = one domain; bare = all. */
function cmdRespell(project: Project, arg: string, flags: Flags): void {
  const domains = domainsWithContracts(project, arg);
  if (domains.length === 0) {
    console.error(`ast respell: no domain contract/ dir matched "${arg}" — try a domain name (chat, rpg, preset, …) or run bare for all.`);
    process.exit(2);
  }
  const checker = assignabilityChecker(project);
  const hits: Hit[] = [];
  for (const domain of domains) {
    hits.push(...respellHitsFor(project, checker, domain));
  }
  console.log(
    `respell is a CANDIDATE lens — structural identity is EVIDENCE of a re-spell, not proof: two shapes may agree today and be free to diverge tomorrow. Verify intent before acting, and prefer a derive when the domain shape IS the contracts shape. (${RESPELL_PROPERTY_FLOOR}+ properties, checker-resolved; a \`respell-same-name\` hit is already RED at the \`contract-derives-not-respells\` gate.)`,
  );
  emit(hits, flags, `respell ${arg === "" ? "(all domains)" : arg}`);
}

// ── typeonly-alive: VALUE exports kept alive ONLY by type positions (the structural-liveness rot) ─
// The owner-named class: "code in server only kept alive by schema or kit or contract" — an export whose
// every reference is a TYPE position (`import type`, `typeof X`, an annotation, a heritage clause). It
// satisfies a SHAPE; nothing ever calls it, reads it, or constructs it. At runtime the module still ships
// the function body, the object literal, the class — dead weight that reads as consumed to every
// import-liveness lens in this file, because the import edge is real. Only the POSITION of each reference
// tells the truth.
//
// SCOPE OF THE CANDIDATE SET — VALUE declarations only (function/variable/class/enum). An `interface` or a
// `type` alias is type-only BY NATURE and legal: flagging one would be pure noise. A class IS a candidate:
// a class only ever named in an annotation is a shape written the expensive way.
//
// V1 CLASSIFIES BY REFERENCE POSITION, NOT BY IMPORT FORM — the complete arm, deliberately (the cheap arm
// would key on `import type` / inline `type` specifiers, which UNDER-reports: a plain `import { X }` whose
// only use is `typeof X` is exactly the defect and looks like value consumption to the import form). Each
// reference comes from `findReferencesAsNodes()` and is classified by ANCESTRY, so the lens sees through
// every hop the language service sees through — measured on probes (2026-08-02):
//   • renaming barrels (`export { inner as outer } from`) and `export *` chains resolve to the origin;
//   • `import * as ns` + `ns.member` and `(await import("./m")).member` come back as real references, so
//     this lens needs NO namespace/dynamic err-alive suppression — unlike the import-edge liveness above,
//     it can SEE the member access. (A namespace passed WHOLESALE into a call names no member at all, so
//     it produces zero references: that export is `swallowed`'s business, never this lens's.)
// The cost is the `refs` verb's cost, once per value export. That is why the lens is MANUAL-tier.
//
// WHY THIS LENS DOES NOT EXTEND `Liveness.arms`. The arm record exists for ONE consumer — `swallowed`'s
// "is `namespace` this key's only arm?" question — and the ERR-ALIVE ARM contract above binds anything that
// MARKS a key alive. This lens marks nothing: it never calls `markImportConsumption`, adds no consumption
// path, and reads no liveness set. A `type`-vs-`value` split of the `named` arm would therefore be recorded
// and never read (and could not change a `swallowed` verdict either way, since that lens only asks whether
// `namespace` stands alone). Reference position strictly dominates import form for this question — the
// import form is a lossy proxy for it.
//
// CANDIDATE lens, never a death sentence: a type-only-alive export is often a DELIBERATE conformance seam —
// a `satisfies`-anchor const, a runtime value whose type is the contract, a factory kept beside its shape.
// A deliberate keep is tagged `// @typeonly-ok: <reason>` on the declaration, and that tag is TWO-SIDED: a
// tag on an export the lens no longer calls type-only (something references it at runtime now, or nothing
// references it at all and it is an `orphans` hit) is reported STALE and exits 1.

const TYPEONLY_OK_RE = /@typeonly-ok:\s*\S/u;

/** True if the declaration carries a leading `// @typeonly-ok: <reason>` — a deliberate keep of an export
 *  only type positions reach. The reason is required (a bare marker does NOT exempt, as with
 *  `@swallowed-ok:`/`@server-only:`). Reads through {@link commentHost}: an `export const`'s marker lives on
 *  the VariableStatement, not on the VariableDeclaration `getExportedDeclarations()` hands back. */
export function isTypeOnlyExempt(decl: Node): boolean {
  return commentHost(decl)
    .getLeadingCommentRanges()
    .some((range) => TYPEONLY_OK_RE.test(range.getText()));
}

/** The declaration kinds that can be runtime-dead while still satisfying a shape. An interface / type alias
 *  declares nothing at runtime, so "every reference is a type position" is its DEFINITION, not a defect. */
function isValueDeclaration(decl: Node): boolean {
  return Node.isFunctionDeclaration(decl) || Node.isVariableDeclaration(decl) || Node.isClassDeclaration(decl) || Node.isEnumDeclaration(decl);
}

/** What one reference to an export says about its liveness. `neutral` = a binding hop that carries no
 *  verdict (an import/export specifier is where the name TRAVELS, never where it is USED — treating it as
 *  a value reference is exactly the under-report the import-form arm suffers). */
type RefPosition = "type" | "value" | "neutral";

/** Node kinds that are pure binding hops: the specifier itself, the clause holding it, a namespace binding.
 *  Matched against BOTH the reference node and its parent — a renaming re-export comes back as the
 *  `ExportSpecifier` node itself (`inner as outer`), a plain one as the identifier inside it. */
const NEUTRAL_REF_KINDS = new Set<SyntaxKind>([
  SyntaxKind.ImportSpecifier,
  SyntaxKind.ExportSpecifier,
  SyntaxKind.NamedImports,
  SyntaxKind.NamedExports,
  SyntaxKind.ImportClause,
  SyntaxKind.NamespaceImport,
  SyntaxKind.NamespaceExport,
  SyntaxKind.ImportEqualsDeclaration,
]);

/** Classify ONE reference node by ancestry. Climbs only through the nodes a qualified type name is built
 *  from (`Identifier`, `QualifiedName`); anything else terminates the climb as a runtime expression. */
function refPosition(ref: Node): RefPosition {
  const parent = ref.getParent();
  if (parent === undefined) {
    return "value";
  }
  if (NEUTRAL_REF_KINDS.has(ref.getKind()) || NEUTRAL_REF_KINDS.has(parent.getKind())) {
    return "neutral";
  }
  return climbsToTypeContext(parent) ? "type" : "value";
}

/** Does the ancestry of a reference land in a TYPE context? */
function climbsToTypeContext(from: Node): boolean {
  let cur: Node | undefined = from;
  while (cur !== undefined) {
    // MUST precede the isTypeNode test: `class D extends Base` puts `Base` in an ExpressionWithTypeArguments,
    // which IS a TypeNode by kind — but a class's `extends` target is CONSTRUCTED at runtime (measured; a
    // naive isTypeNode check calls every base class type-only). `implements`, and an interface's `extends`,
    // are the genuinely type-only heritage arms.
    if (Node.isExpressionWithTypeArguments(cur)) {
      return isTypeOnlyHeritage(cur);
    }
    if (Node.isTypeNode(cur)) {
      return true;
    }
    if (Node.isIdentifier(cur) || Node.isQualifiedName(cur)) {
      cur = cur.getParent();
      continue;
    }
    return false;
  }
  return false;
}

/** A heritage reference is type-only unless it is a CLASS's `extends` target (the one runtime-constructing
 *  heritage position). */
function isTypeOnlyHeritage(node: Node): boolean {
  const clause = node.getParentIfKind(SyntaxKind.HeritageClause);
  if (clause === undefined) {
    return true;
  }
  const owner = clause.getParent();
  return !(clause.getToken() === SyntaxKind.ExtendsKeyword && (Node.isClassDeclaration(owner) || Node.isClassExpression(owner)));
}

/** ONE type-only-alive candidate: the export, and the type-position reference SITES that are its entire
 *  liveness (the files a human must read to render the verdict — "is this shape-conformance deliberate?"). */
export type TypeOnlyCandidate = {
  readonly name: string;
  readonly decl: Node;
  readonly sites: readonly string[];
};

/** Value exports of `inScope` whose every reference is a type position. Pure enumeration — no exemption
 *  policy, no printing (the verb owns both), so the self-test drives the same function the CLI does. */
export function collectTypeOnlyCandidates(project: Project, inScope: (filePath: string) => boolean): TypeOnlyCandidate[] {
  const out: TypeOnlyCandidate[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (!inScope(fp) || TEST_FILE_RE.test(fp)) {
      continue;
    }
    for (const { name, decl } of ownExports(sf)) {
      const candidate = typeOnlyCandidateOf(name, decl);
      if (candidate !== undefined) {
        out.push(candidate);
      }
    }
  }
  return out;
}

/** The candidate for one export, or undefined when it is not one: not a value declaration, ONE runtime
 *  reference is enough to make it alive, and ZERO type references means nothing reaches it at all — an
 *  `orphans` hit, not this lens's class (the two lenses never overlap, as with `swallowed`). */
function typeOnlyCandidateOf(name: string, decl: Node): TypeOnlyCandidate | undefined {
  if (!(isValueDeclaration(decl) && Node.isReferenceFindable(decl))) {
    return;
  }
  const sites = new Set<string>();
  for (const ref of decl.findReferencesAsNodes()) {
    // The declaration's OWN name node — its parent IS the declaration (true for function/class/enum/variable
    // alike). Measured: the language service does not currently hand it back, but a lens that would call
    // every candidate "value-referenced" if it ever did is one TypeScript bump from a silent permanent zero.
    if (ref.getSourceFile() === decl.getSourceFile() && ref.getParent()?.getStart() === decl.getStart()) {
      continue;
    }
    const position = refPosition(ref);
    if (position === "value") {
      return;
    }
    if (position === "type") {
      sites.add(`${relPath(ref.getSourceFile().getFilePath())}:${ref.getStartLineNumber()}`);
    }
  }
  return sites.size === 0 ? undefined : { name, decl, sites: [...sites].sort(byProdFirst) };
}

/** How many type-position sites a hit names before it collapses to a count. */
const TYPEONLY_SITES_SHOWN = 2;

function typeOnlyHit(candidate: TypeOnlyCandidate): Hit {
  const shown = candidate.sites.slice(0, TYPEONLY_SITES_SHOWN).join(", ");
  const more = candidate.sites.length > TYPEONLY_SITES_SHOWN ? ` +${candidate.sites.length - TYPEONLY_SITES_SHOWN} more` : "";
  const h = hitOf(candidate.decl, "typeonly-alive");
  h.text = `${candidate.name}  ←  ${candidate.sites.length} type-position ref(s): ${shown}${more}  —  ${h.text}`;
  return h;
}

/** The STALE side of the `@typeonly-ok` marker: a tag on an export the lens no longer calls type-only-alive —
 *  something references it at runtime now, or nothing references it at all (an `orphans` hit), or it was
 *  never a value declaration. Printed and exit-1 so the marker cannot rot into a permanent lie. */
function printStaleTypeOnlyTags(project: Project, inScope: (fp: string) => boolean, candidateKeys: Set<string>): void {
  const stale: Hit[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (!inScope(fp) || TEST_FILE_RE.test(fp)) {
      continue;
    }
    for (const { name, decl } of ownExports(sf)) {
      if (!isTypeOnlyExempt(decl) || candidateKeys.has(declKey(decl))) {
        continue;
      }
      const h = hitOf(decl, "stale-typeonly-ok");
      h.text = `${name}  —  ${h.text}`;
      stale.push(h);
    }
  }
  if (stale.length === 0) {
    return;
  }
  console.log(
    `typeonly-alive: ${stale.length} STALE \`@typeonly-ok:\` marker(s) — the export is no longer alive by type positions ALONE (a runtime reference reaches it now, nothing reaches it at all and it is an \`orphans\` hit, or it is not a value declaration). Delete the marker or re-state the reason:`,
  );
  for (const h of stale) {
    console.log(`  ! ${h.file}:${h.line}  [${h.kind}]  ${h.text}`);
  }
  process.exitCode = 1;
}

/** VALUE exports (functions/consts/classes/enums) whose EVERY reference is a type position — runtime-dead
 *  code kept alive only by the shapes it satisfies. Optional scope (a package name / path); bare = every
 *  package. A deliberate conformance seam carries `// @typeonly-ok: <reason>`; a stale marker exits 1. */
function cmdTypeOnly(project: Project, arg: string, flags: Flags): void {
  const scope = arg === "" ? { prefix: "/packages/", label: "(all packages)" } : resolveScope(project, arg, "typeonly-alive");
  const inScope = (fp: string): boolean => fp.includes(scope.prefix);
  const candidates = collectTypeOnlyCandidates(project, inScope);
  printStaleTypeOnlyTags(project, inScope, new Set(candidates.map((c) => declKey(c.decl))));
  const hits = candidates.filter((c) => !isTypeOnlyExempt(c.decl)).map(typeOnlyHit);
  const exempt = candidates.length - hits.length;
  console.log(
    `typeonly-alive is a CANDIDATE lens — a hit may be a DELIBERATE conformance seam (a \`satisfies\` anchor, a runtime value whose type IS the contract). It finds value exports whose every reference is a type position; the verdict is a human's. Keep one deliberately with \`// @typeonly-ok: <reason>\` on the declaration.${exempt === 0 ? "" : ` (${exempt} candidate(s) exempted by a reasoned marker.)`}`,
  );
  emit(hits, flags, `typeonly-alive ${scope.label}`);
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
  prodonly: cmdProdOnly,
  cycles: cmdCycles,
  aliases: cmdAliases,
  unwired: cmdUnwired,
  clientgap: cmdClientGap,
  swallowed: cmdSwallowed,
  respell: cmdRespell,
  "typeonly-alive": cmdTypeOnly,
};

// depcruise pass-throughs — the module-graph layer (the same config + rules the gates run), in
// agent-readable text instead of the pnpm scripts' mermaid. flow = X's direct edges both ways;
// reaches = every module that can transitively reach X (the credential-firewall question shape).
const DEPCRUISE_VERBS: Record<string, string> = { flow: "--focus", reaches: "--reaches" };

function runDepcruise(mode: string, pattern: string): void {
  const res = spawnSync("node_modules/.bin/depcruise", ["packages", "--config", ".dependency-cruiser.cjs", "--output-type", "text", mode, pattern], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: DEPCRUISE_MAX_BUFFER_BYTES,
  });
  const out = (res.stdout ?? "").trim();
  console.log(out === "" ? `RESULT ast ${mode} ${pattern}: no edges` : out);
  if (res.status !== 0 && out === "") {
    console.error((res.stderr ?? "").trim());
    process.exitCode = 1;
  }
}

// Verbs that resolve module specifiers to origin declarations (need the types:true / full-graph arm).
// refs+cycles use the language service; orphans+testonly resolve every import to its origin decl so
// liveness keys on (file, name) — bare-name matching over-reports same-file use and misses collisions.
const TYPED_VERBS = new Set(["refs", "cycles", "orphans", "testonly", "prodonly", "unwired", "clientgap", "swallowed", "respell", "typeonly-alive"]);

// Verbs whose scope arg is OPTIONAL (default to the whole surface) — run bare, arg defaults to "".
const ARGLESS_VERBS = new Set(["unwired", "clientgap", "swallowed", "respell", "typeonly-alive"]);

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
  "  pnpm ast orphans server            exports reached by NOBODY (prod or test) — resolution-based rot",
  "  pnpm ast testonly server           exports reached ONLY from tests — resolution-based rot",
  "  pnpm ast prodonly server           FILES no production entry can reach (the knip unused-files lens)",
  "  pnpm ast cycles client             import cycles, alias-resolved — slow, exact",
  "  pnpm ast aliases packages/server   rename-bindings (X as Y / const Y = X / type Y = X)",
  "  pnpm ast unwired                   server tRPC procedures NO client consumes (the PD-138 blind spot)",
  "  pnpm ast clientgap contracts       *View/*Summary contracts the SERVER uses but the CLIENT never does",
  "  pnpm ast swallowed db              exports alive ONLY because an `import * as` swallowed their module",
  "  pnpm ast respell chat              domain contract/ shapes structurally identical to an @orb/contracts shape",
  "  pnpm ast typeonly-alive server     VALUE exports whose every reference is a TYPE position (runtime-dead)",
  "  pnpm ast flow chat/engine          module graph: X's direct edges both ways (depcruise, text)",
  "  pnpm ast reaches agent-sdk         every module that can transitively reach X (depcruise)",
  "",
  "Scope arg (orphans/testonly/prodonly): a package NAME (kit|contracts|db|server|client|ui) OR a path",
  "  under packages/<pkg>/src (`packages/server/src/domain/chat`). A scope matching zero files is a tool",
  '  error — it prints what was tried + a suggestion and exits 2 (never a silent "no results").',
  "  orphans/testonly key liveness on (declaring-file, export name), not bare name: same-file use,",
  "  dynamic import(), and `import * as` namespaces all count as alive; name collisions never merge.",
  "  orphans NAMES every star-suppressed candidate (`~ file:line [star-suppressed] <symbol>`) above the hit",
  "  list when a barrel's members are only reachable through an `export *` chain — reported per SYMBOL,",
  "  never counted as a hit, so a zero is legible as clean rather than as star-blindness.",
  "",
  "prodonly is the FILE lens (testonly/orphans are symbol lenses): it BFS-walks the resolved import graph",
  "  (static + dynamic + star/namespace edges) from the production entry set — derived from each",
  "  package.json `exports` map + knip.ts's per-workspace entry globs, NOT a parallel definition — and",
  "  reports source files no entry reaches. A file reachable only from a test IS prod-unreachable (the",
  "  point of the lens); it is stricter than `knip:prod` for test-only-reachable package-subpath files.",
  "",
  "unwired diffs two STRUCTURAL surfaces (import-liveness is blind to both — the client consumes via the",
  "  typed proxy, not an import edge): the server `t.router({…})` object-literals (keyed `<ns>.<proc>` off",
  '  the appRouter namespacing) MINUS the client\'s `trpc.<ns>.<proc>` chains + `Trpc["<ns>"]["<proc>"]`',
  "  inferences. Optional arg = a `<ns>.<proc>` substring (a router name) to scope; bare = all procedures.",
  "",
  "clientgap (CANDIDATE lens, run on demand) = exports in usedServerProd but NOT usedClientProd/usedTest.",
  "  Default scope `contracts`, filtered to client-facing wire names (`*View`/`*Summary`) — a UI shape the",
  "  server produces but the front-end never wired. A hit may be client-consumed via a re-exported barrel",
  "  or a `Trpc[…]` inference the import-liveness can't see — VERIFY before acting. A path/package scope",
  "  overrides the filter and reports every server-only gap in it (noisier).",
  "",
  'swallowed (CANDIDATE lens, run on demand) = the rot-hider class. `import * as ns from "#schema"` +',
  "  `drizzle(client, { schema })` marks EVERY export of that module alive without naming one, so a dead",
  "  export inside a namespace-consumed barrel reads as consumed forever. A hit is an export whose ONLY",
  '  liveness arm is that namespace import, that no swallowing file ever spells (`ns.x` / `ns["x"]` /',
  "  `const {x} = ns`), that no named import reaches anywhere (prod OR test), and that its own file never",
  "  uses. It may still be load-bearing THROUGH the swallowing API — VERIFY, never auto-delete. Keep one",
  "  deliberately with `// @swallowed-ok: <reason>` on the declaration; a marker the lens no longer agrees",
  "  with is reported STALE and exits 1 (two-sided). Optional scope; bare = every package.",
  "",
  "typeonly-alive (CANDIDATE lens, run on demand) = the STRUCTURAL-liveness class: a VALUE export (function,",
  "  const, class, enum — never an interface/type alias, which is type-only by nature) whose EVERY reference",
  "  is a TYPE position: an `import type` specifier, `typeof X`, an annotation, an `implements`/interface",
  "  `extends` clause. Nothing ever calls, reads or constructs it — it ships a runtime body to satisfy a",
  "  shape. Classified by REFERENCE POSITION, not import form (a plain `import { X }` used only as `typeof X`",
  "  is exactly the defect), so it sees through renaming barrels, `export *`, `import * as ns` member access",
  "  and dynamic-import member access. An export nothing references at all is an `orphans` hit, not this one.",
  "  Keep a deliberate conformance seam with `// @typeonly-ok: <reason>`; a stale marker exits 1 (two-sided).",
  "  Optional scope; bare = every package. SLOW — it costs one `refs` resolution per value export.",
  "",
  "Flags: --in <substr> path filter · --files per-file counts only (cheapest output) ·",
  "       --max <n> raw-line cap (default 60; big result sets auto-collapse to per-file counts) ·",
  "       --json machine output. Syntactic verbs load in ~10s; refs/cycles/orphans/testonly/prodonly/typeonly-alive resolve types.",
].join("\n");

function main(): void {
  const [verb, arg, ...rest] = process.argv.slice(2);
  if (verb !== undefined && arg !== undefined && DEPCRUISE_VERBS[verb] !== undefined) {
    runDepcruise(DEPCRUISE_VERBS[verb], arg);
    return;
  }
  const run = verb === undefined ? undefined : VERBS[verb];
  // unwired/clientgap/respell take an OPTIONAL scope — default the arg to "" so they run bare (whole
  // surface). A leading FLAG is not a scope: `pnpm ast respell --max 60` used to read "--max" as the domain
  // name and exit 2 on it, so an argless verb's first token is handed back to the flag parser when it starts
  // with `--`.
  const argless = verb !== undefined && ARGLESS_VERBS.has(verb);
  const argIsFlag = argless && arg !== undefined && arg.startsWith("--");
  const effectiveArg = argIsFlag ? "" : (arg ?? (argless ? "" : undefined));
  const flagTokens = argIsFlag && arg !== undefined ? [arg, ...rest] : rest;
  if (run === undefined || effectiveArg === undefined || verb === undefined) {
    console.log(USAGE);
    return;
  }
  run(loadProject(TYPED_VERBS.has(verb)), effectiveArg, parseFlags(flagTokens));
}

// Run only as the CLI entrypoint — importing this module (the self-test drives the pure enumeration
// functions over an in-memory project) must NOT execute a scan.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
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
}

// Exported for the self-test (tests/tooling/ast-lens.test.ts) — the pure enumeration substrate the
// unwired/clientgap lenses diff, drivable over an in-memory ts-morph project — AND for the push-tier
// orphan-export ratchet (scripts/verify/orphan-export-ratchet.ts), which judges the SAME candidate set
// this file's `orphans` verb prints (one definition of "orphan", never a parallel one).
export type { Liveness };
export { buildLiveness, collectClientConsumed, collectServerProcedures, isUnwiredExempt };
