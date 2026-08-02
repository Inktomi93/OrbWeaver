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
// How many star-suppressed filenames to name inline before eliding to "…" (the count is always exact).
const SUPPRESS_FILE_LIST_CAP = 8;
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

/** `<declFile>` + `<declStart>` — the identity a candidate export and every consumer of it agree on. */
function declKey(decl: Node): string {
  return `${decl.getSourceFile().getFilePath()}${KEY_SEP}${decl.getStart()}`;
}

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
};

/** The client package's src prefix — the seam that buckets prod consumption into client vs server. */
const CLIENT_SRC_PREFIX = "/packages/client/";

/** Decl-key every export of `target` (its own decls AND re-exported ones — getExportedDeclarations
 *  resolves through `export *` and through renaming `export { X as Y } from` hops), added to `bucket`.
 *  Used for namespace imports and dynamic imports, both of which keep a module's WHOLE export surface
 *  alive (err toward alive, never false-dead). The barrel's export NAME is irrelevant here — only the
 *  declarations it resolves to are recorded, which is what makes an alias hop invisible to the key. */
function markModuleAlive(target: SourceFile, bucket: Set<string>): void {
  for (const decls of target.getExportedDeclarations().values()) {
    for (const d of decls) {
      bucket.add(declKey(d));
    }
  }
}

/** Resolve one named-import specifier to its ORIGIN decls and mark them alive. `getExportedDeclarations()
 *  .get(<the name the CONSUMER wrote>)` follows the re-export chain — including renames — to the real
 *  declarations; those declaration nodes ARE the key the candidate side uses, so the consumer's spelling
 *  never enters the identity. */
function markNamedAlive(target: SourceFile, name: string, bucket: Set<string>): void {
  const decls = target.getExportedDeclarations().get(name);
  if (decls === undefined) {
    return;
  }
  for (const d of decls) {
    bucket.add(declKey(d));
  }
}

/** Consumption from ONE static import declaration: named specifiers + `import * as` namespaces resolve
 *  to origins. `export { X } from "…"` is a re-export PASS-THROUGH (not consumption — the MemoryLogEntry
 *  miss class: a file re-exporting its own symbol must not mark it "used" and hide deadness elsewhere),
 *  so this only walks IMPORT declarations. */
function markImportConsumption(imp: ImportDeclaration, bucket: Set<string>): void {
  const target = imp.getModuleSpecifierSourceFile();
  if (target === undefined) {
    return;
  }
  if (imp.getNamespaceImport() !== undefined) {
    markModuleAlive(target, bucket);
    return;
  }
  for (const spec of imp.getNamedImports()) {
    markNamedAlive(target, spec.getName(), bucket);
  }
  if (imp.getDefaultImport() !== undefined) {
    markNamedAlive(target, "default", bucket);
  }
}

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
function markDynamicImports(sf: SourceFile, project: Project, bucket: Set<string>): void {
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
      markModuleAlive(target, bucket);
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
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    // Prod consumption is bucketed by the IMPORTING file's package (client vs everything-else); a test
    // path always wins into usedTest. clientgap reads the split; orphans/testonly/prodonly read the union.
    const bucket = prodBucketFor(fp, { usedTest, usedClientProd, usedServerProd });
    for (const imp of sf.getImportDeclarations()) {
      markImportConsumption(imp, bucket);
    }
    collectStarTargets(sf, starTargets);
    markDynamicImports(sf, project, bucket);
  }
  const usedProd = new Set<string>([...usedClientProd, ...usedServerProd]);
  return { usedProd, usedClientProd, usedServerProd, usedTest, starTargets };
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
function* ownExports(sf: SourceFile): Generator<{ name: string; decl: Node }> {
  const fp = sf.getFilePath();
  for (const [name, decls] of sf.getExportedDeclarations()) {
    const d = decls[0];
    if (d !== undefined && d.getSourceFile().getFilePath() === fp) {
      yield { name, decl: d };
    }
  }
}

type OrphanScan = { hits: Hit[]; suppressed: Hit[] };

function scanOrphans(sf: SourceFile, live: Liveness): OrphanScan {
  const fp = sf.getFilePath();
  const out: OrphanScan = { hits: [], suppressed: [] };
  for (const { name, decl } of ownExports(sf)) {
    const key = declKey(decl);
    if (live.usedProd.has(key) || live.usedTest.has(key) || isReferencedInOwnFile(sf, name, decl)) {
      continue;
    }
    const h = hitOf(decl, "orphan-export");
    h.text = `${name}  —  ${h.text}`;
    // Reached only through a star re-export chain a namespace consumer might use → suppress, but COUNT
    // it (a zero must be legible as clean, not as star-blindness).
    (live.starTargets.has(fp) ? out.suppressed : out.hits).push(h);
  }
  return out;
}

/** Exports of a scope never imported anywhere (prod OR test) and never used in their own file — the rot
 *  signal. Star-suppressed candidates are counted + named, never silently swallowed (the permanent-zero
 *  `orphans contracts` bug: 100%-barrel packages reported clean while blind). */
function cmdOrphans(project: Project, arg: string, flags: Flags): void {
  const scope = resolveScope(project, arg, "orphans");
  const live = buildLiveness(project);
  const hits: Hit[] = [];
  const suppressed: Hit[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (fp.includes(scope.prefix) && !TEST_FILE_RE.test(fp)) {
      const scan = scanOrphans(sf, live);
      hits.push(...scan.hits);
      suppressed.push(...scan.suppressed);
    }
  }
  if (suppressed.length > 0) {
    const files = [...new Set(suppressed.map((h) => h.file))].sort();
    const total = hits.length + suppressed.length;
    console.log(
      `orphans: ${suppressed.length} of ${total} candidate(s) suppressed by star re-exports in ${files.length} file(s): ${files.slice(0, SUPPRESS_FILE_LIST_CAP).join(", ")}${files.length > SUPPRESS_FILE_LIST_CAP ? ", …" : ""}`,
    );
  }
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
const TYPED_VERBS = new Set(["refs", "cycles", "orphans", "testonly", "prodonly", "unwired", "clientgap"]);

// Verbs whose scope arg is OPTIONAL (default to the whole surface) — run bare, arg defaults to "".
const ARGLESS_VERBS = new Set(["unwired", "clientgap"]);

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
  "  pnpm ast flow chat/engine          module graph: X's direct edges both ways (depcruise, text)",
  "  pnpm ast reaches agent-sdk         every module that can transitively reach X (depcruise)",
  "",
  "Scope arg (orphans/testonly/prodonly): a package NAME (kit|contracts|db|server|client|ui) OR a path",
  "  under packages/<pkg>/src (`packages/server/src/domain/chat`). A scope matching zero files is a tool",
  '  error — it prints what was tried + a suggestion and exits 2 (never a silent "no results").',
  "  orphans/testonly key liveness on (declaring-file, export name), not bare name: same-file use,",
  "  dynamic import(), and `import * as` namespaces all count as alive; name collisions never merge.",
  "  orphans prints `orphans: N of M candidate(s) suppressed by star re-exports in …` when a barrel's",
  "  members are only reachable through an `export *` chain (a zero is legible as clean, not blind).",
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
  "Flags: --in <substr> path filter · --files per-file counts only (cheapest output) ·",
  "       --max <n> raw-line cap (default 60; big result sets auto-collapse to per-file counts) ·",
  "       --json machine output. Syntactic verbs load in ~10s; refs/cycles/orphans/testonly/prodonly resolve types.",
].join("\n");

function main(): void {
  const [verb, arg, ...rest] = process.argv.slice(2);
  if (verb !== undefined && arg !== undefined && DEPCRUISE_VERBS[verb] !== undefined) {
    runDepcruise(DEPCRUISE_VERBS[verb], arg);
    return;
  }
  const run = verb === undefined ? undefined : VERBS[verb];
  // unwired/clientgap take an OPTIONAL scope — default arg to "" so they run bare (whole-surface).
  const effectiveArg = arg ?? (verb !== undefined && ARGLESS_VERBS.has(verb) ? "" : undefined);
  if (run === undefined || effectiveArg === undefined || verb === undefined) {
    console.log(USAGE);
    return;
  }
  run(loadProject(TYPED_VERBS.has(verb)), effectiveArg, parseFlags(rest));
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
// unwired/clientgap lenses diff, drivable over an in-memory ts-morph project.
export { buildLiveness, collectClientConsumed, collectServerProcedures, isUnwiredExempt };
