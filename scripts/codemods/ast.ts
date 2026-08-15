#!/usr/bin/env tsx
// pnpm ast — no-script structural search over the whole workspace: symbol layer (ts-morph — refs/
// callers/importers/exports/jsx/ident + rot lenses orphans/testonly/chains/cycles/aliases/stringy) and module-
// graph layer (depcruise pass-throughs flow/reaches, same config the gates run). Run bare for full usage
// with examples (the USAGE block below is the doc). Prefer this over grep for CODE questions.
// EVERY run ends with an audit epilogue on STDERR naming the scope it actually entered — see "THE SCAN
// LEDGER" below; a zero-scan run is a tool error (exit 2), never a clean "no results".
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";
import type { BindingElement, ExportDeclaration, ImportDeclaration, Project, SourceFile, Type } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import knipConfig from "../../knip.ts";
import type { SchemaTable } from "../check/schema-read.ts";
import { schemaTables } from "../check/schema-read.ts";
import { getWorkspace, searchGlobs } from "../ts-workspace.ts";
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

type Flags = { in: string | null; json: boolean; max: number; filesOnly: boolean; public: boolean; all: boolean };
type Hit = { file: string; line: number; kind: string; text: string };

// ── THE SCAN LEDGER — every invocation ends with ONE auditable epilogue ────────────────────────
// WHY (Codex repository audit, 2026-08-13): `no results` and `the search never happened` print the SAME
// line, so a lens can read clean while blind. Three shapes produce that lie here, all measured on this
// tree, none visible in the RESULT line:
//   1. THE TWO CORPORA. The syntactic verbs load `harnessGlobs` (packages/*/src + tests +
//      scripts/check/gates); only the TYPED verbs load `searchGlobs`, which adds all of scripts/**,
//      packages/*/*.ts, *.mts and playwright/**. So `ast ident REPO_ROOT --in scripts/` printed
//      `no results` against a corpus that never contained one scripts/ file (verified 2026-08-13).
//   2. A SCOPE THAT ADMITS NOTHING. `resolveScope` has always rejected a zero-file positional scope with
//      exit 2 — but the verbs that take a raw path substring (`exports`, `aliases`, `cycles`) had no such
//      gate, and neither did `--in`, so a typo there degraded straight to a clean zero.
//      (`--filter` is a pnpm BUILD selector and never scoped this lens at all — `scope=` now says so.)
//   3. TS vs TSX. `.ts` and `.tsx` are different languages to every structural tool; `langs=` prints the
//      per-extension file counts so a mixed-tree answer cannot hide a single-language scan.
//
// So every invocation ends with ONE line on STDERR — stdout stays byte-identical, pipelines keep working:
//   [ast] verb=<v> scope=<parts> langs=<ext:count,…> scanned=<n> skipped=<n>(<reason:count,…>) matches=<n> status=…
// and `--json` carries the same fields as an ADDITIVE `meta` object (no existing key moves or changes).
//
// WHAT `scanned` MEANS, precisely — it is the CANDIDATE corpus: the files this invocation's scope admits,
// the files a hit can come from. A lens may additionally walk the whole workspace to DECIDE a verdict
// (`buildLiveness`, reference resolution, the depcruise graph); that substrate pass is deliberately not
// counted, because a scope typo cannot silence it and counting it would hide the number that a typo DOES
// move. The count is not re-derived either: it is taken by the same {@link scanCorpus} call that hands the
// verb its files, so it cannot drift from what the lens read. A verb that walks `project.getSourceFiles()`
// for its own candidates reports a scan it never proved — do not add one.
//
// `scanned=0` is a TOOL ERROR (status=error, `SCOPE ENTERED NOTHING`, exit 2), never a result — the
// exit-2 discipline `resolveScope` established, extended to every other way a scope can enter nothing.
// The same rule covers the scopes that resolve to UNITS rather than paths ({@link noteUnits}): zero
// procedures / tables / registries / domains is a blind lens, not a clean one.

/** Why a loaded source file is NOT in the scanned corpus. `out-of-filter` is the `--in` path filter: the
 *  file was walked but cannot contribute a hit (`dedupe` drops it), so it is skipped, never scanned. */
type SkipReason = "out-of-scope" | "out-of-filter" | "test-file" | "declaration-file";

/** complete = every match was displayed · partial = the display was capped (raise `--max`) · error = the
 *  run is NOT a verdict (the scope entered nothing, or a tool broke). Mirrors the verify exit contract. */
type ScanStatus = "complete" | "partial" | "error";

/** The epilogue as DATA — one stderr line, and the `--json` `meta` object, from the same record.
 *  `scanned`/`skipped` are null only for a pass-through verb whose corpus is not ours to count (the
 *  depcruise arm): a fabricated number would be exactly the lie this ledger exists to kill. */
type ScanMeta = {
  readonly verb: string;
  readonly scope: string;
  readonly langs: Readonly<Record<string, number>>;
  readonly scanned: number | null;
  readonly skipped: number | null;
  readonly skippedBy: Readonly<Record<SkipReason, number>>;
  readonly matches: number;
  readonly status: ScanStatus;
};

type ScanLedger = {
  readonly verb: string;
  /** the `--in` path filter, folded into the scope because it decides what can be REPORTED. */
  readonly filter: string | null;
  readonly scopeParts: string[];
  readonly langs: Map<string, number>;
  readonly skipped: Map<SkipReason, number>;
  /** null until a scan seam records a corpus (a pass-through verb never sets it). */
  scanned: number | null;
  matches: number;
  /** the printed hit list omitted matches (the `--max` cap) — status=partial. */
  truncated: boolean;
  /** a tool error: an empty unit scope, a failed subprocess, an unavailable checker API. */
  failed: boolean;
  finished: boolean;
};

/** The invocation's ledger. Undefined when this module is IMPORTED rather than run (the self-test and the
 *  push-tier ratchet drive the pure collectors) — every note is a no-op then, so importing prints nothing. */
let ledger: ScanLedger | undefined;

const TOOL_ERROR_EXIT = 2;
const EPILOGUE_TAG = "[ast]";
/** What the two `getWorkspace` arms load, named in `scope=` so a corpus-shaped zero is self-diagnosing. */
const CORPUS_TYPED = "search-globs(packages/*/src,tests,scripts/**,packages/*/*.ts,*.mts,playwright)";
const CORPUS_SYNTACTIC = "harness-globs(packages/*/src,tests,scripts/check/gates)";
/** Same file set as {@link CORPUS_TYPED}, loaded WITHOUT the type graph — a purely syntactic walk (no
 *  `import`/re-export resolution, no checker) needs no language service, so `literal` gets the wide
 *  corpus (tests + fixtures + scripts — the coupled-fixture sweep) at the cheap ~10s load. */
const CORPUS_WIDE_SYNTACTIC = "search-globs-no-types(packages/*/src,tests,scripts/**,packages/*/*.ts,*.mts,playwright)";
const CORPUS_DEPCRUISE = "depcruise(.dependency-cruiser.cjs)";
/** The syntactic verbs whose ARGUMENT is a symbol/module NAME (not a path) — the ones where a zero can be
 *  a corpus false clean rather than an answer, so their no-results line carries the corpus caveat. */
const NAME_LOOKUP_SYNTACTIC_VERBS = new Set(["callers", "ident", "jsx", "importers"]);

function beginRun(verb: string, corpus: string, flags: Flags): void {
  const scopeParts = [`corpus:${corpus}`];
  ledger = {
    verb,
    filter: flags.in,
    scopeParts,
    langs: new Map(),
    skipped: new Map(),
    scanned: null,
    matches: 0,
    truncated: false,
    failed: false,
    finished: false,
  };
}

/** Add a RESOLVED scope component to `scope=` (`path:/packages/server/src/`, `tables:3`). */
function noteScope(part: string): void {
  ledger?.scopeParts.push(part);
}

/** A scope that resolves to UNITS, not paths — tRPC procedures, drizzle tables, registries, domains. Zero
 *  units is a lens that entered nothing (a router shape it no longer recognizes, a table name typo): the
 *  same tool error as a zero-file path scope, and the reason `unwired` can no longer report a silent clean
 *  when `appRouter` stops matching. */
function noteUnits(kind: string, count: number): void {
  noteScope(`${kind}:${count}`);
  if (count === 0 && ledger !== undefined) {
    ledger.failed = true;
  }
}

function noteSkip(reason: SkipReason): void {
  if (ledger !== undefined) {
    ledger.skipped.set(reason, (ledger.skipped.get(reason) ?? 0) + 1);
  }
}

/** `.tsx` and `.ts` are different LANGUAGES to every structural tool, and `.d.ts` is a third thing —
 *  each gets its own bucket so a single-language scan of a mixed tree is visible in the epilogue. */
function langOf(filePath: string): string {
  if (filePath.endsWith(".d.ts")) {
    return "dts";
  }
  const dot = filePath.lastIndexOf(".");
  return dot < 0 ? "(none)" : filePath.slice(dot + 1);
}

function noteScannedFile(filePath: string): void {
  if (ledger === undefined) {
    return;
  }
  ledger.scanned = (ledger.scanned ?? 0) + 1;
  const lang = langOf(filePath);
  ledger.langs.set(lang, (ledger.langs.get(lang) ?? 0) + 1);
}

/** Record ONE emitted result set: how many matches survived dedupe + `--in`, and how many were displayed. */
function noteMatches(total: number, shown: number): void {
  if (ledger === undefined) {
    return;
  }
  ledger.matches += total;
  ledger.truncated = ledger.truncated || shown < total;
}

/** The run is not a verdict — a broken subprocess, an unavailable compiler API, an empty unit scope. */
function noteToolError(): void {
  if (ledger !== undefined) {
    ledger.failed = true;
  }
}

function statusOf(current: ScanLedger): ScanStatus {
  if (current.failed || current.scanned === 0) {
    return "error";
  }
  return current.truncated ? "partial" : "complete";
}

const NO_SKIPS: Readonly<Record<SkipReason, number>> = { "out-of-scope": 0, "out-of-filter": 0, "test-file": 0, "declaration-file": 0 };

/** The ledger as `ScanMeta` — the ONE shape both the stderr epilogue and the `--json` `meta` are built
 *  from, so the two can never disagree. Zeroed when the module is imported rather than run. */
function scanMeta(): ScanMeta {
  if (ledger === undefined) {
    return { verb: "(none)", scope: "(none)", langs: {}, scanned: null, skipped: null, skippedBy: NO_SKIPS, matches: 0, status: "complete" };
  }
  const skippedBy = { ...NO_SKIPS, ...Object.fromEntries(ledger.skipped) };
  const skipped = [...ledger.skipped.values()].reduce((a, b) => a + b, 0);
  // `in:` reads LAST — corpus, then the resolved scope, then the output filter narrowing it.
  const scopeParts = ledger.filter === null ? ledger.scopeParts : [...ledger.scopeParts, `in:${ledger.filter}`];
  return {
    verb: ledger.verb,
    scope: scopeParts.join("+"),
    langs: Object.fromEntries([...ledger.langs.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    scanned: ledger.scanned,
    skipped: ledger.scanned === null ? null : skipped,
    skippedBy,
    matches: ledger.matches,
    status: statusOf(ledger),
  };
}

/** `k:v,k:v` — the epilogue's compact sub-field form (no spaces: the line stays one greppable token run). */
function pairsOf(counts: Readonly<Record<string, number>>): string {
  const shown = Object.entries(counts).filter(([, n]) => n > 0);
  return shown.length === 0 ? "-" : shown.map(([k, n]) => `${k}:${n}`).join(",");
}

function formatEpilogue(meta: ScanMeta): string {
  const scanned = meta.scanned === null ? "n/a" : String(meta.scanned);
  const skipped = meta.skipped === null ? "n/a" : String(meta.skipped);
  return `${EPILOGUE_TAG} verb=${meta.verb} scope=${meta.scope} langs=${pairsOf(meta.langs)} scanned=${scanned} skipped=${skipped}(${pairsOf(meta.skippedBy)}) matches=${meta.matches} status=${meta.status}`;
}

/** The LOUD second line for a zero-scan run: which fence swallowed the corpus, and what to do about it.
 *  A zero here is never "no results" — it is "this question was never asked of any file". */
function emptyScopeDiagnosis(current: ScanLedger): string {
  const filtered = current.skipped.get("out-of-filter") ?? 0;
  const cause =
    current.filter !== null && filtered > 0
      ? `--in "${current.filter}" matched none of the ${filtered} file(s) the scope admitted`
      : `scope ${current.scopeParts.join("+")} admitted no file from the loaded corpus`;
  return `${EPILOGUE_TAG} SCOPE ENTERED NOTHING — ${cause}. This is a TOOL ERROR (exit ${TOOL_ERROR_EXIT}), not a clean result: nothing was searched, so nothing could be found. Note the two corpora — syntactic verbs load ${CORPUS_SYNTACTIC}; the TYPED verbs (refs/cycles/orphans/testonly/prodonly/unwired/clientgap/swallowed/respell/typeonly-alive/columns/chains/stringy/apisurface) also load ${CORPUS_TYPED}.`;
}

/** Print the epilogue (stderr) and set the exit code when the run is not a verdict. Idempotent — the
 *  tool-error path calls it before exiting, and `main` calls it on the way out. */
function finishRun(): void {
  if (ledger === undefined || ledger.finished) {
    return;
  }
  ledger.finished = true;
  const meta = scanMeta();
  console.error(formatEpilogue(meta));
  if (meta.status !== "error") {
    return;
  }
  if (ledger.scanned === 0) {
    console.error(emptyScopeDiagnosis(ledger));
  }
  // Never DOWNGRADE an exit code a lens already set: the two-sided STALE-marker arms (swallowed /
  // typeonly-alive / columns) and the depcruise pass-through own exit 1, and that verdict outranks the
  // generic tool-error code here.
  if (process.exitCode === undefined || process.exitCode === 0) {
    process.exitCode = TOOL_ERROR_EXIT;
  }
}

/** A tool error with its own message: print it, close the ledger (so the epilogue still lands), exit 2.
 *  The ONE exit-2 door — every scope/API failure in this file goes through it, so none can skip the audit. */
function exitToolError(message: string): never {
  console.error(message);
  noteToolError();
  finishRun();
  process.exit(TOOL_ERROR_EXIT);
}

/** ONE exclusion a verb applies to its candidate corpus: the reason it is skipped and the predicate that
 *  decides it. Mirror the verb's OWN filter here — the point is that the count and the lens agree. */
type SkipRule = { readonly reason: SkipReason; readonly test: (filePath: string) => boolean };

/** The verbs' own test fence is `TEST_FILE_RE` (a `.test`/`.ct` FILE), not `isTestPath` — mirror the
 *  spelling the lens uses, or the count and the lens disagree on the tests/ tree. */
const SKIP_TEST_FILES: SkipRule = { reason: "test-file", test: (fp) => TEST_FILE_RE.test(fp) };
const SKIP_DECLARATION_FILES: SkipRule = { reason: "declaration-file", test: (fp) => fp.endsWith(".d.ts") };

/** A path SUBSTRING (or several, OR'd) every candidate file must contain. `""` / `[]` = the whole corpus. */
type ScopeMatch = string | readonly string[];

/** What files a verb's lens may look at: the scope, how it prints, and the verb's own exclusions. */
type ScanSpec = { readonly scope: ScopeMatch; readonly label: string; readonly skip?: readonly SkipRule[] };

/** The whole loaded corpus — the symbol verbs (`refs`/`callers`/`importers`/`jsx`/`ident`), which search
 *  workspace-wide and narrow only their OUTPUT with `--in`. */
const WHOLE_CORPUS: ScanSpec = { scope: "", label: "workspace" };

function inScopeOf(filePath: string, scope: ScopeMatch): boolean {
  if (typeof scope === "string") {
    return scope === "" || filePath.includes(scope);
  }
  return scope.length === 0 || scope.some((s) => filePath.includes(s));
}

/** THE SCAN SEAM. Returns the files the verb's lens may look at, and records the same walk in the ledger:
 *  every loaded file lands in exactly one bucket (scanned, or skipped with a reason), so scanned+skipped is
 *  the corpus and `scanned=0` is provably "nothing was searched".
 *
 *  THE ONE ASYMMETRY, stated because it is load-bearing: a file excluded by `--in` is COUNTED as
 *  `out-of-filter` but still RETURNED. `--in` filters hits (`dedupe`), never the walk — several verbs print
 *  corpus-wide summaries beside their hits ("N type alias(es) examined", the chain/column tables) and
 *  dropping files here would silently change those. The ledger observes; it never filters. */
function scanCorpus(project: Project, spec: ScanSpec): SourceFile[] {
  noteScope(spec.label);
  if (ledger !== undefined) {
    // A scan seam RAN, so the corpus is ours to count: `scanned` leaves `null` (the pass-through sentinel)
    // here and not one file later. Without this, a scope that admits nothing reports `scanned=n/a` — the
    // "we did not measure" answer wearing the clothes of "we measured zero", which is the whole defect.
    ledger.scanned = ledger.scanned ?? 0;
  }
  const skips = spec.skip ?? [];
  const files: SourceFile[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (!inScopeOf(fp, spec.scope)) {
      noteSkip("out-of-scope");
      continue;
    }
    const rule = skips.find((r) => r.test(fp));
    if (rule !== undefined) {
      noteSkip(rule.reason);
      continue;
    }
    files.push(sf);
    if (ledger?.filter !== undefined && ledger.filter !== null && !fp.includes(ledger.filter)) {
      noteSkip("out-of-filter");
      continue;
    }
    noteScannedFile(fp);
  }
  return files;
}

/** The scanned corpus as an `inScope` predicate — how a verb hands the EXACT file set it was measured on
 *  to a collector that takes a path predicate. One predicate, both jobs: the count cannot drift from the
 *  lens (a hand-rolled `fp.includes(prefix)` beside a `scanCorpus` call is how the two fork). */
function corpusPredicate(files: readonly SourceFile[]): (filePath: string) => boolean {
  const paths = new Set(files.map((sf) => sf.getFilePath()));
  return (filePath) => paths.has(filePath);
}

/** The bare boolean switches, dictionary-dispatched (kept off the if/else chain, or `--all` pushes
 *  `parseFlags` over the complexity ceiling). */
const BOOLEAN_FLAGS: Readonly<Record<string, keyof Pick<Flags, "json" | "filesOnly" | "public" | "all">>> = {
  "--json": "json",
  "--files": "filesOnly",
  "--public": "public",
  "--all": "all",
};

function parseFlags(rest: string[]): Flags {
  const flags: Flags = { in: null, json: false, max: DEFAULT_MAX, filesOnly: false, public: false, all: false };
  for (let i = 0; i < rest.length; i += 1) {
    const t = rest[i];
    if (t === "--in") {
      flags.in = rest[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (t === "--max") {
      flags.max = Number(rest[i + 1] ?? DEFAULT_MAX) || DEFAULT_MAX;
      i += 1;
      continue;
    }
    const key = t === undefined ? undefined : BOOLEAN_FLAGS[t];
    if (key !== undefined) {
      flags[key] = true;
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
    noteMatches(unique.length, shown.length);
    // `meta` is ADDITIVE and last — every pre-existing key keeps its name, order and value, so a consumer
    // reading `total`/`hits` is untouched while a new one can audit the scope the answer came from.
    console.log(JSON.stringify({ label, total: unique.length, shown: shown.length, hits: shown, meta: scanMeta() }, null, 1));
    return;
  }
  if (flags.filesOnly || (unique.length > Math.max(flags.max, COLLAPSE_THRESHOLD) && flags.max === DEFAULT_MAX)) {
    // The at-a-glance mode: WHERE the hits live, one line per file. Explicit via --files, or
    // automatic when raw lines would flood the reader (pass --max <n> to force raw lines).
    // NOT truncation — every hit is accounted for at file granularity, so status stays `complete`.
    noteMatches(unique.length, unique.length);
    for (const [file, n] of perFileCounts(unique)) {
      console.log(`${file}  (${n})`);
    }
    console.log(
      `RESULT ast ${label}: ${unique.length} hit(s) in ${files} file(s) — per-file counts${flags.filesOnly ? "" : " (auto-collapsed; pass --max <n> for raw lines)"}`,
    );
    return;
  }
  const shown = unique.slice(0, flags.max);
  noteMatches(unique.length, shown.length);
  for (const h of shown) {
    console.log(`${h.file}:${h.line}  [${h.kind}]  ${h.text}`);
  }
  const overflow = unique.length > shown.length ? ` (showing ${shown.length} — raise --max)` : "";
  // A zero on a NAME-lookup syntactic verb is only as good as its corpus: scripts/** outside check/gates
  // is not in harness-globs, so a symbol living there (e.g. scripts/github/*, scripts/dev/*) zero-matches
  // while being fully alive — a real false clean, measured. Say so instead of printing a bare "no results".
  // Path-scoped verbs (exports/aliases) stay bare: their argument names a file that WAS scanned.
  const syntacticZero =
    unique.length === 0 && ledger !== undefined && NAME_LOOKUP_SYNTACTIC_VERBS.has(ledger.verb) && ledger.scopeParts[0] === `corpus:${CORPUS_SYNTACTIC}`;
  const corpusHint = syntacticZero
    ? " — NOTE: the syntactic corpus excludes scripts/** outside check/gates; a symbol living there needs a search-corpus verb (refs)"
    : "";
  console.log(
    unique.length === 0 ? `RESULT ast ${label}: no results${corpusHint}` : `RESULT ast ${label}: ${unique.length} hit(s)${overflow} in ${files} file(s)`,
  );
}

// One workspace project per invocation, via the ONE sanctioned bootstrap (scripts/ts-workspace.ts).
// types:true = root-tsconfig resolution options + full-workspace globs (the refs verb needs the
// language service to follow @orb/* exports and #aliases); types:false = the fast pure-AST arm.
// `wide` loads the TYPED arm's file set (searchGlobs — tests+fixtures+scripts) WITHOUT the type graph:
// a purely syntactic walk needs no language service, so `literal` gets the wide corpus at the cheap load.
function loadProject(needTypes: boolean, wide = false): Project {
  if (needTypes) {
    return getWorkspace({ root: REPO_ROOT, types: true });
  }
  if (wide) {
    return getWorkspace({ root: REPO_ROOT, types: false, globs: searchGlobs(REPO_ROOT) });
  }
  return getWorkspace({ root: REPO_ROOT, types: false });
}

/** Every exported (workspace-wide) or module-local (same-file refs still matter) declaration named `name`,
 *  over the SCANNED corpus (the caller's `scanCorpus` result — never a second walk of the project). */
function declarationsNamed(files: readonly SourceFile[], name: string): Node[] {
  // Dedupe by node identity: `getExportedDeclarations()` resolves THROUGH re-exports, so every barrel
  // that re-exports a shape returns the SAME origin node — without this, a barreled symbol counts one
  // "declaration" per barrel (false one-home alarm) and refs run/push once per duplicate (inflated hits).
  const candidates: Node[] = [];
  for (const sf of files) {
    candidates.push(...(sf.getExportedDeclarations().get(name) ?? []));
    candidates.push(...sf.getFunctions().filter((fn) => fn.getName() === name && !fn.isExported()));
    candidates.push(...sf.getVariableDeclarations().filter((v) => v.getName() === name && !v.isExported()));
  }
  const seen = new Set<string>();
  return candidates.filter((node) => {
    const key = `${node.getSourceFile().getFilePath()}:${node.getStart()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function cmdRefs(project: Project, name: string, flags: Flags): void {
  const decls = declarationsNamed(scanCorpus(project, WHOLE_CORPUS), name);
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
  for (const sf of scanCorpus(project, WHOLE_CORPUS)) {
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
  for (const sf of scanCorpus(project, WHOLE_CORPUS)) {
    hits.push(...staticImporterHits(sf, spec), ...dynamicImporterHits(sf, spec));
  }
  emit(hits, flags, `importers ${spec}`);
}

function cmdExports(project: Project, path: string, flags: Flags): void {
  const hits: Hit[] = [];
  // The scope IS the positional arg (a file or dir path substring) — a path that matches no loaded file is
  // now the same tool error a bad package scope has always been, instead of an empty export list.
  for (const sf of scanCorpus(project, { scope: path, label: `path:${path === "" ? "(none)" : path}` })) {
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
  for (const sf of scanCorpus(project, WHOLE_CORPUS)) {
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
  for (const sf of scanCorpus(project, WHOLE_CORPUS)) {
    for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
      if (id.getText() === name) {
        hits.push(hitOf(id, "ident"));
      }
    }
  }
  emit(hits, flags, `ident ${name}`);
}

// ── literal: string-LITERAL-only search — the exact complement of `ident` ──────────────────────────
// `ident` never looks inside a string; this verb never looks anywhere ELSE. A value-changing merge (an
// enum member, a wire field name, a user-facing label) needs "which code/tests pin this literal" as one
// receipted command — the coupled-fixture sweep the executor doctrine's "shared-value change owes a
// BATTERY" rule keeps paying a noisy `rg` for (comments AND identifiers both false-positive on it). Runs
// over the WIDE corpus (tests + fixtures + scripts), because that IS the point: a contract test pinning a
// literal in a fixture lives in `tests/`, which the syntactic verbs' harness-globs corpus does not admit
// past `scripts/check/gates`. Loaded WITHOUT the type graph (see `loadProject`'s `wide` arm) — a purely
// syntactic text match needs no language service, so the wide corpus costs the cheap ~10s load, not the
// typed one.

/** ONE static (non-interpolated) chunk of every `TemplateExpression` in `sf`: the `TemplateHead` plus each
 *  `TemplateSpan`'s trailing `TemplateMiddle`/`TemplateTail` — the text between `${…}` interpolations. An
 *  interpolated HOLE is never text, so it can never match; a `NoSubstitutionTemplateLiteral` (no `${}` at
 *  all) is handled separately below, as its own whole literal. */
function templateChunks(sf: SourceFile): { text: string; node: Node }[] {
  const chunks: { text: string; node: Node }[] = [];
  for (const tpl of sf.getDescendantsOfKind(SyntaxKind.TemplateExpression)) {
    const head = tpl.getHead();
    chunks.push({ text: head.getLiteralText(), node: head });
    for (const span of tpl.getTemplateSpans()) {
      const literal = span.getLiteral();
      chunks.push({ text: literal.getLiteralText(), node: literal });
    }
  }
  return chunks;
}

/** ONE file's literal-text hits: string literals, no-substitution template literals, and every static
 *  template chunk. Split off `cmdLiteral`'s loop so neither trips the complexity ceiling. */
function literalHitsIn(sf: SourceFile, value: string): Hit[] {
  const hits: Hit[] = [];
  for (const node of sf.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
    if (node.getLiteralText().includes(value)) {
      hits.push(hitOf(node, "string-literal"));
    }
  }
  for (const node of sf.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
    if (node.getLiteralText().includes(value)) {
      hits.push(hitOf(node, "template-literal"));
    }
  }
  for (const chunk of templateChunks(sf)) {
    if (chunk.text.includes(value)) {
      hits.push(hitOf(chunk.node, "template-chunk"));
    }
  }
  return hits;
}

function cmdLiteral(project: Project, value: string, flags: Flags): void {
  const hits: Hit[] = [];
  for (const sf of scanCorpus(project, WHOLE_CORPUS)) {
    hits.push(...literalHitsIn(sf, value));
  }
  emit(hits, flags, `literal ${value}`);
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
  /** DECLARATION-GRANULAR consumption: origin-key → the keys of the declarations whose bodies hold a
   *  consuming reference to it (plus the module-scope sentinel for a side-effect position). EMPTY unless
   *  `buildLiveness` was asked for it — see the section below for why it is parallel AND opt-in. Never
   *  consulted by a liveness verdict. */
  consumers: Map<string, Set<string>>;
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

/** What ONE `buildLiveness` call is asked to produce beyond the liveness sets. `edges` turns on the
 *  DECLARATION-GRANULAR consumption map (`Liveness.consumers`) — off by default so the push-tier ratchet
 *  pays neither its cost nor its risk. */
export type LivenessOptions = { readonly edges: boolean };

/** The default: liveness sets ONLY, byte- and cost-identical to the pass that predates the edge map. */
const NO_EDGES: LivenessOptions = { edges: false };

/** ONE resolution pass over the workspace: builds the prod/test origin-key sets and the star-target set.
 *  Runs in the same ~10s envelope as the old name pass — getModuleSpecifierSourceFile is memoized by
 *  ts-morph after the first resolve. With `{ edges: true }` it ALSO builds the declaration-granular
 *  consumption map, at the cost of one identifier walk per file; the liveness sets are identical either
 *  way (pinned in tests/tooling/ast-lens.test.ts, both arms). */
function buildLiveness(project: Project, options: LivenessOptions = NO_EDGES): Liveness {
  const usedClientProd = new Set<string>();
  const usedServerProd = new Set<string>();
  const usedTest = new Set<string>();
  const starTargets = new Set<string>();
  const arms = new Map<string, Set<ConsumptionArm>>();
  const namespaceSites: NamespaceSite[] = [];
  const consumers = new Map<string, Set<string>>();
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
    if (options.edges) {
      recordDeclarationEdges(sf, project, consumers);
    }
  }
  const usedProd = new Set<string>([...usedClientProd, ...usedServerProd]);
  return { usedProd, usedClientProd, usedServerProd, usedTest, starTargets, arms, namespaceSites, consumers };
}

// ── DECLARATION-GRANULAR consumption edges (the substrate `chains` needs, and nothing else reads) ──────
// Everything above attributes consumption at FILE granularity: `markImportConsumption` records that SOME
// import in file F reached origin key K, and `Liveness.arms` records WHICH ARM did it — never which
// DECLARATION inside F holds the consuming reference. That is exactly enough for orphans/testonly/clientgap/
// swallowed, all of which ask "does anything reach K?", and exactly NOT enough for the alias-rabbit-hole
// class: `export const Y = X` inside an otherwise-live file keeps X alive forever, even when nothing
// consumes Y. A FILE-level fixpoint cannot see it — it degenerates into iterated `prodonly` and reports the
// head of the chain only. The edge therefore has to name the DECLARATION a consuming reference sits inside.
//
// THE EDGE IS PARALLEL AND OPT-IN; both halves are load-bearing.
//   • PARALLEL — a new map on `Liveness`, never a change to usedProd/usedClientProd/usedServerProd/usedTest/
//     starTargets/arms/namespaceSites. The push-tier `deps:orphan-ratchet` judges the SAME candidate set the
//     `orphans` verb prints, so perturbing those sets is a GATE regression, not a lens change. Both arms are
//     pinned identical in the self-test, and the whole-workspace digests were diffed before/after (0 bytes).
//   • OPT-IN — it costs one identifier walk per source file, which the ratchet must not pay for a map it
//     never reads. `buildLiveness(project)` is unchanged in output AND in cost.
//
// HOW A REFERENCE IS ATTRIBUTED — syntactically, by ANCESTRY. Not the language service: `findReferences` per
// import specifier is the `refs` verb's cost times every import in the workspace, which would price the
// substrate out of existence. One identifier pass per file builds `local name → the keys of the TOP-LEVEL
// declarations whose subtree spells it`, and then:
//   1. an occurrence directly under a module-scope statement (`createRoot(el).render(<App/>)`, a bare call,
//      a top-level `if`) attributes to the file's MODULE-SCOPE key — a side-effect position no declaration
//      owns, and an unconditional ALIVE root for the fixpoint (nothing can make a side effect dead);
//   2. import/export SPECIFIER positions are SKIPPED outright. A specifier is where a name TRAVELS, never
//      where it is used — the rule `typeonly-alive`'s NEUTRAL_REF_KINDS already states. Counting
//      `import { X } from …` as a module-scope use would make every import an alive root and the whole
//      fixpoint a no-op (measured: it reports zero chains);
//   3. each import's local binding resolves to ORIGIN keys through `getExportedDeclarations()` — the same
//      hop the liveness uses, so a renaming barrel cannot fork the identity — and every consumer key of that
//      local name becomes an edge into each origin key. A namespace or dynamic import spreads the whole
//      target surface across the consumers of its alias / of the `import()` call (err alive, exactly as
//      `markModuleAlive` does);
//   4. SAME-FILE consumption rides the same map: a top-level declaration's own name looked up in it, minus
//      its own key (a self-reference is not life). This is `isReferencedInOwnFile` at declaration
//      granularity — the arm that turns an intra-file hop (`const Y = X; export const Z = Y`) into a visible
//      chain instead of a wall. NON-exported top-level declarations are nodes too: a chain that launders
//      itself through a file-local helper is the same defect.
//
// KNOWN OVER-ATTRIBUTION, stated so a reader can price a verdict: the in-file pass is NAME-based, so a local
// binding that SHADOWS an imported name, and a property-access tail (`obj.foo`) that happens to match one,
// both donate their enclosing declaration as a consumer. That direction is deliberate. An extra edge can only
// make a declaration look MORE alive, and a lens that nominates code for deletion must never err the other way.

/** The `<file>\0module` sentinel for a consuming reference at MODULE SCOPE — a side-effect position no
 *  declaration owns. Cannot collide with a `declKey`, whose second half is always a decimal offset. */
const MODULE_SCOPE_MARK = "module";

function moduleScopeKey(sf: SourceFile): string {
  return `${sf.getFilePath()}${KEY_SEP}${MODULE_SCOPE_MARK}`;
}

/** True for the module-scope sentinel — the fixpoint's unconditional alive root. */
function isModuleScopeKey(key: string): boolean {
  return key.endsWith(`${KEY_SEP}${MODULE_SCOPE_MARK}`);
}

/** The FILE half of any key this substrate mints (a `declKey` or the module-scope sentinel). */
function fileOfKey(key: string): string {
  const cut = key.lastIndexOf(KEY_SEP);
  return cut < 0 ? key : key.slice(0, cut);
}

/** Top-level statements whose identifiers are pure BINDING HOPS, never uses (see attribution rule 2).
 *
 *  `export default` splits: `export default someLocal` IS a hop (the local and the default export are the
 *  same declaration — `getExportedDeclarations()` resolves "default" straight to it, so counting the
 *  re-export as a use would make every default-exported symbol self-alive). `export default <expression>`
 *  is NOT: `export default { value: helper() }` genuinely CONSUMES `helper`, and skipping it left that
 *  reference attributed to nobody — the under-attribution direction, the one a lens nominating code for
 *  deletion must never take. A non-identifier default lands at module scope (an alive root), erring alive. */
function isBindingHopStatement(stmt: Node): boolean {
  if (Node.isExportAssignment(stmt)) {
    return Node.isIdentifier(stmt.getExpression());
  }
  return Node.isImportDeclaration(stmt) || Node.isExportDeclaration(stmt);
}

/** The identifier `BindingElement`s of a DESTRUCTURING declaration (`export const { a, b: c } = …`); empty
 *  for a plain `const x = …`.
 *
 *  THE IDENTITY RULE THIS ENFORCES (caught by the lens's own first audit, 2026-08-03): the whole substrate
 *  keys on the node `getExportedDeclarations()` hands back, and for a destructured export that node is the
 *  BindingElement — NOT the VariableDeclaration, whose `getName()` is the pattern text `"{ useAppForm }"`.
 *  Keying the node side on the VariableDeclaration while the consumer side keyed on the BindingElement forked
 *  the identity exactly the way a bare NAME does, and reported the entire `useAppForm` form kit — 32
 *  declarations, every bound field component in the client — as one chain-dead subtree. */
function boundElementsOf(decl: Node): BindingElement[] {
  if (!Node.isVariableDeclaration(decl) || Node.isIdentifier(decl.getNameNode())) {
    return [];
  }
  return decl.getDescendantsOfKind(SyntaxKind.BindingElement).filter((element) => Node.isIdentifier(element.getNameNode()));
}

/** The keys of the top-level DECLARATION(s) a statement declares, or empty when it declares nothing (an
 *  expression statement, an `if`, a `for` — a module-scope side-effect position). For a `VariableStatement`
 *  the declarator is chosen BY POSITION, so `const a = 1, b = usesX()` attributes to `b`; a DESTRUCTURING
 *  declarator yields EVERY bound element, because its initializer's consumption is kept alive by any one of
 *  the names it binds (`const { useAppForm } = createFormHook({ … })` — the registered field components are
 *  alive iff `useAppForm` is). */
function topLevelDeclarationKeys(stmt: Node, at: Node): string[] {
  if (Node.isVariableStatement(stmt)) {
    const pos = at.getStart();
    const decls = stmt.getDeclarations();
    const hit = decls.find((d) => d.getStart() <= pos && pos < d.getEnd()) ?? decls[0];
    if (hit === undefined) {
      return [];
    }
    const bound = boundElementsOf(hit);
    return bound.length > 0 ? bound.map((element) => declKey(element)) : [declKey(hit)];
  }
  const declares =
    Node.isFunctionDeclaration(stmt) ||
    Node.isClassDeclaration(stmt) ||
    Node.isEnumDeclaration(stmt) ||
    Node.isInterfaceDeclaration(stmt) ||
    Node.isTypeAliasDeclaration(stmt);
  return declares && stmt.getName() !== undefined ? [declKey(stmt)] : [];
}

/** The consumer keys a reference at `node` belongs to: the top-level declaration(s) whose subtree holds it,
 *  or the file's module-scope sentinel. EMPTY for a binding-hop position (skip it entirely). */
function consumerKeysOf(node: Node, sf: SourceFile): string[] {
  let statement: Node = node;
  let parent = statement.getParent();
  while (parent !== undefined && !Node.isSourceFile(parent)) {
    statement = parent;
    parent = statement.getParent();
  }
  if (parent === undefined || isBindingHopStatement(statement)) {
    return [];
  }
  const keys = topLevelDeclarationKeys(statement, node);
  return keys.length > 0 ? keys : [moduleScopeKey(sf)];
}

/** `local name → the consumer keys that spell it`, for ONE file. The single identifier pass both edge arms
 *  read; building it once is what keeps the whole substrate to one walk per file. */
function consumerSitesOf(sf: SourceFile): Map<string, Set<string>> {
  const sites = new Map<string, Set<string>>();
  for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const text = id.getText();
    const set = sites.get(text) ?? new Set<string>();
    for (const key of consumerKeysOf(id, sf)) {
      set.add(key);
    }
    if (set.size > 0) {
      sites.set(text, set);
    }
  }
  return sites;
}

/** Record `originKey ← consumerKey`. A self-edge (a declaration spelling its own name) is dropped: a
 *  declaration cannot keep itself alive, which is the property that makes the fixpoint terminate on a
 *  self-recursive function instead of calling it live. */
function addConsumerEdge(consumers: Map<string, Set<string>>, originKey: string, consumerKey: string): void {
  if (originKey === consumerKey) {
    return;
  }
  const set = consumers.get(originKey) ?? new Set<string>();
  set.add(consumerKey);
  consumers.set(originKey, set);
}

/** Link every consumer of a local binding to the ORIGIN declarations the exported name resolves to. */
function linkLocalBinding(target: SourceFile, exportName: string, consumerKeys: ReadonlySet<string> | undefined, consumers: Map<string, Set<string>>): void {
  if (consumerKeys === undefined || consumerKeys.size === 0) {
    return;
  }
  for (const decl of target.getExportedDeclarations().get(exportName) ?? []) {
    const originKey = declKey(decl);
    for (const consumerKey of consumerKeys) {
      addConsumerEdge(consumers, originKey, consumerKey);
    }
  }
}

/** ONE static import's declaration-granular edges. A namespace import spreads the target's WHOLE export
 *  surface across the consumers of its alias — the err-alive arm, unchanged in spirit from markModuleAlive. */
function recordImportEdges(imp: ImportDeclaration, sites: ReadonlyMap<string, Set<string>>, consumers: Map<string, Set<string>>): void {
  const target = imp.getModuleSpecifierSourceFile();
  if (target === undefined) {
    return;
  }
  const ns = imp.getNamespaceImport();
  if (ns !== undefined) {
    const consumerKeys = sites.get(ns.getText());
    for (const originKey of exposedNames(target).keys()) {
      for (const consumerKey of consumerKeys ?? []) {
        addConsumerEdge(consumers, originKey, consumerKey);
      }
    }
    return;
  }
  for (const spec of imp.getNamedImports()) {
    linkLocalBinding(target, spec.getName(), sites.get(spec.getAliasNode()?.getText() ?? spec.getName()), consumers);
  }
  const byDefault = imp.getDefaultImport();
  if (byDefault !== undefined) {
    linkLocalBinding(target, "default", sites.get(byDefault.getText()), consumers);
  }
}

/** The workspace file a `import("…")` CALL resolves to, or undefined when the node is not a dynamic import
 *  of a string literal this resolver can follow. */
function dynamicImportTargetOf(call: Node, sf: SourceFile, project: Project): SourceFile | undefined {
  if (!Node.isCallExpression(call) || call.getExpression().getKind() !== SyntaxKind.ImportKeyword) {
    return;
  }
  const arg = call.getArguments()[0];
  if (arg === undefined || !Node.isStringLiteral(arg)) {
    return;
  }
  return resolveModule(project, sf.getDirectoryPath(), arg.getLiteralText());
}

/** A dynamic `import()` keeps its target's whole surface alive — attributed to the declaration holding the
 *  CALL, which is finer than the import-edge arm can be (that one only knows the file). */
function recordDynamicImportEdges(sf: SourceFile, project: Project, consumers: Map<string, Set<string>>): void {
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const target = dynamicImportTargetOf(call, sf, project);
    if (target === undefined) {
      continue;
    }
    for (const consumerKey of consumerKeysOf(call, sf)) {
      markModuleEdges(target, consumerKey, consumers);
    }
  }
}

/** Every export of `target` gains `consumerKey` as a consumer — the whole-surface arm shared by the
 *  namespace-import and dynamic-import edges (err alive, exactly as `markModuleAlive` does). */
function markModuleEdges(target: SourceFile, consumerKey: string, consumers: Map<string, Set<string>>): void {
  for (const decls of target.getExportedDeclarations().values()) {
    for (const decl of decls) {
      addConsumerEdge(consumers, declKey(decl), consumerKey);
    }
  }
}

/** Every TOP-LEVEL declaration of a file, exported or not. A non-exported helper is a real hop in a chain —
 *  a rabbit hole that launders itself through a file-local alias is the same defect as one that exports it. */
/** ONE `const`/`let` statement's declarations: a plain declarator yields itself, a destructuring one yields
 *  every bound element (the identity `getExportedDeclarations()` hands back — see {@link boundElementsOf}). */
function* variableStatementDeclarations(stmt: Node): Generator<{ name: string; decl: Node }> {
  if (!Node.isVariableStatement(stmt)) {
    return;
  }
  for (const decl of stmt.getDeclarations()) {
    const bound = boundElementsOf(decl);
    if (bound.length === 0) {
      yield { name: decl.getName(), decl };
      continue;
    }
    for (const element of bound) {
      yield { name: element.getNameNode().getText(), decl: element };
    }
  }
}

/** The non-`const` top-level declaration kinds, each its own statement and its own name. */
function namedStatementDeclaration(stmt: Node): { name: string; decl: Node } | undefined {
  const named =
    Node.isFunctionDeclaration(stmt) ||
    Node.isClassDeclaration(stmt) ||
    Node.isEnumDeclaration(stmt) ||
    Node.isInterfaceDeclaration(stmt) ||
    Node.isTypeAliasDeclaration(stmt);
  const name = named ? stmt.getName() : undefined;
  return name === undefined ? undefined : { name, decl: stmt };
}

export function* topLevelDeclarations(sf: SourceFile): Generator<{ name: string; decl: Node }> {
  for (const stmt of sf.getStatements()) {
    yield* variableStatementDeclarations(stmt);
    const named = namedStatementDeclaration(stmt);
    if (named !== undefined) {
      yield named;
    }
  }
}

/** Every declaration-granular edge ONE file contributes: its import bindings resolved to origins, its
 *  dynamic-import targets, and its own top-level declarations' same-file uses. */
function recordDeclarationEdges(sf: SourceFile, project: Project, consumers: Map<string, Set<string>>): void {
  const sites = consumerSitesOf(sf);
  for (const imp of sf.getImportDeclarations()) {
    recordImportEdges(imp, sites, consumers);
  }
  recordDynamicImportEdges(sf, project, consumers);
  for (const { name, decl } of topLevelDeclarations(sf)) {
    const originKey = declKey(decl);
    for (const consumerKey of sites.get(name) ?? []) {
      addConsumerEdge(consumers, originKey, consumerKey);
    }
  }
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
  noteScope(`path:${scope.prefix}(no-files)`);
  exitToolError(`ast ${verb}: scope "${arg}" (tried path substring "${scope.prefix}") matched no source files — ${hint}`);
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

// The `@public` marker plus the REST OF ITS LINE — the reason. Read per-line and stripped of the JSDoc
// terminator on purpose: a naive `/@public\s+\S/` is satisfied by the `*/` of a BARE `/** @public */`
// (space, then `*` — a non-space char), which silently turns the reason requirement off. Probe-caught at the
// ratchet, 2026-08-03.
const PUBLIC_TAG_RE = /@public(?<reason>[^\n]*)/u;
const JSDOC_TERMINATOR_RE = /\*\/\s*$/u;

/** Does this declaration carry `/** @public <reason> *\/` in a LEADING comment, WITH a reason? (the
 *  `isUnwiredExempt` discipline: a bare marker is not a legal exemption.)
 *
 *  ONE HOME, deliberately: the push-tier ratchet (scripts/verify/orphan-export-ratchet.ts) reads this to
 *  decide which orphan candidates it judges, and the `chains` fixpoint reads it to decide which declarations
 *  are ALIVE ROOTS. Two spellings of the predicate would let the two disagree about what "deliberately
 *  unconsumed" means — and the chain lens would then report a whole tree hanging off a head the ratchet has
 *  already ratified. Reads through {@link commentHost}: a tagged `export const`'s JSDoc sits on the
 *  VariableStatement, not on the VariableDeclaration the liveness keys on. */
export function isPublicTagged(decl: Node): boolean {
  return commentHost(decl)
    .getLeadingCommentRanges()
    .some((range) => {
      const reason = PUBLIC_TAG_RE.exec(range.getText())?.groups?.["reason"];
      return reason !== undefined && reason.replace(JSDOC_TERMINATOR_RE, "").trim().length > 0;
    });
}

// The two NAMED, gate-verifiable anti-rot markers that SPLIT the old blanket `@public` exemption
// (docs/reviews/misc/2026-08-09-api-surface-classification.md — the parking-permit hole). A bare `@public`
// only ever lands on an UNUSED export (a consumed export is not an orphan candidate), so `@public` was
// certifying "intended-but-unconsumed" behind a prose reason a barrels lane writes for genuine rot as easily
// as for real future API. The split forces the claim to name a CHECKABLE target:
//   • `@public-twin: <ValueName>`   — the export is the type FACE of a value that is genuinely cross-package
//     PUBLIC api. The ratchet reds it unless apisurface classifies `<ValueName>` PUBLIC — a twin of an
//     INTERNAL (same-package-only) or UNUSED value is itself rot (an internal shape's type-face is not a
//     cross-boundary surface), so it must be DELETED, not parked.
//   • `@public-future: <named consumer/surface>` — a deliberately-unconsumed export waiting for a NAMED,
//     not-yet-built consumer. The reason is REQUIRED and must name the unbuilt surface.
// A BARE `@public <reason>` (the legacy spelling) is NO LONGER a legal orphan exemption — it reds, with the
// remedy "migrate to `@public-twin:`/`@public-future:` naming the target, or DELETE." Both new markers are
// two-sided from birth (the house shape): a twin whose value stops being PUBLIC reds; any `@public`-family
// marker that GAINS a prod consumer reds via the existing stale arm. Read the marker's line stripped of the
// JSDoc terminator (the `*/`-satisfies-`\S` footgun documented at PUBLIC_TAG_RE).
// The separator between `@public` and the twin/future keyword tolerates a HYPHEN or a SPACE: `@public-twin:`
// reads cleanest, but inside a `/** */` JSDoc block eslint's tsdoc/syntax rejects the hyphen (`@public` is a
// real TSDoc modifier tag; `@public-twin` is a malformed one), so package markers are authored `@public twin:`
// (the `@public` tag + text). Both spellings parse here; `//`-line markers may keep the hyphen.
const PUBLIC_TWIN_RE = /@public[-\s]+twin:(?<value>[^\n]*)/u;
const PUBLIC_FUTURE_RE = /@public[-\s]+future:(?<reason>[^\n]*)/u;
/** Splits a twin marker's tail on whitespace so the FIRST token is the named value (prose may follow). */
const MARKER_VALUE_SPLIT_RE = /\s+/u;

/** A resolved `@public`-family marker on a declaration: the two named exemptions plus the legacy `bare` form
 *  (kept distinct so the ratchet can red it with a precise remedy). `twin.value` is the NAMED value the type
 *  faces (verified PUBLIC by the caller); `future.reason`/`bare.reason` carry the stated rationale. */
export type PublicMarker =
  | { readonly kind: "twin"; readonly value: string }
  | { readonly kind: "future"; readonly reason: string }
  | { readonly kind: "bare"; readonly reason: string };

/** Strip the JSDoc terminator and surrounding space off a captured marker tail; empty ⇒ no legal reason. */
function markerTail(raw: string | undefined): string {
  return (raw ?? "").replace(JSDOC_TERMINATOR_RE, "").trim();
}

/** The `@public`-family marker in ONE comment's text, or undefined. Checks the two NAMED forms FIRST (a bare
 *  `@public` regex also matches `@public-twin`/`@public-future`, so order is the disambiguator), then the
 *  legacy bare form. `twin.value` is the FIRST token after the colon (prose may follow); a colon-marker with
 *  an empty tail falls through to bare (an unnamed twin/future is not a legal named exemption). */
function markerInComment(text: string): PublicMarker | undefined {
  const twin = markerTail(PUBLIC_TWIN_RE.exec(text)?.groups?.["value"]);
  if (twin.length > 0) {
    return { kind: "twin", value: twin.split(MARKER_VALUE_SPLIT_RE)[0] ?? twin };
  }
  const future = markerTail(PUBLIC_FUTURE_RE.exec(text)?.groups?.["reason"]);
  if (future.length > 0) {
    return { kind: "future", reason: future };
  }
  const bare = markerTail(PUBLIC_TAG_RE.exec(text)?.groups?.["reason"]);
  return bare.length > 0 ? { kind: "bare", reason: bare } : undefined;
}

/** The `@public`-family marker on `decl` (the first of its leading comments that carries one), or undefined.
 *  ONE HOME beside {@link isPublicTagged} so the ratchet and any lens read the same grammar. Reads through
 *  {@link commentHost} (a tagged `export const`'s JSDoc sits on the VariableStatement). */
export function publicMarkerOf(decl: Node): PublicMarker | undefined {
  return commentHost(decl)
    .getLeadingCommentRanges()
    .map((range) => markerInComment(range.getText()))
    .find((marker) => marker !== undefined);
}

/** A candidate as a printable Hit — `<name>  —  <declaration line>`, the form both lists use. */
function candidateHit(candidate: OrphanCandidate, kind: string): Hit {
  const h = hitOf(candidate.decl, kind);
  h.text = `${candidate.name}  —  ${h.text}`;
  return h;
}

/** THE ONE BUCKET PRINTER — a set of candidates a lens deliberately does NOT count as hits, NAMED (file:line
 *  + symbol) rather than reduced to a number. Used by every "recognized, not a finding" arm in this file
 *  (orphans star-suppression, the typeonly union-source idiom, testonly's declared test seams) so the three
 *  cannot drift apart. `headline` is a function of the deduped count + file count, because both are decided
 *  here. Capped by `--max` with an explicit elision line — the count is always exact. */
function printNamedBucket(rows: readonly Hit[], flags: Flags, headline: (count: number, files: number) => string): void {
  if (rows.length === 0) {
    return;
  }
  const unique = dedupe([...rows], flags).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  if (unique.length === 0) {
    return;
  }
  console.log(headline(unique.length, new Set(unique.map((h) => h.file)).size));
  for (const h of unique.slice(0, flags.max)) {
    console.log(`  ~ ${h.file}:${h.line}  [${h.kind}]  ${h.text}`);
  }
  if (unique.length > flags.max) {
    console.log(`  … and ${unique.length - flags.max} more (raise --max)`);
  }
}

/** Name every star-suppressed candidate: the 14 hidden contracts/rpg candidates are the ones a reader must
 *  actually go look at, and "8 files" told them nothing. */
function printSuppressed(suppressed: readonly Hit[], hitCount: number, flags: Flags): void {
  printNamedBucket(
    suppressed,
    flags,
    (count, files) =>
      `orphans: ${count} of ${hitCount + count} candidate(s) SUPPRESSED by star re-exports in ${files} file(s) — named below, NOT counted as hits (a namespace consumer of the re-exporting barrel may reach them):`,
  );
}

/** Exports of a scope never imported anywhere (prod OR test) and never used in their own file — the rot
 *  signal. Star-suppressed candidates are counted + named PER SYMBOL, never silently swallowed (the
 *  permanent-zero `orphans contracts` bug: 100%-barrel packages reported clean while blind). */
function cmdOrphans(project: Project, arg: string, flags: Flags): void {
  const scope = resolveScope(project, arg, "orphans");
  const inScope = corpusPredicate(scanCorpus(project, { scope: scope.prefix, label: `path:${scope.prefix}`, skip: [SKIP_TEST_FILES] }));
  const live = buildLiveness(project);
  const candidates = collectOrphanCandidates(project, live, inScope);
  const hits = candidates.filter((c) => !c.starSuppressed).map((c) => candidateHit(c, "orphan-export"));
  const suppressed = candidates.filter((c) => c.starSuppressed).map((c) => candidateHit(c, "star-suppressed"));
  printSuppressed(suppressed, dedupe(hits, flags).length, flags);
  emit(hits, flags, `orphans ${scope.label}`);
}

/** THE DECLARED-INTENT PREFIX (lens calibration, owner ruling 2026-08-13). `__resetTagFilter` /
 *  `__readComposerDraftsForTest` is the repo's TEST-SEAM CONVENTION (the executor doctrine's "a test-only
 *  export is self-identifying" rule): the author already declared, in the NAME, that a test is the only
 *  legitimate consumer. Reporting one as "alive only because a test imports it" restates its own name back at
 *  the reader — 21 of the 31 client rows in the calibration corpus were exactly that. The prefix IS the
 *  marker, so this class needs no comment tag; a seam is bucketed and named, never counted as a hit. */
const TEST_SEAM_PREFIX = "__";

/** One export's testonly verdict: not a hit at all, a hit, or a bucketed declared test seam. */
export type TestOnlyClass = "alive" | "hit" | "seam";

export function testOnlyClassOf(sf: SourceFile, name: string, decl: Node, live: Liveness): TestOnlyClass {
  const key = declKey(decl);
  // Prod-reached (named import, namespace, dynamic import, or same-file production use) → alive.
  if (live.usedProd.has(key) || isReferencedInOwnFile(sf, name, decl) || !live.usedTest.has(key)) {
    return "alive";
  }
  return name.startsWith(TEST_SEAM_PREFIX) ? "seam" : "hit";
}

function scanTestOnly(sf: SourceFile, live: Liveness, want: TestOnlyClass): Hit[] {
  const out: Hit[] = [];
  for (const { name, decl } of ownExports(sf)) {
    if (testOnlyClassOf(sf, name, decl, live) !== want) {
      continue;
    }
    const h = hitOf(decl, want === "seam" ? "declared-test-seam" : "test-only-export");
    h.text = `${name}  —  ${h.text}`;
    out.push(h);
  }
  return out;
}

/** Exports of `<scope>` reached ONLY from test paths — code alive solely because a test imports it. Exports
 *  whose NAME declares the intent (`__`-prefixed test seams) are bucketed and named, never counted. */
function cmdTestOnly(project: Project, arg: string, flags: Flags): void {
  const scope = resolveScope(project, arg, "testonly");
  const files = scanCorpus(project, { scope: scope.prefix, label: `path:${scope.prefix}`, skip: [SKIP_TEST_FILES] });
  const live = buildLiveness(project);
  const hits: Hit[] = [];
  const seams: Hit[] = [];
  for (const sf of files) {
    hits.push(...scanTestOnly(sf, live, "hit"));
    seams.push(...scanTestOnly(sf, live, "seam"));
  }
  printTestSeamBucket(seams, flags);
  emit(hits, flags, `testonly ${scope.label}`);
}

/** Name every DECLARED TEST SEAM — same posture as the `orphans` star-suppression block: the reader still
 *  gets the list, it just is not a finding. */
function printTestSeamBucket(seams: readonly Hit[], flags: Flags): void {
  printNamedBucket(
    seams,
    flags,
    (count) =>
      `testonly: ${count} export(s) BUCKETED as DECLARED test seams (a \`${TEST_SEAM_PREFIX}\`-prefixed name — the repo's self-identifying test-seam convention, so "only a test reaches it" is the stated intent, not a finding). Named below, NOT counted as hits:`,
  );
}

// ── prodonly: entry-closure FILE reachability (the knip Unused-files lens) ─────────────────────
// testonly/orphans are SYMBOL lenses; prodonly is the FILE lens they can't be. It walks the resolved
// import graph from the workspace's real PRODUCTION entry points and reports source files no entry can
// reach — the instrument that sees the whole rpg pending-seam cluster (dead FILES, not dead symbols).
//
// A file reachable ONLY from a test is prod-unreachable BY DESIGN of this lens (that's its whole point —
// it complements testonly). So tests/ + scripts/ are NOT entries and NOT graph nodes here.

/** The production entry FILES, derived honestly from the authorities (never a parallel definition):
 *   1. knip.ts's per-workspace `entry` globs (kit/contracts/db = every nested barrel index, client = html);
 *   2. each package.json `exports` map (the auto-detected surface for ui/server/client) — Node resolves
 *      `./*` across slashes, so every nested `index.ts` addressable as a subpath is an entry;
 *   3. each package.json `scripts` command's `.ts` targets ({@link scriptEntryPaths}) and the package-root
 *      TOOL CONFIG convention ({@link TOOLING_CONFIG_GLOB}) — see the tooling-entrypoint note below.
 *  The `!` production markers are stripped (they already mean "production entry"). index.html isn't a
 *  source file, so its `<script type=module>` target `src/main.tsx` stands in (knip's own auto-detection).
 *
 *  TOOLING ENTRY POINTS ARE ENTRIES (lens calibration, owner ruling 2026-08-13). `drizzle.config.ts`,
 *  `vite.config.ts` and `tokens.build.ts` are loaded BY A TOOL — by filename convention or by a package
 *  script — so no import edge points at them BY DESIGN, and the old derivation reported all three as
 *  prod-unreachable rot. They are derived, not allowlisted: a hand-written list of three paths is the same
 *  rot the ledger forbids, and this file already ate the proof — the ONE hardcoded tooling anchor here named
 *  `src/tokens/tokens.build.ts`, a path that has not existed since the file moved to the package root, and
 *  it failed SILENTLY (a hardcoded `add()` on a missing file is a no-op). Hence {@link addAnchor}: a
 *  declared anchor that resolves to nothing is now a TOOL ERROR, because a blind lens must never read clean. */
function deriveEntryFiles(project: Project): Set<string> {
  const entries = new Set<string>();
  for (const pkg of WORKSPACE_PACKAGES) {
    const dir = `${REPO_ROOT}/packages/${pkg}`;
    for (const glob of [...knipEntryGlobs(pkg), ...exportsEntryPaths(dir), ...scriptEntryPaths(dir), ...toolingConfigNames(project, dir)]) {
      addGlobMatches(project, `${dir}/${glob}`, entries);
    }
  }
  addAnchor(project, entries, `${REPO_ROOT}/packages/client/src/main.tsx`, "index.html's <script type=module> target");
  return entries;
}

/** A build tool loads its config by FILENAME, from the package ROOT — `vite.config.ts`, `drizzle.config.ts`.
 *  Nothing imports them and nothing can: they are the tool's own entry. Matched by directory identity rather
 *  than a glob, because {@link globToRegExp} deliberately lets `*` cross slashes (Node exports semantics) and
 *  a `*.config.ts` glob would therefore also swallow a real module at `src/**\/x.config.ts`. */
const TOOLING_CONFIG_SUFFIX = ".config.ts";

export function toolingConfigNames(project: Project, pkgDir: string): string[] {
  const names: string[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    const slash = fp.lastIndexOf("/");
    if (fp.slice(0, slash) === pkgDir && fp.endsWith(TOOLING_CONFIG_SUFFIX)) {
      names.push(fp.slice(slash + 1));
    }
  }
  return names;
}

const SCRIPT_TS_TOKEN_RE = /[\w./-]+\.tsx?\b/gu;

/** The `.ts`/`.tsx` targets named by a package's own `scripts` commands (`node tokens.build.ts` →
 *  `tokens.build.ts`) — the same auto-detection knip performs, read off the same package.json. A token that
 *  resolves to no source file is simply not an entry; the glob matcher already ignores it. */
export function scriptEntryPaths(pkgDir: string): string[] {
  const raw = readFileSync(`${pkgDir}/package.json`, "utf8");
  const scripts = (JSON.parse(raw) as { scripts?: Record<string, string> }).scripts ?? {};
  return Object.values(scripts)
    .flatMap((cmd) => cmd.match(SCRIPT_TS_TOKEN_RE) ?? [])
    .map((token) => token.replace(DOT_SLASH_RE, ""));
}

/** A NAMED anchor entry (a path this file asserts is an entry, derived from something outside the TS graph).
 *  A missing anchor is a TOOL ERROR, never a silent skip: the whole package it anchors would report as
 *  prod-unreachable rot, and that reads exactly like a real finding. */
function addAnchor(project: Project, entries: Set<string>, fp: string, why: string): void {
  if (project.getSourceFile(fp) === undefined) {
    exitToolError(
      `ast prodonly: the declared entry anchor ${relPath(fp)} (${why}) does not exist — the entry closure is WRONG, so every file it reaches would report as prod-unreachable. Fix the anchor in deriveEntryFiles, do not act on this run.`,
    );
  }
  entries.add(fp);
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
  // `.d.ts` ambient declarations are consumed by the type system, never by an import edge — they are
  // never "reachable" and are not orphans (knip excludes them from unused-files too).
  const files = scanCorpus(project, { scope: scope.prefix, label: `path:${scope.prefix}`, skip: [SKIP_TEST_FILES, SKIP_DECLARATION_FILES] });
  const reachable = reachableFrom(deriveEntryFiles(project), project);
  const hits: Hit[] = [];
  for (const sf of files) {
    if (!reachable.has(sf.getFilePath())) {
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
  // A package name this corpus holds no file for is a tool error, not "no cycles" — the graph would be
  // empty either way, and an empty graph reads exactly like a clean one.
  scanCorpus(project, { scope: prefix, label: `path:${prefix}` });
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
  for (const sf of scanCorpus(project, { scope, label: `path:${scope === "" ? "(all)" : scope}` })) {
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
//
// THE VALUE-SIDE READ HAS FOUR SPELLINGS, NOT ONE (lens calibration, 2026-08-13). The proxy is an ordinary
// object at the value level, so every JS member-read form reaches a procedure and each is a separate AST
// kind: `trpc.ns.proc` (PropertyAccess), `trpc.ns["proc"]` and `trpc["ns"].proc` (ElementAccess), and the
// optional-chained `trpc?.ns?.proc`. A dot-only matcher is the "property read has THREE shapes" false clean
// applied to a whole lens: ONE consumer written with brackets reads as an unwired verb, and the natural fix
// (delete it) would break the client. {@link memberReadOf} normalizes all four to `(object, name)` so the
// pair matcher below sees one shape. (Optional chaining needs no special case — ts-morph models `a?.b` as a
// PropertyAccessExpression with a question-dot token — but it IS covered by a planted control in the
// self-test, because "needs no special case" is a claim that must be provable, not assumed.)

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
    for (const kind of [SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression] as const) {
      for (const access of sf.getDescendantsOfKind(kind)) {
        markConsumedFromAccess(access, valid, looseProcs, consumed);
      }
    }
    for (const ia of sf.getDescendantsOfKind(SyntaxKind.IndexedAccessType)) {
      markConsumedFromIndexedType(ia, valid, consumed);
    }
  }
  return consumed;
}

/** ONE value-level member read as `(object, name)`, whatever spelling it wears: `x.name`, `x?.name`,
 *  `x["name"]`. Undefined for a computed element access (`x[key]`) — that names no procedure statically, and
 *  guessing one would be a fabricated consumer. */
function memberReadOf(node: Node): { object: Node; name: string } | undefined {
  if (Node.isPropertyAccessExpression(node)) {
    return { object: node.getExpression(), name: node.getName() };
  }
  if (!Node.isElementAccessExpression(node)) {
    return;
  }
  const arg = node.getArgumentExpression();
  return arg !== undefined && Node.isStringLiteral(arg) ? { object: node.getExpression(), name: arg.getLiteralText() } : undefined;
}

/** A `X.<ns>.<proc>` access marks `<ns>.<proc>` consumed; a `X.<proc>` access whose tail is a known loose
 *  root procedure marks that bare name consumed. Both hops go through {@link memberReadOf}, so a bracket or
 *  optional-chained spelling of either hop counts exactly like the dot form. */
function markConsumedFromAccess(node: Node, valid: Set<string>, looseProcs: Set<string>, consumed: Set<string>): void {
  const outer = memberReadOf(node);
  if (outer === undefined) {
    return;
  }
  const proc = outer.name;
  const inner = memberReadOf(outer.object);
  if (inner !== undefined) {
    const full = `${inner.name}.${proc}`;
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
  scanCorpus(project, WHOLE_CORPUS);
  const procs = collectServerProcedures(project);
  // The scope of THIS lens is the enumerated procedure set, not a path: zero procedures means the
  // `appRouter = t.router({…})` shape stopped matching, and a structurally blind run must not print clean.
  noteUnits("procs", procs.length);
  if (procs.length === 0) {
    exitToolError(
      "ast unwired: enumerated ZERO server procedures — the `appRouter = t.router({ … })` shape this lens derives from did not match, so nothing could be reported. Re-check packages/server/src/transport (the router shape), not the client.",
    );
  }
  if (scope !== "") {
    // A `<ns>.<proc>` substring that names no enumerated procedure is a scope that entered nothing —
    // the router-name typo that used to read as "this router is fully wired".
    const scoped = procs.filter((p) => p.full.includes(scope));
    noteUnits(`procs-matching-"${scope}"`, scoped.length);
    if (scoped.length === 0) {
      exitToolError(
        `ast unwired: scope "${scope}" matched none of the ${procs.length} enumerated procedure(s) — pass a \`<ns>.<proc>\` substring (a router name), or run bare for all.`,
      );
    }
  }
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
  const files = scanCorpus(project, { scope: scope.prefix, label: `path:${scope.prefix}`, skip: [SKIP_TEST_FILES] });
  const live = buildLiveness(project);
  const hits: Hit[] = [];
  for (const sf of files) {
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
  const inScope = corpusPredicate(scanCorpus(project, { scope: scope.prefix, label: `path:${scope.prefix}`, skip: [SKIP_TEST_FILES] }));
  const live = buildLiveness(project);
  const candidates = collectSwallowedCandidates(project, live, inScope);
  printStaleSwallowedTags(project, inScope, new Set(candidates.map((c) => declKey(c.decl))));
  const hits = candidates.filter((c) => !isSwallowedExempt(c.decl)).map(swallowedHit);
  const exempt = candidates.length - hits.length;
  console.log(
    `swallowed is a CANDIDATE lens — a hit may be load-bearing THROUGH the swallowing API itself (drizzle reads a \`relations()\` config it is handed without your code ever naming it). It finds exports whose only liveness is a whole-module \`import * as\`; the verdict is a human's. Keep one deliberately with \`// @swallowed-ok: <reason>\` on the declaration.${exempt === 0 ? "" : ` (${exempt} candidate(s) exempted by a reasoned marker.)`}`,
  );
  emit(hits, flags, `swallowed ${scope.label}`);
}

// ── dead: a composite evidence-ladder verdict for ONE symbol ────────────────────────────────────────
// Classifying one orphan today costs five separate commands (refs, ident, swallowed, a marker grep, a
// comment grep) plus the reader's own glue to line the results up. This composite resolves the symbol
// ONCE (`declarationsNamed`, the same substrate `refs` uses) and lays the evidence out as a compact
// table: production references / test-only references / namespace-swallowed consumption / the `@public`
// marker / a vendored-file home / raw comment-line mentions — then states a verdict.
//
// IT IS A CANDIDATE LENS, like `swallowed`/`typeonly-alive`/`chains` — the verdict is a human's, never a
// delete signal ("unwired ≠ worthless", constitution §1). Evidence PRIORITY, not accumulation: a single
// production reference outranks everything else (ALIVE); a namespace-only reach may still be load-bearing
// THROUGH the swallowing API (SWALLOWED-ONLY); a `@public`-family marker is the author's own ratified
// keep (TAGGED-KEEP); reach from a test alone is `testonly`'s class (TEST-ANCHORED); only when none of
// those apply does it become a CANDIDATE.

/** The five-way verdict `dead` renders — evidence PRIORITY order (see the header above), not a tally. */
export type DeadVerdict = "ALIVE" | "TEST-ANCHORED" | "SWALLOWED-ONLY" | "TAGGED-KEEP" | "CANDIDATE";

/** The full evidence ladder for one declaration — every arm `dead` prints ahead of the verdict. */
export type DeadEvidence = {
  readonly verdict: DeadVerdict;
  readonly prodRefs: readonly string[];
  readonly prodCount: number;
  readonly testRefs: readonly string[];
  readonly testCount: number;
  readonly swallowedSites: readonly string[];
  readonly publicMarker: PublicMarker | undefined;
  readonly vendored: boolean;
  readonly commentMentions: number;
};

/** How many sites a `dead` row names before it collapses to a count. */
const DEAD_SITES_SHOWN = 3;
/** A file path plausibly VENDORED — third-party code kept in-tree. There is no structural marker for
 *  this in the repo (informational only, unlike `@public`/`@swallowed-ok`): a `/vendor/` directory, or
 *  the file's own header comment saying so (the `build-argv.ts` chat-template convention). Vendored code
 *  can still be genuinely dead — this arm is context for the reader, never a verdict input. */
const VENDORED_PATH_RE = /\/vendor\//u;
const VENDORED_HEADER_RE = /\bvendored\b/iu;

/** `<repo-rel file>:<line>`, deduped and sorted prod-first, for a set of reference nodes. */
function siteListOf(nodes: readonly Node[]): string[] {
  return [...new Set(nodes.map((n) => `${relPath(n.getSourceFile().getFilePath())}:${n.getStartLineNumber()}`))].sort(byProdFirst);
}

/** `decl`'s own file lives under a `/vendor/` directory, or its FILE-level leading comment (the header,
 *  never the declaration's own leading comment) says "vendored". */
function isVendoredHome(decl: Node): boolean {
  if (VENDORED_PATH_RE.test(decl.getSourceFile().getFilePath())) {
    return true;
  }
  const header = decl.getSourceFile().getStatements()[0];
  return header?.getLeadingCommentRanges().some((range) => VENDORED_HEADER_RE.test(range.getText())) ?? false;
}

/** Raw COMMENT-TEXT mentions of `name` anywhere in `sf` — the one arm in this file that deliberately
 *  reads comments (every other lens excludes them by construction). Informational only: a TODO or design
 *  note naming a symbol is not liveness, but it is context a deletion call should read before acting.
 *  Comment ranges are deduped by start position — a range can attach as both one node's trailing trivia
 *  and the next node's leading trivia. */
function commentMentionsOf(sf: SourceFile, name: string): number {
  const seen = new Set<number>();
  let mentions = 0;
  sf.forEachDescendant((node) => {
    for (const range of [...node.getLeadingCommentRanges(), ...node.getTrailingCommentRanges()]) {
      if (seen.has(range.getPos())) {
        continue;
      }
      seen.add(range.getPos());
      if (range.getText().includes(name)) {
        mentions += 1;
      }
    }
  });
  return mentions;
}

/** The evidence-priority verdict (see the section header): ALIVE beats SWALLOWED-ONLY beats TAGGED-KEEP
 *  beats TEST-ANCHORED beats CANDIDATE. */
function deadVerdictOf(prodCount: number, swallowed: boolean, tagged: boolean, testCount: number): DeadVerdict {
  if (prodCount > 0) {
    return "ALIVE";
  }
  if (swallowed) {
    return "SWALLOWED-ONLY";
  }
  if (tagged) {
    return "TAGGED-KEEP";
  }
  return testCount > 0 ? "TEST-ANCHORED" : "CANDIDATE";
}

/** A reference that is only a re-export PASS-THROUGH (`export { X } from "./y"`, no `from`-less local
 *  re-export) — `findReferencesAsNodes` counts the specifier as a "reference", but `buildLiveness`
 *  deliberately does NOT (the MemoryLogEntry class: a file re-exporting its own symbol must not read as
 *  using it). Excluding this class is what keeps `dead`'s ALIVE verdict agreeing with `testonly`'s: a
 *  barrel that only re-exports a test-only export must not read as a production consumer of it. */
function isReexportPassthroughRef(ref: Node): boolean {
  const spec = ref.getFirstAncestorByKind(SyntaxKind.ExportSpecifier);
  const exportDecl = spec?.getFirstAncestorByKind(SyntaxKind.ExportDeclaration);
  return exportDecl?.getModuleSpecifier() !== undefined;
}

/** The whole evidence ladder for ONE declaration. Reuses the SAME collector `swallowed` calls
 *  (`collectSwallowedCandidates`), scoped to just this declaration's own file, so the two lenses can
 *  never disagree about what "namespace-swallowed" means. */
export function deadEvidenceFor(project: Project, decl: Node, name: string, live: Liveness): DeadEvidence {
  const sf = decl.getSourceFile();
  const refs = Node.isReferenceFindable(decl)
    ? decl
        .findReferencesAsNodes()
        .filter((r) => !(r.getSourceFile() === sf && r.getParent()?.getStart() === decl.getStart()))
        .filter((r) => !isReexportPassthroughRef(r))
    : [];
  const prodNodes = refs.filter((r) => !isTestPath(r.getSourceFile().getFilePath()));
  const testNodes = refs.filter((r) => isTestPath(r.getSourceFile().getFilePath()));
  const swallowed = collectSwallowedCandidates(project, live, (fp) => fp === sf.getFilePath()).find((c) => declKey(c.decl) === declKey(decl));
  const publicMarker = publicMarkerOf(decl);
  return {
    verdict: deadVerdictOf(prodNodes.length, swallowed !== undefined, publicMarker !== undefined, testNodes.length),
    prodRefs: siteListOf(prodNodes).slice(0, DEAD_SITES_SHOWN),
    prodCount: prodNodes.length,
    testRefs: siteListOf(testNodes).slice(0, DEAD_SITES_SHOWN),
    testCount: testNodes.length,
    swallowedSites: swallowed?.sites ?? [],
    publicMarker,
    vendored: isVendoredHome(decl),
    commentMentions: commentMentionsOf(sf, name),
  };
}

/** `<name>` for a `twin`/`future`/`bare` marker — the one field each kind carries. */
function publicMarkerText(marker: PublicMarker | undefined): string {
  if (marker === undefined) {
    return "none";
  }
  return marker.kind === "twin" ? `twin — ${marker.value}` : `${marker.kind} — ${marker.reason}`;
}

/** `N (site, site, … +M more)` — the `dead` table's reference-count cell. */
function deadRefsCell(count: number, sites: readonly string[]): string {
  if (count === 0) {
    return "0";
  }
  const more = count > sites.length ? ` +${count - sites.length} more` : "";
  return `${count} (${sites.join(", ")}${more})`;
}

/** `  <label> <value>` — the `dead` table's fixed left-column width. */
const DEAD_LABEL_PAD = 20;
function deadRow(label: string, value: string): string {
  return `  ${label.padEnd(DEAD_LABEL_PAD)} ${value}`;
}

function printDeadEvidence(name: string, decl: Node, evidence: DeadEvidence): void {
  console.log(`dead ${name} @ ${declSite(decl)}`);
  console.log(deadRow("production refs:", deadRefsCell(evidence.prodCount, evidence.prodRefs)));
  console.log(deadRow("test-only refs:", deadRefsCell(evidence.testCount, evidence.testRefs)));
  const swallowedCell =
    evidence.swallowedSites.length === 0 ? "no" : `YES — namespace-swallowed by ${evidence.swallowedSites.slice(0, DEAD_SITES_SHOWN).join(", ")}`;
  console.log(deadRow("swallowed:", swallowedCell));
  console.log(deadRow("@public marker:", publicMarkerText(evidence.publicMarker)));
  console.log(deadRow("vendored home:", evidence.vendored ? "yes (informational)" : "no"));
  console.log(deadRow("comment mentions:", `${evidence.commentMentions} (informational — raw comment text, never liveness)`));
  console.log(deadRow("VERDICT:", evidence.verdict));
}

/** A composite evidence-ladder verdict for ONE symbol: production refs / test-only refs / namespace-
 *  swallowed consumption / the `@public` marker / a vendored-file home / raw comment mentions, then a
 *  verdict — ALIVE / TEST-ANCHORED / SWALLOWED-ONLY / TAGGED-KEEP / CANDIDATE. CANDIDATE lens — see the
 *  section header above. Multiple declarations of the same name (a collision) are each classified. */
function cmdDead(project: Project, name: string, flags: Flags): void {
  const decls = declarationsNamed(scanCorpus(project, WHOLE_CORPUS), name);
  if (decls.length === 0) {
    console.log(`dead ${name}: no declaration found — try \`pnpm ast ident ${name}\``);
    emit([], flags, `dead ${name}`);
    return;
  }
  const live = buildLiveness(project);
  const hits: Hit[] = [];
  for (const decl of decls) {
    const evidence = deadEvidenceFor(project, decl, name, live);
    printDeadEvidence(name, decl, evidence);
    const h = hitOf(decl, `dead-${evidence.verdict.toLowerCase()}`);
    h.text = `${name}  —  ${evidence.verdict}  —  ${h.text}`;
    hits.push(h);
  }
  console.log(
    'dead is a CANDIDATE lens — an evidence-ladder verdict for ONE symbol (production refs / test-only refs / namespace-swallowed consumption / the @public marker / a vendored-file home / raw comment mentions). "Unwired ≠ worthless" (constitution §1): the verdict is a human\'s, never a delete signal.',
  );
  emit(hits, flags, `dead ${name} (${decls.length} declaration(s))`);
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
    exitToolError(
      "ast respell: this TypeScript build exposes no `checker.isTypeAssignableTo` (a TS internal this lens depends on) — the comparison cannot run. Re-verify the API after a TypeScript bump; scripts/codemods/ast.ts.",
    );
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
  noteUnits("domains", domains.length);
  if (domains.length === 0) {
    exitToolError(`ast respell: no domain contract/ dir matched "${arg}" — try a domain name (chat, rpg, preset, …) or run bare for all.`);
  }
  // The candidate corpus is BOTH sides of the comparison: the domain `contract/` dirs and their sibling
  // `@orb/contracts/<domain>` packages. A domain whose contracts package is empty is why a run can be
  // legitimately quiet — `scanned` shows which side actually held files.
  scanCorpus(project, {
    scope: domains.flatMap((d) => [`/packages/contracts/src/${d}/`, `/packages/server/src/domain/${d}/contract/`]),
    label: `path:domain-contracts(${domains.length})`,
  });
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
//
// THE UNION-SOURCE IDIOM IS BUCKETED, NOT FLAGGED (lens calibration, owner ruling 2026-08-13). Measured on
// this tree: 46 of 47 hits were `export const X = [...] as const` whose ONLY reference is `(typeof X)[number]`
// — THIS REPO'S STANDARD way to give a string union a runtime source of truth (§5.5 string-union dispatch:
// one importable union + the tuple it derives from). Reporting that as rot is the lens crying wolf, and a
// lens that cries wolf gets ignored. So a type-only-alive candidate whose declaration is `<literal> as const`
// (through the `satisfies` wrapper — see {@link isConstAsserted}) is UNION-SOURCE: the author declared a
// frozen runtime value and derived the type FROM it, which is the opposite of "a value kept alive by a shape
// it satisfies". That single tell is what keeps the lens biting instead of blanket-exempting: a zod schema
// whose only reference is `z.infer<typeof s>` carries no `as const` and stays a REAL finding (measured — it
// is the one row of 47 left standing on the calibration corpus). Bucketed rows are NAMED, never silently
// swallowed (the `orphans` star-suppression precedent) — a reader still gets the list, it just is not a
// finding, and it is still a CANDIDATE, so the two-sided `@typeonly-ok` stale arm is unaffected.

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
 *  liveness (the files a human must read to render the verdict — "is this shape-conformance deliberate?").
 *  `unionSource` marks the repo's `as const` + `typeof X[number]` idiom — a bucketed row, never a hit. */
export type TypeOnlyCandidate = {
  readonly name: string;
  readonly decl: Node;
  readonly sites: readonly string[];
  readonly unionSource: boolean;
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
  if (sites.size === 0) {
    return;
  }
  return { name, decl, sites: [...sites].sort(byProdFirst), unionSource: isConstAsserted(decl) };
}

/** The union-source idiom's TELL: the declaration is `<literal> as const` (through the `satisfies` /
 *  parenthesis wrappers this repo writes it with — `as const satisfies readonly string[]` is the live
 *  spelling in `packages/contracts/src/preset/index.ts:123`, and missing it cost two false hits in the first
 *  cut of this calibration). The `as const` is the author declaring "this frozen value is the source of
 *  truth"; a plain object/array literal makes no such claim, which is what keeps a zod schema whose only
 *  reference is `z.infer<typeof s>` a REAL finding.
 *
 *  WHY THE `typeof` HALF IS NOT A SEPARATE TEST, stated because its absence looks like a gap: the candidate
 *  is already type-only-alive, and TypeScript has NO way to name a `const` in a type position except through
 *  a `typeof` query (a value is not a type). So "every reference is a type query" is entailed here, not
 *  checked — and a check that cannot fail is not evidence, it is decoration. The first cut of this lens
 *  carried one; no control could make it bite, and that is why it is gone. */
function isConstAsserted(decl: Node): boolean {
  if (!Node.isVariableDeclaration(decl)) {
    return false;
  }
  let cur = decl.getInitializer();
  while (cur !== undefined && (Node.isSatisfiesExpression(cur) || Node.isParenthesizedExpression(cur))) {
    cur = cur.getExpression();
  }
  return cur !== undefined && Node.isAsExpression(cur) && cur.getTypeNode()?.getText() === "const";
}

/** How many type-position sites a hit names before it collapses to a count. */
const TYPEONLY_SITES_SHOWN = 2;

function typeOnlyHit(candidate: TypeOnlyCandidate, kind = "typeonly-alive"): Hit {
  const shown = candidate.sites.slice(0, TYPEONLY_SITES_SHOWN).join(", ");
  const more = candidate.sites.length > TYPEONLY_SITES_SHOWN ? ` +${candidate.sites.length - TYPEONLY_SITES_SHOWN} more` : "";
  const h = hitOf(candidate.decl, kind);
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
  const inScope = corpusPredicate(scanCorpus(project, { scope: scope.prefix, label: `path:${scope.prefix}`, skip: [SKIP_TEST_FILES] }));
  const candidates = collectTypeOnlyCandidates(project, inScope);
  printStaleTypeOnlyTags(project, inScope, new Set(candidates.map((c) => declKey(c.decl))));
  const reportable = candidates.filter((c) => !isTypeOnlyExempt(c.decl));
  const hits = reportable.filter((c) => !c.unionSource).map((c) => typeOnlyHit(c));
  const bucketed = reportable.filter((c) => c.unionSource).map((c) => typeOnlyHit(c, "union-source"));
  const exempt = candidates.length - reportable.length;
  printUnionSourceBucket(bucketed, flags);
  console.log(
    `typeonly-alive is a CANDIDATE lens — a hit may be a DELIBERATE conformance seam (a \`satisfies\` anchor, a runtime value whose type IS the contract). It finds value exports whose every reference is a type position; the verdict is a human's. Keep one deliberately with \`// @typeonly-ok: <reason>\` on the declaration.${exempt === 0 ? "" : ` (${exempt} candidate(s) exempted by a reasoned marker.)`}`,
  );
  emit(hits, flags, `typeonly-alive ${scope.label}`);
}

/** Name every UNION-SOURCE row — bucketed rows are NOT counted as hits, so the epilogue's `matches` stays
 *  the number of things the lens is actually claiming. */
function printUnionSourceBucket(bucketed: readonly Hit[], flags: Flags): void {
  printNamedBucket(
    bucketed,
    flags,
    (count) =>
      `typeonly-alive: ${count} candidate(s) BUCKETED as the union-source idiom (\`export const X = […] as const\`, the type derived from it as \`(typeof X)[number]\` — this repo's runtime source of truth for a derived union, §5.5). Named below, NOT counted as hits:`,
  );
}

// ── columns: drizzle columns classified by CONSUMPTION (READ+WRITE / WRITE-only / READ-only / NEITHER) ─
// The owner-named RV-11 class: "the model writes a column nobody renders". Every liveness lens above keys on
// an EXPORT; a column is not an export — it is a property of a table config literal, reached through drizzle's
// generic machinery. So the import graph says a schema file is consumed and stops there, and a column that
// every writer fills and no reader ever selects looks exactly like a column the whole product depends on.
//
// THE IDENTITY IS A PAIR, NOT A `declKey` (the one lens in this file that does not key on a declaration node,
// and why that is correct here). `declKey` exists because an EXPORT NAME is ambiguous across files (three
// `requireParticipant`s). A column name is scoped BY ITS TABLE, so `(table declaration, JS property name)` is
// already unambiguous — and it has to be, because the write side is UNREACHABLE by declaration identity:
// drizzle's `$inferInsert`/`$inferSelect` are HOMOMORPHIC MAPPED TYPES, and a mapped type's synthesized
// property carries `declarations.length === 0` (measured 2026-08-03 on `packages/server/src/domain/rpg/
// game-mint.ts`'s insert literal: every property resolved to `target=<name> decls=0`). There is no node to key
// on. The table half is still resolved STRUCTURALLY — through `getDefinitionNodes()` to the table's own
// VariableDeclaration — so an identifier alias or a `schema.<table>` namespace access cannot fork a table.
//
// THE THREE ARMS, AND WHY THE READ SIDE NEEDS TWO OF THEM (measured, not assumed):
//   • READ arm 1 — QUERY references, via the language service. `findReferencesAsNodes()` on the column's
//     PropertyAssignment name node returns every `<table>.<col>` reference (a `where`/`eq`/`orderBy`/join/
//     select projection/`returning`). Exact, and unreachable any other way.
//   • READ arm 2 — ROW-SHAPE accesses, structural, because arm 1 IS NOT ENOUGH and believing it was would
//     have shipped a lying lens. `typeof <table>.$inferSelect` is a mapped type too, so a `row.<col>` read
//     THROUGH a declared row alias resolves to a synthesized property with zero declarations and comes back
//     from arm 1 as NOTHING. Measured on the real tree: `packages/server/src/domain/plugin/persistence/
//     plugins.ts:23` does `name: row.name` on a `type PluginRow = typeof plugins.$inferSelect` — a plain
//     render read — and arm 1 scored `plugins.name` at `reads:0`. (Arm 1 DOES catch a row access when the row
//     type was inferred INLINE from the select, which is exactly why the hole is easy to miss: the same
//     read shape resolves or vanishes depending on whether an alias was declared.) So arm 2 asks the type,
//     not the language service: a `<x>.<col>` / `<x>["<col>"]` access, or an `{ <col> }` destructure, counts
//     as a read of table T when EVERY property name of `<x>`'s type is a column of T — a row of T, or any
//     projection/view derived from one. Deliberately OVER-inclusive (a `PluginView` whose fields are all
//     column names counts, and it usually IS the render path): over-counting reads under-reports rot, which
//     is the only safe direction for a lens whose job is to nominate columns for deletion.
//   • WRITES are STRUCTURAL, via the drizzle call chain, because the language service CANNOT see them (the
//     mapped-type hole above). Every `<db>.insert(<T>)….values(<arg>)`, `<db>.update(<T>)….set(<arg>)`, and
//     `.onConflictDoUpdate({ set: <arg> })` is walked back down its chain to the `insert`/`update` call that
//     names the table; an object-literal `<arg>`'s property keys ARE the written columns.
//
// THE OPAQUE-WRITER ARM (the honest half). `db.insert(sessions).values(row)` — a whole typed row, no literal —
// names no column, and `.set({ ...patch, … })` names only some. Such a site marks the TABLE `opaque`: every
// column of it becomes write-UNKNOWN, printed as `write?`, never "no write". So the lens never claims a column
// is unwritten when a whole-row writer could be filling it. The READ half is unaffected — which is why
// WRITE-only and NEITHER stay meaningful on an opaque table: their load-bearing half ("nothing reads it") is
// the exact one.
//
// V1 BLIND SPOTS, stated so a reader can price a verdict:
//   1. RAW SQL is NOT table-attributable. `sql\`… m.character_id …\`` names a column through a query ALIAS; no
//      cheap pass maps `m` to `messages`. So the raw-SQL arm is deliberately TABLE-AGNOSTIC and
//      over-inclusive: a column whose SQL name appears as a word inside ANY raw `sql` template / `sql.raw()`
//      text in the workspace is annotated `raw?`. It never changes a class — it tells the reader "go read
//      those templates before calling this rot". A false `raw?` costs a minute; a missed one would let the
//      lens call a live column dead.
//   2. A column reached ONLY through `Pick<NewX, "col">`-style string-literal type members is invisible to
//      both arms (measured: those LiteralType nodes resolve to `symbol=<none> decls=0`). It is a type-level
//      narrowing, never a read or a write on its own, so this is a non-loss — but a reader who sees a column
//      named in a `Pick` and flagged here should check the real call sites, not the `Pick`.
//   3. The schema dir itself is EXCLUDED from consumption: `t.chatId` inside a `uniqueIndex(...).on(t.chatId)`
//      or a CHECK is DDL, not consumption. Counting it would make every indexed column permanently "read".
//
// CANDIDATE lens, never a death sentence — same posture as `swallowed`/`typeonly-alive`, and MANUAL-tier for
// the same reason plus cost (one reference resolution per column). A deliberate keep is
// `// @column-ok: <reason>` on the column property, and that marker is TWO-SIDED: a marker on a column the
// lens no longer flags (it is READ+WRITE now) is reported STALE and exits 1.
//
// CONVENTION TIMESTAMPS ARE A CLASS OF THEIR OWN (lens calibration, owner ruling 2026-08-13). Every one of
// the 16 WRITE-ONLY rows this lens produced on the calibration corpus was a junction table's
// `created_at`/`updated_at` carrying a schema DEFAULT — and the corpus wrote them up as "safe to kill", which
// is DANGEROUS: they are PROVENANCE, stamped by the schema's own `.default(…)`, kept so a row can be dated
// after the fact. "Nothing reads it back" is their normal state, not the RV-11 defect ("the model writes a
// column no surface renders"), so they are their own class — counted, named, and OUT of the actionable hit
// list. Two things this deliberately does NOT do: it does not touch the READ arms (an ORDER BY on the table
// object is ALREADY resolved — `characters.createdAt` is `orderBy(desc(characters.createdAt))` at
// observability/debug/inspect/list.ts:53 and classifies READ+WRITE, which is the positive control that the
// blind spot is not there), and it does not exempt a bare timestamp column with no default (that one really
// is a value some writer chose to store).

const COLUMN_OK_RE = /@column-ok:\s*\S/u;
const SCHEMA_DIR = "/packages/db/src/schema/";
/** The drizzle write METHODS whose first argument names columns. `set` is name-ambiguous on its own
 *  (`Map.set`, `URLSearchParams.set`) — it only counts when the chain walk below lands on an `update(<T>)`
 *  call, which no non-drizzle receiver has. */
const DRIZZLE_WRITE_METHODS = new Set(["values", "set"]);
/** The upsert form: its argument is a CONFIG object whose `set` property holds the written columns. */
const DRIZZLE_UPSERT_METHOD = "onConflictDoUpdate";
/** The chain-terminating calls that NAME the table being written. */
const DRIZZLE_WRITE_ROOTS = new Set(["insert", "update"]);
/** How many consumption sites a hit names before it collapses to a count. */
const COLUMN_SITES_SHOWN = 2;
/** Summary-table column widths: the class name pad, and the right-aligned count field. */
const COLUMN_CLASS_PAD = 11;
const COLUMN_COUNT_PAD = 4;

/** How a column is consumed across the workspace. `read-write` is the healthy state and never a hit; the
 *  next three are the findings — `write-only` is the RV-11 class (the model fills it, nothing renders it),
 *  `read-only` is a column nothing populates (a permanent default/NULL being read), `neither` is pure rot.
 *  `provenance` is the fifth and is NOT a finding: a `created_at`/`updated_at` with a schema DEFAULT that
 *  nothing reads back — an audit stamp doing exactly its job. */
type ColumnClass = "read-write" | "write-only" | "read-only" | "neither" | "provenance";

/** ONE drizzle column: its table (both spellings), its own two spellings, and the declaration node the
 *  `@column-ok` marker hangs on. */
type ColumnDef = {
  readonly tableVar: string;
  readonly sqlTable: string;
  readonly jsProp: string;
  readonly sqlColumn: string;
  readonly decl: Node;
};

/** ONE table's columns plus the identity its writers resolve to (`declKey` of the table's own
 *  VariableDeclaration — an identifier alias or a `schema.<table>` hop cannot fork it). */
type TableDef = {
  readonly varName: string;
  readonly sqlName: string;
  readonly key: string;
  readonly columns: readonly ColumnDef[];
};

/** ONE classified column — the counted sites that produced its verdict, so a reader can go look. `opaque`
 *  means the TABLE has a whole-row writer, so "no attributed write" is UNKNOWN, never "unwritten". */
export type ColumnCandidate = {
  readonly column: ColumnDef;
  readonly klass: ColumnClass;
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  readonly opaque: boolean;
  readonly rawSql: boolean;
};

/** True if the column property carries a leading `// @column-ok: <reason>` — a deliberate keep. The reason is
 *  required (a bare marker does NOT exempt, as with `@swallowed-ok:`/`@typeonly-ok:`/`@server-only:`). A
 *  PropertyAssignment owns its leading comments directly, so no {@link commentHost} hop is needed here. */
export function isColumnExempt(decl: Node): boolean {
  return decl.getLeadingCommentRanges().some((range) => COLUMN_OK_RE.test(range.getText()));
}

/** The SQL name a drizzle column builder was given: the innermost call of the property's initializer chain
 *  (`text("chat_id").$type<ChatId>().notNull().references(…)` → `chat_id`). Falls back to the JS property
 *  name when the chain carries no string literal (a shape this repo does not currently use). */
function sqlColumnName(init: Node | undefined, jsProp: string): string {
  let cur = init;
  while (cur !== undefined && Node.isCallExpression(cur)) {
    const arg = cur.getArguments()[0];
    if (arg !== undefined && Node.isStringLiteral(arg)) {
      return arg.getLiteralText();
    }
    const expr = cur.getExpression();
    cur = Node.isPropertyAccessExpression(expr) ? expr.getExpression() : undefined;
  }
  return jsProp;
}

/** Every `sqliteTable("<sql>", { … })` under `packages/db/src/schema/`, as the lens's TableDef. The
 *  "what does this `sqliteTable(...)` declare" READER is NOT re-spelled here — it is `scripts/check/
 *  schema-read.ts`, the ONE home the db gates (`fk-columns-indexed`, `fk-ondelete-stated`,
 *  `table-explicit-primary-key`) already read through. This function adds only what those gates have no use
 *  for and this lens cannot work without: the SQL column NAME (the migration's spelling, so a reader can
 *  grep the baseline) and the table's declaration KEY (so a writer's identifier resolves to one table
 *  through an alias or a `schema.<table>` hop). A table whose SQL name is not a plain literal is skipped —
 *  there is nothing to report it under. */
export function collectSchemaTables(project: Project): TableDef[] {
  const out: TableDef[] = [];
  for (const sf of project.getSourceFiles()) {
    // Path test by SUBSTRING, not schema-read's `isSchemaFile` — that predicate anchors on a REPO-RELATIVE
    // path, and every lens in this file must stay root-agnostic so the self-test can drive it over an
    // in-memory project rooted anywhere. (The barrel matches too; it declares no table, so it yields none.)
    if (!sf.getFilePath().includes(SCHEMA_DIR)) {
      continue;
    }
    for (const table of schemaTables(sf)) {
      const def = tableDefOf(table);
      if (def !== undefined) {
        out.push(def);
      }
    }
  }
  return out;
}

/** ONE `SchemaTable` as a TableDef, or undefined when it carries no literal SQL name / no binding to key on. */
function tableDefOf(table: SchemaTable): TableDef | undefined {
  const sqlName = table.sqlName;
  const binding = table.call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  if (sqlName === undefined || binding === undefined) {
    return;
  }
  const varName = table.variableName;
  const columns = table.columns.map((column) => ({
    tableVar: varName,
    sqlTable: sqlName,
    jsProp: column.name,
    sqlColumn: sqlColumnName(column.node.getInitializer(), column.name),
    decl: column.node as Node,
  }));
  return { varName, sqlName, key: declKey(binding), columns };
}

/** `<tableVar>\0<jsProp>` — the pair identity the write scan and the read scan agree on. */
function columnKey(tableVar: string, jsProp: string): string {
  return `${tableVar}${KEY_SEP}${jsProp}`;
}

/** A file that CONSUMES columns: anything in the workspace except the schema dir itself (a `t.col` inside an
 *  index/CHECK is DDL, not consumption — counting it would make every indexed column permanently "read"). */
function isColumnConsumer(fp: string): boolean {
  return !fp.includes(SCHEMA_DIR);
}

/** Walk a drizzle method chain down to the `insert(<T>)` / `update(<T>)` call that NAMES the table, and return
 *  that table expression. Undefined for any other receiver — which is what keeps `Map.set` / `Object.values`
 *  out of the write scan (their chains never reach an `insert`/`update` call). */
function drizzleWriteTarget(receiver: Node): Node | undefined {
  // ONE exit point: an early `return` inside the walk plus a trailing one is a shape tsc's noImplicitReturns
  // and biome's noUselessReturn cannot both accept — the accumulator satisfies both.
  let target: Node | undefined;
  let cur: Node | undefined = receiver;
  while (cur !== undefined && target === undefined) {
    const node: Node = cur;
    const inner: Node | undefined = Node.isCallExpression(node) ? node.getExpression() : node;
    if (inner === undefined || !Node.isPropertyAccessExpression(inner)) {
      cur = undefined; // not a member access at all — the chain is not a drizzle write chain; stop.
      continue;
    }
    if (Node.isCallExpression(node) && DRIZZLE_WRITE_ROOTS.has(inner.getName())) {
      target = node.getArguments()[0];
      continue;
    }
    cur = inner.getExpression();
  }
  return target;
}

/** Resolve a table EXPRESSION (`rpgGames`, `schema.rpgGames`) to its TableDef through the definition graph —
 *  never by bare identifier text, so a local alias or a renaming import hop still lands on one table. */
function resolveTableDef(expr: Node, byKey: ReadonlyMap<string, TableDef>): TableDef | undefined {
  const id = Node.isPropertyAccessExpression(expr) ? expr.getNameNode() : expr;
  if (!Node.isIdentifier(id)) {
    return;
  }
  return id
    .getDefinitionNodes()
    .map((d) => byKey.get(declKey(d)))
    .find((hit) => hit !== undefined);
}

/** The columns one write ARGUMENT names, and whether it is (partly) OPAQUE. An object literal names its keys;
 *  a spread inside it hides the rest; an array literal is a multi-row insert (union of its elements); anything
 *  else (a typed variable, a call, a conditional) names nothing at all. */
function writtenKeysOf(arg: Node | undefined): { names: string[]; opaque: boolean } {
  if (arg === undefined) {
    return { names: [], opaque: true };
  }
  if (Node.isArrayLiteralExpression(arg)) {
    const merged = arg.getElements().map((e) => writtenKeysOf(e));
    return { names: merged.flatMap((m) => m.names), opaque: merged.some((m) => m.opaque) };
  }
  if (!Node.isObjectLiteralExpression(arg)) {
    return { names: [], opaque: true };
  }
  const names: string[] = [];
  let opaque = false;
  for (const prop of arg.getProperties()) {
    if (Node.isPropertyAssignment(prop) || Node.isShorthandPropertyAssignment(prop)) {
      names.push(prop.getName());
    } else {
      opaque = true; // a spread (`{ ...patch }`) or a computed key — the rest of the row is unknown.
    }
  }
  return { names, opaque };
}

/** The write ARGUMENT of one drizzle write call: `.values(x)` / `.set(x)` take it directly; the upsert form
 *  `.onConflictDoUpdate({ target, set })` carries it on the config's `set` property. */
function writeArgOf(call: Node, method: string): Node | undefined {
  if (!Node.isCallExpression(call)) {
    return;
  }
  const arg = call.getArguments()[0];
  if (method !== DRIZZLE_UPSERT_METHOD) {
    return arg;
  }
  if (arg === undefined || !Node.isObjectLiteralExpression(arg)) {
    return;
  }
  const setProp = arg.getProperty("set");
  return Node.isPropertyAssignment(setProp) ? setProp.getInitializer() : undefined;
}

/** Where a table's writes land: per-column attributed write sites, plus the OPAQUE whole-row writer sites that
 *  make "no attributed write" mean UNKNOWN rather than "unwritten". */
type WriteScan = { readonly perColumn: Map<string, string[]>; readonly opaqueTables: Map<string, string[]> };

/** ONE structural pass for every drizzle write in the workspace (outside the schema dir). */
export function scanColumnWrites(project: Project, tables: readonly TableDef[]): WriteScan {
  const byKey = new Map(tables.map((t) => [t.key, t]));
  const perColumn = new Map<string, string[]>();
  const opaqueTables = new Map<string, string[]>();
  for (const sf of project.getSourceFiles()) {
    if (!isColumnConsumer(sf.getFilePath())) {
      continue;
    }
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      recordWriteCall(call, byKey, perColumn, opaqueTables);
    }
  }
  return { perColumn, opaqueTables };
}

/** Record ONE call expression's contribution to the write scan (a no-op for the overwhelming majority — any
 *  call whose chain does not reach a drizzle `insert`/`update`). */
function recordWriteCall(call: Node, byKey: ReadonlyMap<string, TableDef>, perColumn: Map<string, string[]>, opaqueTables: Map<string, string[]>): void {
  if (!Node.isCallExpression(call)) {
    return;
  }
  const expr = call.getExpression();
  if (!Node.isPropertyAccessExpression(expr)) {
    return;
  }
  const method = expr.getName();
  if (!(DRIZZLE_WRITE_METHODS.has(method) || method === DRIZZLE_UPSERT_METHOD)) {
    return;
  }
  const target = drizzleWriteTarget(expr.getExpression());
  const table = target === undefined ? undefined : resolveTableDef(target, byKey);
  if (table === undefined) {
    return;
  }
  const site = `${relPath(call.getSourceFile().getFilePath())}:${call.getStartLineNumber()}`;
  const { names, opaque } = writtenKeysOf(writeArgOf(call, method));
  for (const name of names) {
    const key = columnKey(table.varName, name);
    perColumn.set(key, [...(perColumn.get(key) ?? []), site]);
  }
  if (opaque) {
    opaqueTables.set(table.varName, [...(opaqueTables.get(table.varName) ?? []), site]);
  }
}

/** Every raw-SQL text in the workspace, concatenated — a `sql\`…\`` tagged template's full text and a
 *  `sql.raw(<literal>)` argument. TABLE-AGNOSTIC by construction (see the header's blind spot 1): the blob is
 *  searched for a column's SQL NAME only, because an alias-qualified `m.character_id` cannot be mapped back to
 *  its table by any cheap pass. */
export function rawSqlBlob(project: Project): string {
  const parts: string[] = [];
  for (const sf of project.getSourceFiles()) {
    if (!isColumnConsumer(sf.getFilePath())) {
      continue;
    }
    for (const tagged of sf.getDescendantsOfKind(SyntaxKind.TaggedTemplateExpression)) {
      if (tagged.getTag().getText().startsWith("sql")) {
        parts.push(tagged.getTemplate().getText());
      }
    }
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = call.getExpression();
      if (Node.isPropertyAccessExpression(expr) && expr.getName() === "raw" && expr.getExpression().getText() === "sql") {
        parts.push(
          call
            .getArguments()
            .map((a) => a.getText())
            .join(" "),
        );
      }
    }
  }
  return parts.join("\n");
}

/** Word-boundary presence of a SQL column name in the raw-SQL blob. Escaped because a SQL name is
 *  `[a-z0-9_]` by our own db-structure gate, but the regex must not trust that. */
function mentionedInRawSql(blob: string, sqlColumn: string): boolean {
  return new RegExp(`\\b${sqlColumn.replace(GATE_META_RE, "\\$&")}\\b`, "u").test(blob);
}

const GATE_META_RE = /[.*+?^${}()|[\]\\]/gu;

/** The consumption verdict for one column from its counted sites. `opaque` forces the write half to UNKNOWN,
 *  which reads as "has a write" — never as "unwritten" — so the lens cannot call an opaquely-written column
 *  rot. The READ half is exact either way, which is what keeps `write-only`/`neither` meaningful. */
function classifyColumn(reads: number, writes: number, opaque: boolean): ColumnClass {
  const written = writes > 0 || opaque;
  if (reads > 0) {
    return written ? "read-write" : "read-only";
  }
  return written ? "write-only" : "neither";
}

/** The audit-stamp column names this repo writes by convention on nearly every table. */
const PROVENANCE_COLUMNS = new Set(["created_at", "updated_at"]);
/** The drizzle builders that make a column's value the SCHEMA'S, not a writer's decision. */
const COLUMN_DEFAULT_METHODS = new Set(["default", "$defaultFn", "$default", "$onUpdate", "$onUpdateFn"]);

/** A `created_at`/`updated_at` whose builder chain declares a DEFAULT — provenance, stamped by the schema.
 *  Both halves are required: the NAME alone would exempt a hand-written timestamp some writer deliberately
 *  stores (a real value), and a default alone says nothing about what the column means. */
function isConventionTimestamp(column: ColumnDef): boolean {
  if (!PROVENANCE_COLUMNS.has(column.sqlColumn)) {
    return false;
  }
  let cur: Node | undefined = Node.isPropertyAssignment(column.decl) ? column.decl.getInitializer() : undefined;
  while (cur !== undefined && Node.isCallExpression(cur)) {
    const expr = cur.getExpression();
    if (!Node.isPropertyAccessExpression(expr)) {
      return false;
    }
    if (COLUMN_DEFAULT_METHODS.has(expr.getName())) {
      return true;
    }
    cur = expr.getExpression();
  }
  return false;
}

/** The whole audit for one scope: every column classified, plus the opaque-writer map the summary prints
 *  (returned WITH the candidates so the one expensive structural scan runs exactly once per invocation). */
export type ColumnAudit = { readonly candidates: readonly ColumnCandidate[]; readonly opaqueTables: ReadonlyMap<string, readonly string[]> };

/** Every column of `tables`, classified. Pure enumeration — no exemption policy, no printing (the verb owns
 *  both), so the self-test drives the same function the CLI does. */
export function collectColumnCandidates(project: Project, tables: readonly TableDef[]): ColumnAudit {
  const { perColumn, opaqueTables } = scanColumnWrites(project, tables);
  const rowReads = scanRowReads(project, tables);
  const blob = rawSqlBlob(project);
  const candidates: ColumnCandidate[] = [];
  for (const table of tables) {
    const opaque = opaqueTables.has(table.varName);
    for (const column of table.columns) {
      const reads = [...new Set([...columnQueryReadSites(column), ...(rowReads.get(columnKey(column.tableVar, column.jsProp)) ?? [])])].sort(byProdFirst);
      const writes = perColumn.get(columnKey(column.tableVar, column.jsProp)) ?? [];
      const klass = classifyColumn(reads.length, writes.length, opaque);
      candidates.push({
        column,
        // The provenance override applies to the WRITE-ONLY verdict only: a `created_at` nothing writes AND
        // nothing reads (`neither`) is still pure rot, and a read one is healthy — neither is an audit stamp
        // doing its job.
        klass: klass === "write-only" && isConventionTimestamp(column) ? "provenance" : klass,
        reads,
        writes,
        opaque,
        rawSql: mentionedInRawSql(blob, column.sqlColumn),
      });
    }
  }
  return { candidates, opaqueTables };
}

/** READ arm 1 — every language-service reference to the column property outside the schema dir. This is the
 *  `<table>.<col>` QUERY surface (where/eq/orderBy/join/projection/returning). It does NOT see a `row.<col>`
 *  read through a declared `$inferSelect` alias (the mapped-type hole; arm 2 exists for exactly that). */
function columnQueryReadSites(column: ColumnDef): string[] {
  const nameNode = Node.isPropertyAssignment(column.decl) ? column.decl.getNameNode() : undefined;
  if (nameNode === undefined || !Node.isIdentifier(nameNode)) {
    return [];
  }
  const sites = new Set<string>();
  for (const ref of nameNode.findReferencesAsNodes()) {
    const fp = ref.getSourceFile().getFilePath();
    if (isColumnConsumer(fp)) {
      sites.add(`${relPath(fp)}:${ref.getStartLineNumber()}`);
    }
  }
  return [...sites];
}

/** READ arm 2 — the row-shape scan. Keyed `<tableVar>\0<jsProp>` like the write scan, built in ONE pass over
 *  the workspace so the per-column cost stays a map lookup. */
type RowReadScan = ReadonlyMap<string, string[]>;

/** The property NAMES of a type, or undefined when the type carries no usable shape (`any`/`unknown`/a
 *  primitive/an empty object) — those must never match, or every column of every table would read as live. */
function shapePropertyNames(type: Type): readonly string[] | undefined {
  if (type.isAny() || type.isUnknown()) {
    return;
  }
  const names = type.getProperties().map((p) => p.getName());
  return names.length === 0 ? undefined : names;
}

/** The tables `type` could be a ROW (or a projection/view) of: every property it carries is a column of T.
 *  Cached per type object — `.id`/`.name`/`.createdAt` accesses number in the thousands and re-deriving a
 *  property list per site is the difference between a minute and an hour. */
function rowTablesOf(type: Type, tables: readonly TableDef[], cache: Map<unknown, readonly TableDef[]>): readonly TableDef[] {
  const cached = cache.get(type.compilerType);
  if (cached !== undefined) {
    return cached;
  }
  const names = shapePropertyNames(type);
  const matches = names === undefined ? [] : tables.filter((t) => names.every((n) => t.columns.some((c) => c.jsProp === n)));
  cache.set(type.compilerType, matches);
  return matches;
}

/** ONE structural pass for every row-shaped READ in the workspace. The cheap gate runs FIRST — a property name
 *  that is no table's column never costs a type resolution, which is what keeps this arm affordable. */
export function scanRowReads(project: Project, tables: readonly TableDef[]): RowReadScan {
  const out = new Map<string, string[]>();
  const scan: RowReadCtx = {
    tables,
    columnNames: new Set(tables.flatMap((t) => t.columns.map((c) => c.jsProp))),
    cache: new Map<unknown, readonly TableDef[]>(),
    add: (table, name, node) => {
      const key = columnKey(table.varName, name);
      out.set(key, [...(out.get(key) ?? []), `${relPath(node.getSourceFile().getFilePath())}:${node.getStartLineNumber()}`]);
    },
  };
  for (const sf of project.getSourceFiles()) {
    if (isColumnConsumer(sf.getFilePath())) {
      scanFileRowReads(sf, scan);
    }
  }
  return out;
}

/** The row-read scan's shared state: the tables under audit, their column-name gate, the per-type match cache,
 *  and the sink. One object so the recursive helpers stay inside the house parameter budget. */
type RowReadCtx = {
  readonly tables: readonly TableDef[];
  readonly columnNames: ReadonlySet<string>;
  readonly cache: Map<unknown, readonly TableDef[]>;
  readonly add: (table: TableDef, name: string, node: Node) => void;
};

/** ONE file's row-shaped reads: member accesses (`<x>.<col>` / `<x>["<col>"]`) and destructures. */
function scanFileRowReads(sf: SourceFile, scan: RowReadCtx): void {
  for (const kind of [SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression] as const) {
    for (const node of sf.getDescendantsOfKind(kind)) {
      recordAccessRead(node, scan);
    }
  }
  for (const pattern of sf.getDescendantsOfKind(SyntaxKind.ObjectBindingPattern)) {
    recordDestructuredReads(pattern, scan);
  }
}

/** ONE member access as a row read, if its name is a column and its object's shape is a row of some table.
 *  Reads through {@link memberReadOf} — the ONE spelling of "what member does this node read" (`.col`,
 *  `?.col`, `["col"]`); two copies is how one arm learns a shape and the other silently does not. */
function recordAccessRead(node: Node, scan: RowReadCtx): void {
  const access = memberReadOf(node);
  if (access === undefined || !scan.columnNames.has(access.name)) {
    return;
  }
  for (const table of rowTablesOf(access.object.getType(), scan.tables, scan.cache)) {
    scan.add(table, access.name, node);
  }
}

/** `const { <col> } = row` / `({ <col> }: Row) => …` — a destructure is a read of every name it binds. The
 *  pattern's own type IS the row type (ts-morph resolves a binding pattern to its declaration's type). */
function recordDestructuredReads(pattern: Node, scan: RowReadCtx): void {
  if (!Node.isObjectBindingPattern(pattern)) {
    return;
  }
  const bound = pattern.getElements().map((e) => (e.getPropertyNameNode() ?? e.getNameNode()).getText());
  if (!bound.some((n) => scan.columnNames.has(n))) {
    return;
  }
  for (const table of rowTablesOf(pattern.getType(), scan.tables, scan.cache)) {
    for (const name of bound.filter((n) => scan.columnNames.has(n))) {
      scan.add(table, name, pattern);
    }
  }
}

/** The four classes in report order — worst rot first, the healthy state last (and never printed as a hit). */
const COLUMN_CLASS_ORDER: readonly ColumnClass[] = ["neither", "write-only", "read-only", "provenance", "read-write"];

/** The classes that are NOT findings — printed in the summary, never in the actionable hit list. */
const COLUMN_CLASSES_NOT_FLAGGED: ReadonlySet<ColumnClass> = new Set<ColumnClass>(["read-write", "provenance"]);

/** The one-line explanation each class carries in the summary — what a reader should DO about it. */
const COLUMN_CLASS_NOTE: Record<ColumnClass, string> = {
  neither: "pure rot — no reader, no writer, no raw-SQL mention: the column exists and nothing in the workspace touches it",
  "write-only": "the RV-11 class — something FILLS it and nothing ever reads it back (the model writes what no surface renders)",
  "read-only": "read but never written — a permanent DEFAULT/NULL being rendered as if it were data",
  provenance: "a `created_at`/`updated_at` with a schema DEFAULT that nothing reads back — an audit stamp doing its job (NEVER a hit; do not 'reclaim' these)",
  "read-write": "healthy (never a hit)",
};

function columnHit(candidate: ColumnCandidate): Hit {
  const { column, reads, writes, opaque, rawSql } = candidate;
  const shownReads = reads.slice(0, COLUMN_SITES_SHOWN).join(", ");
  const shownWrites = writes.slice(0, COLUMN_SITES_SHOWN).join(", ");
  const readPart = reads.length === 0 ? "reads:0" : `reads:${reads.length} (${shownReads}${reads.length > COLUMN_SITES_SHOWN ? " +more" : ""})`;
  const writeBase = opaque && writes.length === 0 ? "write?:opaque-whole-row-writer" : `writes:${writes.length}`;
  const writePart = writes.length === 0 ? writeBase : `${writeBase} (${shownWrites}${writes.length > COLUMN_SITES_SHOWN ? " +more" : ""})`;
  const h = hitOf(column.decl, `column-${candidate.klass}`);
  h.text = `${column.sqlTable}.${column.sqlColumn}  (${column.tableVar}.${column.jsProp})  —  ${readPart}  ${writePart}${rawSql ? "  raw?" : ""}`;
  return h;
}

/** The AUDIT TABLE — the deliverable a reader actually wants above the hit list: how many columns each class
 *  holds, and which tables carry an opaque whole-row writer (the rows whose write half is UNKNOWN). */
function printColumnSummary(audit: ColumnAudit, tables: readonly TableDef[]): void {
  console.log(`columns: ${audit.candidates.length} column(s) across ${tables.length} table(s)`);
  for (const klass of COLUMN_CLASS_ORDER) {
    const inClass = audit.candidates.filter((c) => c.klass === klass);
    const raw = inClass.filter((c) => c.rawSql).length;
    console.log(
      `  ${klass.padEnd(COLUMN_CLASS_PAD)} ${String(inClass.length).padStart(COLUMN_COUNT_PAD)}   ${COLUMN_CLASS_NOTE[klass]}${raw === 0 ? "" : ` — ${raw} annotated raw?`}`,
    );
  }
  const scopedOpaque = [...audit.opaqueTables.keys()].filter((v) => tables.some((t) => t.varName === v)).sort();
  if (scopedOpaque.length > 0) {
    console.log(
      `  opaque-write tables (${scopedOpaque.length}): ${scopedOpaque.join(", ")} — a whole-row/spread writer names no column, so every column of these tables reads as \`write?\`, never "unwritten".`,
    );
  }
}

/** The STALE side of the `@column-ok` marker: a tag on a column the lens no longer flags (it is READ+WRITE
 *  now). Printed and exit-1 so the marker cannot rot into a permanent lie (the two-sided-gate law). */
function printStaleColumnTags(candidates: readonly ColumnCandidate[]): void {
  const stale = candidates.filter((c) => isColumnExempt(c.column.decl) && c.klass === "read-write").map((c) => columnHit(c));
  if (stale.length === 0) {
    return;
  }
  console.log(
    `columns: ${stale.length} STALE \`@column-ok:\` marker(s) — the column is READ+WRITE now (a reader and a writer both reach it), so the exemption states nothing. Delete the marker or re-state the reason:`,
  );
  for (const h of stale) {
    console.log(`  ! ${h.file}:${h.line}  [stale-column-ok]  ${h.text}`);
  }
  process.exitCode = 1;
}

/** Every drizzle column classified by CONSUMPTION across the workspace. Optional scope = a SQL-table-name /
 *  table-variable / schema-file substring; bare = every table. A deliberate keep carries
 *  `// @column-ok: <reason>` on the column property; a stale marker exits 1. */
function cmdColumns(project: Project, arg: string, flags: Flags): void {
  const all = collectSchemaTables(project);
  const tables =
    arg === "" ? all : all.filter((t) => t.sqlName.includes(arg) || t.varName.includes(arg) || t.columns[0]?.decl.getSourceFile().getFilePath().includes(arg));
  noteUnits("tables", tables.length);
  if (tables.length === 0) {
    exitToolError(
      `ast columns: scope "${arg}" matched no table — pass a SQL table name (rpg_games), a table variable (rpgGames), a schema-file substring (schema/rpg), or run bare for all ${all.length} tables.`,
    );
  }
  // The scope resolves to TABLES; the files it admits are the schema files those tables are declared in
  // (the read/write arms then walk the workspace to decide each column — substrate, not candidate corpus).
  scanCorpus(project, { scope: tables.flatMap((t) => t.columns.map((c) => c.decl.getSourceFile().getFilePath())), label: "path:schema-files" });
  const audit = collectColumnCandidates(project, tables);
  printColumnSummary(audit, tables);
  printStaleColumnTags(audit.candidates);
  const flaggable = audit.candidates.filter((c) => !COLUMN_CLASSES_NOT_FLAGGED.has(c.klass));
  const flagged = flaggable.filter((c) => !isColumnExempt(c.column.decl));
  const exempt = flaggable.length - flagged.length;
  const ordered = COLUMN_CLASS_ORDER.flatMap((klass) => flagged.filter((c) => c.klass === klass)).map(columnHit);
  if (flags.all) {
    printColumnsPerTable(tables, flagged);
  }
  console.log(
    `columns is a CANDIDATE lens. READS are the union of two arms — language-service \`<table>.<col>\` query references PLUS a row-shape scan for \`<row>.<col>\` reads (needed because \`$inferSelect\` is a mapped type: a read through a declared row alias is INVISIBLE to reference resolution). The row-shape arm is deliberately OVER-inclusive, so a read count can be generous — which is the safe direction. WRITES are STRUCTURAL for the same mapped-type reason, so a table with a whole-row/spread writer marks every column \`write?\`, never "unwritten". A \`raw?\` annotation means the column's SQL name appears in some raw \`sql\` template — NOT attributable to a table in v1, so read those before calling it rot. A \`created_at\`/\`updated_at\` with a schema DEFAULT that nothing reads back is classed \`provenance\`, counted in the table above and NEVER listed as a hit — an audit stamp is not the RV-11 class. Keep one deliberately with \`// @column-ok: <reason>\` on the column property.${exempt === 0 ? "" : ` (${exempt} candidate(s) exempted by a reasoned marker.)`}`,
  );
  emit(ordered, flags, `columns ${arg === "" ? "(all tables)" : arg}`);
}

/** `columns --all`: per-table sectioning — every table's flagged columns listed, or a one-line "healthy"
 *  collapse for a table with none. `columns` bare already audits every table but flattens the result into
 *  one class-ordered list; this answers "which TABLES need a look" instead of forty manual per-table runs. */
function printColumnsPerTable(tables: readonly TableDef[], flagged: readonly ColumnCandidate[]): void {
  const byTable = new Map<string, ColumnCandidate[]>();
  for (const c of flagged) {
    byTable.set(c.column.tableVar, [...(byTable.get(c.column.tableVar) ?? []), c]);
  }
  let withFindings = 0;
  for (const table of tables) {
    const rows = byTable.get(table.varName) ?? [];
    if (rows.length === 0) {
      console.log(`  ${table.sqlName} (${table.varName}): healthy — 0 of ${table.columns.length} column(s) flagged`);
      continue;
    }
    withFindings += 1;
    console.log(`  ${table.sqlName} (${table.varName}): ${rows.length} of ${table.columns.length} column(s) flagged`);
    for (const c of rows) {
      const h = columnHit(c);
      console.log(`    ${h.file}:${h.line}  [${h.kind}]  ${h.text}`);
    }
  }
  console.log(`columns --all: swept ${tables.length} table(s), ${withFindings} carrying a finding.`);
}

// ── regkeys: registry rows whose KEY LITERAL is dispatched nowhere (INFORMATIONAL — owner-ruled) ───────
// The blind spot every other lens in this file shares: a string-keyed dispatch table is ONE import edge and
// ONE symbol, so `orphans`/`prodonly`/knip all see it as fully alive no matter how many of its ROWS are dead.
// A retired chrome zone, a template id nothing renders, a settings pane no route reaches — each is a live-
// looking row in a live table. This verb asks the only question the symbol layer cannot: does this ROW'S KEY
// get spelled anywhere outside its own table?
//
// IT IS INFORMATIONAL AND NEVER GATES (owner ruling, 2026-08-03). Registry dispatch is legitimately dynamic:
// a key can arrive from the DB, from a URL segment, from a `Object.keys(REGISTRY).map(…)` iteration that
// never names one member, or from a template literal. Every one of those makes a LIVE row look dead here.
// So this is the one lens in the file with NO marker, NO exemption grammar, and NO exit-1 arm — reading it
// costs a minute and acting on it requires reading the call sites. Gating on it would train agents to delete
// live rows; that is why it is `manual`-tier with a HEURISTIC banner and why it never joins `pnpm check`.
//
// WHAT COUNTS AS A REGISTRY (structural, never a hardcoded census — a doc list rots the day a table moves).
// An exported const with at least {@link REGISTRY_ROW_FLOOR} rows AND either a `satisfies`/annotation naming
// `Record<` (the house Record-not-switch dispatch shape) or a SCREAMING_SNAKE name (the repo's table-constant
// convention), in EITHER of the two shapes this repo writes a table in:
//   • KEYED — an object literal; the row key is the property name.
//   • ROW-ARRAY — an array literal of object rows, each carrying a string-literal identity property
//     ({@link REGISTRY_ROW_ID_KEYS}); the row key is that property's value.
// The row-array arm is the DERIVATION-DRIFT fix (lens calibration, owner ruling 2026-08-13): this verb's own
// USAGE example is `pnpm ast regkeys TEMPLATE_DEFS`, and `TEMPLATE_DEFS` — the preset template catalogue,
// `packages/contracts/src/preset/index.ts`, class (a) in the registry census — is an array of `{ id, … }`
// rows, so the example derived ZERO registries and exited 2 while 172 others matched. A lens whose own
// documented example cannot run is a lens nobody trusts.
//
// KEY EXTRACTION READS THROUGH A COMPUTED NAME. `{ ["main_prompt"]: … }` is a legal (and used —
// `MARKER_COPY`, client preset prompt-assembly) spelling of a string key, and taking the name node's TEXT
// yielded the key `["main_prompt"]`, which nothing on earth spells: 100% of that table's rows reported
// undispatched. A computed name wrapping a STRING LITERAL is unwrapped; a computed name wrapping anything
// else (an identifier constant) is NOT a literal key and the row is skipped rather than guessed at.
//
// WHAT COUNTS AS A DISPATCH SITE. Any spelling of the key ANYWHERE else in the workspace: a string literal, a
// property-access name (`x.<key>`), a bare identifier, or a JSX attribute name — collected in ONE syntactic
// pass (no type resolution, which is why this verb is fast). The registry's OWN file is excluded (a table
// naming its own rows proves nothing), and so are test paths (a test enumerating a table is not a product
// consumer — the same rule `testonly` applies to exports).

const REGISTRY_ROW_FLOOR = 3;
const SCREAMING_SNAKE_RE = /^[A-Z][A-Z0-9_]*$/u;
const RECORD_ANNOTATION_RE = /\bRecord\s*</u;
/** How many registries a key's report line names before collapsing (a key can live in several tables). */
const REGKEY_SITES_SHOWN = 3;

/** ONE registry: the const's name, the file it lives in, and its row keys paired with the property nodes. */
type RegistryDef = {
  readonly name: string;
  readonly filePath: string;
  readonly rows: readonly { readonly key: string; readonly node: Node }[];
};

/** The `satisfies`/`as`/annotation text attached to a variable declaration — where a `Record<…>` dispatch
 *  shape declares itself. Empty when the const carries no type at all. */
function declaredTypeText(v: Node): string {
  if (!Node.isVariableDeclaration(v)) {
    return "";
  }
  const init = v.getInitializer();
  const satisfiesText = init !== undefined && Node.isSatisfiesExpression(init) ? (init.getTypeNode()?.getText() ?? "") : "";
  return `${v.getTypeNode()?.getText() ?? ""} ${satisfiesText}`;
}

/** Unwrap the `satisfies`/`as const` wrappers a house registry is written with, down to the literal — an
 *  object literal (the KEYED shape) or an array literal (the ROW-ARRAY shape). */
function registryLiteralOf(node: Node | undefined): Node | undefined {
  let cur = node;
  while (cur !== undefined && (Node.isSatisfiesExpression(cur) || Node.isAsExpression(cur) || Node.isParenthesizedExpression(cur))) {
    cur = cur.getExpression();
  }
  return cur !== undefined && (Node.isObjectLiteralExpression(cur) || Node.isArrayLiteralExpression(cur)) ? cur : undefined;
}

/** The property names a ROW-ARRAY registry's row identity can live under, in precedence order. `id` is the
 *  house spelling (`TEMPLATE_DEFS`); a row carrying none of these has no literal key and is skipped. */
const REGISTRY_ROW_ID_KEYS = ["id", "key"] as const;

/** The literal KEY of one row of a KEYED registry — the property name, read through a computed
 *  `["literal"]` wrapper. Undefined when the name is computed from a non-literal (an identifier constant):
 *  there is no key to check, and inventing one from the expression's text is how `["main_prompt"]` happened. */
function keyedRowKey(prop: Node): string | undefined {
  if (!(Node.isPropertyAssignment(prop) || Node.isShorthandPropertyAssignment(prop))) {
    return;
  }
  const nameNode = prop.getNameNode();
  if (Node.isStringLiteral(nameNode)) {
    return nameNode.getLiteralText();
  }
  if (Node.isComputedPropertyName(nameNode)) {
    const inner = nameNode.getExpression();
    return Node.isStringLiteral(inner) ? inner.getLiteralText() : undefined;
  }
  return nameNode.getText();
}

/** The literal KEY of one row of a ROW-ARRAY registry: the row object's `id`/`key` string-literal property. */
function rowArrayRowKey(element: Node): string | undefined {
  if (!Node.isObjectLiteralExpression(element)) {
    return;
  }
  let key: string | undefined;
  for (const idKey of REGISTRY_ROW_ID_KEYS) {
    const prop = element.getProperty(idKey);
    const value = prop !== undefined && Node.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
    if (key === undefined && value !== undefined && Node.isStringLiteral(value)) {
      key = value.getLiteralText();
    }
  }
  return key;
}

/** Every registry-shaped exported const in the workspace (excluding test paths — a table declared in a test
 *  is a fixture, not a dispatch surface). */
export function collectRegistries(project: Project): RegistryDef[] {
  const out: RegistryDef[] = [];
  for (const sf of project.getSourceFiles()) {
    const filePath = sf.getFilePath();
    if (isTestPath(filePath)) {
      continue;
    }
    for (const v of sf.getVariableDeclarations()) {
      const def = registryDefOf(v, filePath);
      if (def !== undefined) {
        out.push(def);
      }
    }
  }
  return out;
}

/** ONE variable declaration as a RegistryDef, or undefined when it is not registry-shaped. */
function registryDefOf(v: Node, filePath: string): RegistryDef | undefined {
  if (!Node.isVariableDeclaration(v)) {
    return;
  }
  if (!v.isExported()) {
    return;
  }
  const literal = registryLiteralOf(v.getInitializer());
  if (literal === undefined) {
    return;
  }
  const name = v.getName();
  if (!(SCREAMING_SNAKE_RE.test(name) || RECORD_ANNOTATION_RE.test(declaredTypeText(v)))) {
    return;
  }
  const rows = registryRowsOf(literal);
  return rows.length < REGISTRY_ROW_FLOOR ? undefined : { name, filePath, rows };
}

/** The `(key, node)` rows of a registry literal, in whichever of the two shapes it is written. A member with
 *  no LITERAL key (a spread, a computed non-literal name, a row object with no `id`/`key` string) yields no
 *  row — it is a key this lens cannot check, never a key it invents. */
function registryRowsOf(literal: Node): { key: string; node: Node }[] {
  const rows: { key: string; node: Node }[] = [];
  const members: readonly Node[] = Node.isArrayLiteralExpression(literal)
    ? literal.getElements()
    : (literal.asKindOrThrow(SyntaxKind.ObjectLiteralExpression).getProperties() as readonly Node[]);
  const keyOf = Node.isArrayLiteralExpression(literal) ? rowArrayRowKey : keyedRowKey;
  for (const node of members) {
    const key = keyOf(node);
    if (key !== undefined) {
      rows.push({ key, node });
    }
  }
  return rows;
}

/** Every SPELLING a file uses — string-literal texts, property-access names, bare identifiers, and JSX
 *  attribute names. One syntactic pass per file; the union over all OTHER files is what a registry key is
 *  checked against. */
function spellingsOf(sf: SourceFile): Set<string> {
  const out = new Set<string>();
  for (const node of sf.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
    out.add(node.getLiteralText());
  }
  for (const node of sf.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
    out.add(node.getLiteralText());
  }
  for (const node of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    out.add(node.getText());
  }
  for (const node of sf.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
    out.add(node.getNameNode().getText());
  }
  return out;
}

/** filePath → the spellings that file uses. Built once; a key's dispatch question is then a scan of this map
 *  skipping the registry's own file and every test path. */
function spellingIndex(project: Project): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const sf of project.getSourceFiles()) {
    index.set(sf.getFilePath(), spellingsOf(sf));
  }
  return index;
}

/** The non-test, non-owning files that spell `key` — the dispatch sites. Capped at
 *  {@link REGKEY_SITES_SHOWN} + 1 so a common word short-circuits instead of scanning the whole index. */
function dispatchSitesOf(key: string, ownerFile: string, index: ReadonlyMap<string, Set<string>>): string[] {
  const sites: string[] = [];
  for (const [fp, spellings] of index) {
    if (fp === ownerFile || isTestPath(fp) || !spellings.has(key)) {
      continue;
    }
    sites.push(relPath(fp));
    if (sites.length > REGKEY_SITES_SHOWN) {
      return sites;
    }
  }
  return sites;
}

/** Registry rows whose key literal is spelled at ZERO dispatch sites outside their own table (and outside
 *  tests). INFORMATIONAL — a computed/DB-sourced/iterated key is a live row that looks dead here. Optional
 *  scope = a registry NAME or file substring; bare = every registry. Never exits non-zero on findings. */
function cmdRegKeys(project: Project, arg: string, flags: Flags): void {
  const all = collectRegistries(project);
  const registries = arg === "" ? all : all.filter((r) => r.name.includes(arg) || r.filePath.includes(arg));
  noteUnits("registries", registries.length);
  if (registries.length === 0) {
    exitToolError(
      `ast regkeys: scope "${arg}" matched no registry — pass a registry const name (TEMPLATE_DEFS), a file substring, or run bare for all ${all.length}.`,
    );
  }
  // The scope resolves to REGISTRIES; the files it admits are the ones declaring them (the dispatch-site
  // index is a workspace-wide substrate pass, deliberately not counted as the candidate corpus).
  scanCorpus(project, { scope: registries.map((r) => r.filePath), label: "path:registry-files" });
  const index = spellingIndex(project);
  const byRegistry = new Map(registries.map((r) => [r, regKeyHitsFor(r, index)] as const));
  if (flags.all) {
    printRegistriesPerTable(registries, byRegistry);
  }
  console.log(
    `regkeys is a HEURISTIC, INFORMATIONAL lens — it NEVER gates and has no exemption marker (owner ruling). Registry dispatch is legitimately dynamic: a key that arrives from the DB, a URL segment, a template literal, or an \`Object.keys(REGISTRY)\` iteration is a LIVE row that looks dead here. Read the call sites before acting on any line below. (${registries.length} registry/registries, ${registries.reduce((n, r) => n + r.rows.length, 0)} row(s) examined; a registry = an exported const with ${REGISTRY_ROW_FLOOR}+ rows carrying a \`Record<…>\` annotation or a SCREAMING_SNAKE name, in either shape: an OBJECT literal keyed by property name, or an ARRAY literal of \`{ ${REGISTRY_ROW_ID_KEYS.join("|")}: "<key>" }\` rows.)`,
  );
  const hits = registries.flatMap((r) => byRegistry.get(r) ?? []);
  emit(hits, flags, `regkeys ${arg === "" ? "(all registries)" : arg}`);
}

/** ONE registry's undispatched rows — split off the main loop so `--all`'s per-registry breakdown and the
 *  default flat hit list are computed from the SAME per-registry call, never two independent walks. */
function regKeyHitsFor(registry: RegistryDef, index: ReadonlyMap<string, Set<string>>): Hit[] {
  const hits: Hit[] = [];
  for (const row of registry.rows) {
    if (dispatchSitesOf(row.key, registry.filePath, index).length > 0) {
      continue;
    }
    const h = hitOf(row.node, "regkey-undispatched");
    h.text = `${registry.name}["${row.key}"]  —  the key is spelled in NO non-test file outside this table`;
    hits.push(h);
  }
  return hits;
}

/** `regkeys --all`: per-registry sectioning, the same shape as `columns --all` — a registry with
 *  undispatched rows gets its full list, a clean one collapses to one line, so a sweep names which
 *  TABLES need a look instead of forty manual per-registry runs. */
function printRegistriesPerTable(registries: readonly RegistryDef[], byRegistry: ReadonlyMap<RegistryDef, Hit[]>): void {
  let withFindings = 0;
  for (const registry of registries) {
    const hits = byRegistry.get(registry) ?? [];
    if (hits.length === 0) {
      console.log(`  ${registry.name} (${relPath(registry.filePath)}): healthy — 0 of ${registry.rows.length} row(s) undispatched`);
      continue;
    }
    withFindings += 1;
    console.log(`  ${registry.name} (${relPath(registry.filePath)}): ${hits.length} of ${registry.rows.length} row(s) undispatched`);
    for (const h of hits) {
      console.log(`    ${h.file}:${h.line}  [${h.kind}]  ${h.text}`);
    }
  }
  console.log(`regkeys --all: swept ${registries.length} registry/registries, ${withFindings} carrying a finding.`);
}

// ── chains: declarations whose ONLY life originates inside OTHER DEAD declarations ─────────────────────
// The owner-named ALIAS-RABBIT-HOLE class, and the one rot shape every lens above is structurally blind to.
// `orphans` asks "does ANYTHING reach this export?" and stops. So a chain — `export const Head = Mid` that
// nobody consumes, `export const Mid = Deep`, `export function Deep()` — reports as exactly ONE hit: the
// head. Delete the head, re-run, get one more hit; delete that, re-run, get one more. Three passes of a
// human's attention for one dead subtree, and only if they think to re-run at all. Worse, the shape hides in
// LIVE files: `Mid`'s file can be full of load-bearing code, so no FILE lens (`prodonly`, knip's unused-files,
// an iterated version of either) can see the dead declaration inside it. Measured on the planted 3-link probe
// before this verb existed: `orphans server` named `chainProbeHead` and neither of the two links below it.
//
// THE FIXPOINT. A declaration is ALIVE iff some ALIVE thing consumes it — which is circular on purpose and
// resolved by iterating from the roots outward until nothing new is marked:
//   ROOT 1 — a MODULE-SCOPE consumer. A side-effect position (`createRoot(el).render(<App/>)`, a top-level
//     registration call) belongs to no declaration and nothing can make it dead.
//   ROOT 2 — a consumer OUTSIDE the audited surface: a test path, or any file not under `packages/`
//     (scripts, tooling, config). `orphans` already counts test consumption as life; this lens must agree
//     with it or the two would nominate different code for deletion.
//   ROOT 3 — a `/** @public <reason> */` declaration. That marker is the repo's ratified statement of
//     "deliberately unconsumed API surface", it is judged two-sided by the push-tier orphan ratchet, and it
//     is read HERE through the ratchet's own predicate ({@link isPublicTagged}) so the two cannot drift.
//   ROOT 4 — every export of `packages/ui/src`. R2 of docs/architecture/core/ui-package-design.md: a sealed
//     surface exists to be available, so "no consumer yet" is its designed state. The orphan ratchet exempts
//     the whole package for exactly this reason; a chain lens that did not would report the entire UI tree.
// Everything the roots transitively consume is alive. What is left is DEAD, in two shapes:
//   • NO consumer edge at all — an `orphans` hit (or an unused file-local). NOT this lens's business, and
//     deliberately not reported: two lenses reporting the same row is how a reader learns to skim both.
//   • ≥1 consumer edge, EVERY one of them dead — the finding. `X ← only via Y (dead) ← only via Z
//     (unconsumed)`, whole chain in one line, one run.
//
// THE FIX IS AT THE HEAD, and that is why this lens has NO marker of its own (owner-ratified 2026-08-03).
// Every chain terminates at an unconsumed head that `orphans` already reports and the ratchet already
// governs. Wire the head, or delete the head and the chain with it, or tag the head `@public <reason>` — any
// of the three makes every link below it read alive here, by construction. A per-link `@chain-ok:` would let
// somebody exempt a middle link while its head stays dead, which states nothing true.
//
// CANDIDATE lens, MANUAL tier — never a gate, for the same reason `swallowed`/`typeonly-alive`/`columns`
// aren't, plus one specific to the fixpoint: a consumer this substrate cannot SEE (a registry dispatched by a
// DB-sourced key, a `Trpc[…]` proxy consumption, a template-literal module id) makes a live declaration look
// chain-dead, and a fixpoint AMPLIFIES that — one missed edge can kill a whole subtree in the report. Read the
// call sites. The attribution errs alive wherever it can (see the substrate section's over-attribution note),
// which is the only safe direction for a lens that nominates code for deletion.

/** ONE declaration in the chain graph. `exported` separates the two remedies a reader has: an exported
 *  chain-dead symbol may have an unseen dynamic consumer, a file-local one essentially cannot. */
type ChainNode = { readonly name: string; readonly decl: Node; readonly exported: boolean };

/** The graph the fixpoint walks: every audited declaration, plus the edge map in BOTH directions (the
 *  forward index answers "who consumes me", the reverse one "what do I consume" — the fixpoint needs both). */
type ChainGraph = {
  readonly nodes: ReadonlyMap<string, ChainNode>;
  readonly consumers: ReadonlyMap<string, ReadonlySet<string>>;
  readonly consumes: ReadonlyMap<string, ReadonlySet<string>>;
};

/** ONE link in a rendered chain: the dead consumer's name and site, whether it is the TERMINAL (unconsumed)
 *  head, and how many other dead consumers were elided at that step. */
export type ChainLink = { readonly name: string; readonly site: string; readonly terminal: boolean; readonly alternates: number };

/** ONE chain-dead declaration and the chain of dead consumers that is its entire liveness. */
export type ChainCandidate = {
  readonly name: string;
  readonly decl: Node;
  readonly exported: boolean;
  readonly chain: readonly ChainLink[];
};

/** The workspace surface this lens audits: `packages/<pkg>/src/`. A file OUTSIDE it — a package's own
 *  `vite.config.ts`, a build script — is loaded BY TOOLING, never through an import edge any lens can see,
 *  so it is an unconditional alive root (same class as ROOT 2). Measured on the first audit: without this,
 *  `devCspMirror` and six siblings inside `packages/client/vite.config.ts` read as a dead chain hanging off
 *  the config's own (tooling-consumed, therefore "unconsumed") default export. */
const PACKAGE_SRC_RE = /\/packages\/[^/]+\/src\//u;
/** The bare-scope prefix (every package) — the nodes are already `src`-only by {@link PACKAGE_SRC_RE}. */
const PACKAGES_PREFIX = "/packages/";
/** The R2 sealed package: every export is an alive root (ROOT 4). */
const UI_SRC_PREFIX = "/packages/ui/src/";
/** How many links a rendered chain names before it stops — past this the reader has the shape already. */
const CHAIN_MAX_LINKS = 8;
/** How many chain-dead declarations the summary names per terminal head before collapsing to a count. */
const CHAIN_HEADS_SHOWN = 12;
/** Right-aligned width of the summary's per-head link count (the `columns` summary's COLUMN_COUNT_PAD). */
const CHAIN_COUNT_PAD = 4;

/** Is this consumer key outside the audited surface (a test, a script, a package's own build config)? ROOT 2. */
function isChainRootFile(filePath: string): boolean {
  return isTestPath(filePath) || !PACKAGE_SRC_RE.test(filePath);
}

/** Every audited declaration, keyed — plus the reverse edge index. Test files are not nodes (their
 *  declarations are roots, per ROOT 2), matching `orphans`' own rule. */
function buildChainGraph(project: Project, live: Liveness): ChainGraph {
  const nodes = new Map<string, ChainNode>();
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (!PACKAGE_SRC_RE.test(fp) || TEST_FILE_RE.test(fp)) {
      continue;
    }
    const exportedKeys = new Set<string>();
    for (const { decl } of ownExports(sf)) {
      exportedKeys.add(declKey(decl));
    }
    for (const { name, decl } of topLevelDeclarations(sf)) {
      const key = declKey(decl);
      nodes.set(key, { name, decl, exported: exportedKeys.has(key) });
    }
  }
  const consumes = new Map<string, Set<string>>();
  for (const [originKey, consumerKeys] of live.consumers) {
    for (const consumerKey of consumerKeys) {
      const set = consumes.get(consumerKey) ?? new Set<string>();
      set.add(originKey);
      consumes.set(consumerKey, set);
    }
  }
  return { nodes, consumers: live.consumers, consumes };
}

/** ROOT 1 + ROOT 2 — a consumer that is a module-scope side effect, or lives outside the audited surface
 *  (a test, a script, a package's own build config). Nothing the fixpoint does can make either dead. */
function isRootConsumerKey(consumerKey: string): boolean {
  return isModuleScopeKey(consumerKey) || isChainRootFile(fileOfKey(consumerKey));
}

/** ROOT 3 + ROOT 4 — a declaration ratified as deliberately unconsumed (`@public <reason>`, the orphan
 *  ratchet's own marker, read through its own predicate) or an export of the R2-sealed `ui` package. */
function isRootDeclaration(node: ChainNode): boolean {
  return (node.exported && node.decl.getSourceFile().getFilePath().includes(UI_SRC_PREFIX)) || isPublicTagged(node.decl);
}

/** The seed set: every ROOT, before any propagation. */
function chainRootKeys(graph: ChainGraph): string[] {
  const roots: string[] = [];
  for (const consumerKeys of graph.consumers.values()) {
    roots.push(...[...consumerKeys].filter(isRootConsumerKey));
  }
  for (const [key, node] of graph.nodes) {
    if (isRootDeclaration(node)) {
      roots.push(key);
    }
  }
  return roots;
}

/** The fixpoint: seed the four roots, then mark everything an alive key consumes, until nothing new. */
function chainAliveKeys(graph: ChainGraph): Set<string> {
  const alive = new Set<string>();
  const stack: string[] = [];
  const seed = (key: string): void => {
    if (!alive.has(key)) {
      alive.add(key);
      stack.push(key);
    }
  };
  for (const root of chainRootKeys(graph)) {
    seed(root);
  }
  while (stack.length > 0) {
    const cur = stack.pop();
    for (const originKey of (cur === undefined ? undefined : graph.consumes.get(cur)) ?? []) {
      seed(originKey);
    }
  }
  return alive;
}

/** `<repo-rel file>:<line>` for a graph key (the declaration's own position, or the file for a sentinel). */
function chainSiteOf(key: string, graph: ChainGraph): string {
  const node = graph.nodes.get(key);
  if (node === undefined) {
    return relPath(fileOfKey(key));
  }
  return `${relPath(node.decl.getSourceFile().getFilePath())}:${node.decl.getSourceFile().getLineAndColumnAtPos(node.decl.getStart()).line}`;
}

/** Walk UP from a chain-dead declaration through its dead consumers to the unconsumed head. At each step the
 *  dead consumers are sorted and the first UNSEEN one is followed — the `seen` guard is what makes a dead
 *  CYCLE (a mutually-referencing pair nothing else reaches) terminate instead of looping forever. */
function chainOf(startKey: string, graph: ChainGraph, alive: ReadonlySet<string>): ChainLink[] {
  const links: ChainLink[] = [];
  const seen = new Set<string>([startKey]);
  let cur = startKey;
  while (links.length < CHAIN_MAX_LINKS) {
    const dead = [...(graph.consumers.get(cur) ?? [])].filter((k) => !alive.has(k)).sort();
    const next = dead.find((k) => !seen.has(k));
    if (next === undefined) {
      break;
    }
    seen.add(next);
    links.push({
      name: graph.nodes.get(next)?.name ?? relPath(fileOfKey(next)),
      site: chainSiteOf(next, graph),
      terminal: (graph.consumers.get(next)?.size ?? 0) === 0,
      alternates: dead.length - 1,
    });
    cur = next;
  }
  return links;
}

/** The whole audit for one scope: the findings PLUS the graph's own size. The stats exist so a ZERO is
 *  legible as CLEAN rather than as blindness — the permanent-zero footgun this file already ate once (the
 *  `orphans contracts` bug: a 100%-barrel package reported clean while the lens could not see into it).
 *  "0 findings over 4 declarations" and "0 findings over 9 000 declarations and 40 000 edges" are different
 *  claims and a reader must be able to tell them apart. */
export type ChainAudit = {
  readonly candidates: readonly ChainCandidate[];
  readonly declarations: number;
  readonly edges: number;
  readonly unconsumedHeads: number;
};

/** Declarations of `inScope` that are DEAD but DO have consumer edges — every one of them dead too. Pure
 *  enumeration: no printing, no scope policy (the verb owns both), so the self-test drives the same function
 *  the CLI does. A dead declaration with NO consumer at all is an `orphans` hit and is deliberately absent
 *  from `candidates` — it is counted in `unconsumedHeads` instead, because it is where a reader FIXES. */
export function collectChainAudit(project: Project, live: Liveness, inScope: (filePath: string) => boolean): ChainAudit {
  const graph = buildChainGraph(project, live);
  const alive = chainAliveKeys(graph);
  const candidates: ChainCandidate[] = [];
  let edges = 0;
  let unconsumedHeads = 0;
  for (const [key, node] of graph.nodes) {
    const consumers = graph.consumers.get(key);
    edges += consumers?.size ?? 0;
    const dead = !alive.has(key);
    if (dead && (consumers === undefined || consumers.size === 0)) {
      unconsumedHeads += 1;
      continue;
    }
    if (dead && inScope(node.decl.getSourceFile().getFilePath())) {
      candidates.push({ name: node.name, decl: node.decl, exported: node.exported, chain: chainOf(key, graph, alive) });
    }
  }
  return { candidates, declarations: graph.nodes.size, edges, unconsumedHeads };
}

/** The findings alone — the shape every caller but the CLI summary wants. */
export function collectChainCandidates(project: Project, live: Liveness, inScope: (filePath: string) => boolean): readonly ChainCandidate[] {
  return collectChainAudit(project, live, inScope).candidates;
}

/** One rendered link: `only via <name> (dead|unconsumed[, +N more dead consumer(s)]) @ file:line`. */
function chainLinkText(link: ChainLink): string {
  const more = link.alternates > 0 ? `, +${link.alternates} more dead consumer(s)` : "";
  return `only via ${link.name} (${link.terminal ? "unconsumed" : "dead"}${more}) @ ${link.site}`;
}

function chainHit(candidate: ChainCandidate): Hit {
  const rendered = candidate.chain.map(chainLinkText).join("  ←  ");
  // A chain whose last link is NOT terminal ran into the `seen` guard: the remaining consumers are already
  // named above it, i.e. the dead region is a CYCLE with no unconsumed head to fix at.
  const cycle = candidate.chain.at(-1)?.terminal === false ? "  ←  ↺ dead CYCLE (no unconsumed head — delete the region)" : "";
  const h = hitOf(candidate.decl, candidate.exported ? "chain-dead-export" : "chain-dead-local");
  h.text = `${candidate.name}  ←  ${rendered}${cycle}`;
  return h;
}

/** The deliverable above the hit list: how many chain-dead declarations hang off each UNCONSUMED HEAD —
 *  the rows a reader actually acts on, since fixing one head resolves every link under it. */
function printChainSummary(audit: ChainAudit): void {
  const { candidates } = audit;
  console.log(
    `chains: graph = ${audit.declarations} declaration(s) with ${audit.edges} consumption edge(s); ${audit.unconsumedHeads} of them are UNCONSUMED heads (the \`orphans\`/\`@public\` class — reported by that lens, not this one). A zero below means those heads have nothing dead hanging off them, NOT that the lens is blind.`,
  );
  const byHead = new Map<string, number>();
  let headless = 0;
  for (const candidate of candidates) {
    const head = candidate.chain.findLast((l) => l.terminal);
    if (head === undefined) {
      headless += 1;
      continue;
    }
    const label = `${head.name}  @ ${head.site}`;
    byHead.set(label, (byHead.get(label) ?? 0) + 1);
  }
  const exported = candidates.filter((c) => c.exported).length;
  console.log(
    `chains: ${candidates.length} chain-dead declaration(s) (${exported} exported, ${candidates.length - exported} file-local) hanging off ${byHead.size} unconsumed head(s)${headless === 0 ? "" : `, plus ${headless} in dead cycles with no head`}`,
  );
  const ranked = [...byHead.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [label, count] of ranked.slice(0, CHAIN_HEADS_SHOWN)) {
    console.log(`  ${String(count).padStart(CHAIN_COUNT_PAD)} link(s) ← head ${label}`);
  }
  if (ranked.length > CHAIN_HEADS_SHOWN) {
    console.log(`  … and ${ranked.length - CHAIN_HEADS_SHOWN} more head(s)`);
  }
}

/** Declarations whose ONLY life originates inside declarations that are themselves dead — the alias
 *  rabbit hole, reported as WHOLE chains in one run. Optional scope (a package name / path); bare = every
 *  package. No marker of its own: the fix (and the `@public` exemption) lives at the chain's HEAD. */
function cmdChains(project: Project, arg: string, flags: Flags): void {
  const scope = arg === "" ? { prefix: PACKAGES_PREFIX, label: "(all packages)" } : resolveScope(project, arg, "chains");
  // The audited surface is `packages/*/src` non-test only (ROOT 2 makes everything else an alive root),
  // so the corpus fences match `buildChainGraph`'s own — the count and the graph agree by construction.
  const inScope = corpusPredicate(
    scanCorpus(project, {
      scope: scope.prefix,
      label: `path:${scope.prefix}`,
      skip: [SKIP_TEST_FILES, { reason: "out-of-scope", test: (fp) => !PACKAGE_SRC_RE.test(fp) }],
    }),
  );
  const live = buildLiveness(project, { edges: true });
  const audit = collectChainAudit(project, live, inScope);
  const { candidates } = audit;
  printChainSummary(audit);
  console.log(
    "chains is a CANDIDATE lens — it reports declarations whose ONLY consumers are THEMSELVES dead, as whole chains (`X ← only via Y (dead) ← only via Z (unconsumed)`). FIX AT THE HEAD: wire it, delete it, or tag it `/** @public <reason> */` — any of the three makes every link below read alive here, which is why this lens has no per-link marker of its own. VERIFY before acting: consumption attribution is syntactic and name-based inside a file, and a consumer this substrate cannot see (a registry keyed from the DB, a `Trpc[…]` proxy read, a template-literal module id) makes a LIVE declaration look chain-dead — a fixpoint amplifies one missed edge into a whole dead-looking subtree. Alive roots: module-scope side effects, test/script consumers, `@public`-tagged exports, and every `packages/ui/src` export (the R2 sealed surface).",
  );
  emit(candidates.map(chainHit), flags, `chains ${scope.label}`);
}

// ── stringy: type aliases whose RESOLVED type is exactly `string` — a name that buys no checking ────────
// NOT the `aliases` verb, and the two must never be conflated. `aliases` is about IMPORT/RENAME laundering —
// one declaration living under N public names (`import/export { X as Y }`, `const Y = X`, `type Y = X`) — and
// it never asks what a type MEANS. This lens never asks what an alias is NAMED: it asks what its right-hand
// side RESOLVES to, and reports the ones that resolve to bare `string`.
//
// THE RULE (owner's framing, 2026-08-03): an alias must NARROW or BRAND. If it does neither it is a lie with a
// nice name — `type X = string` buys a name and gives up all checking, while READING like a type at the call
// site so a reviewer relaxes. Every string in the workspace is assignable to it, and it is assignable to every
// string parameter; the alias's only effect is on human confidence.
//
// WHY THIS MUST BE RESOLUTION-BASED. The direct `type X = string` is one grep (there is exactly ONE on the
// tree). The half that matters is `type A = B` where B — through import chains and re-export hops, usually in
// another package — is itself `string`. No syntactic tool we own can see that; `decl.getType().isString()`
// sees all of it in one checker call, which is why this verb lives in the TYPED arm.
//
// WHAT IS NOT A HIT — each a genuine narrowing, and each falls out of `isString()` with NO allowlist
// (measured on probes, 2026-08-03):
//   • a TEMPLATE-LITERAL type (a backticked `chat_` prefix over a string placeholder) — its flag is
//     TemplateLiteral, never String, so it REJECTS values `string` accepts, which is the point of the alias;
//   • the sanctioned BRAND, `string & { readonly [brand]: B }` (`Branded`/`TypeIdOf`, packages/kit/src/ids) —
//     an INTERSECTION; `ChatId` resolves to it, never to `string`;
//   • a string-literal union (`"a" | "b"`) and any union that merely CONTAINS string (`JsonValue`, `CelValue`,
//     `string | null`) — a union type, never the intrinsic;
//   • a type PARAMETER constrained to string (`type Id<T extends string> = T`), and `string` appearing inside
//     an object / array / tuple — the alias's own type is the parameter or the container.
// A generic whose BODY is `string` whatever its parameters (`type Lies<T> = string`) IS a hit, and is the most
// dishonest shape in the class.
//
// THE CHAIN IS THE DELIVERABLE, not the name. `A → B @ file:line → C @ file:line → string` is what tells a
// reader whether the fix is "brand it", "narrow it", or "delete the alias and use the primitive" — a bare list
// of names makes them re-walk the hops by hand. When the walk ends on a non-alias RHS the checker still
// reduced to string (an indexed access, a `ReturnType<…>`), that expression is printed with `⇒ string`.
//
// FINDINGS lens: NOT a gate, and deliberately NO exemption marker (2026-08-03). The verdict on a hit is a
// human's four-way call — brand it, narrow it, delete it, or ratify the passthrough — and a `@stringy-ok:`
// grammar with no gate reading it is dead vocabulary. If this ever becomes a gate, the marker lands WITH it.

/** How many alias hops a rendered chain names before it stops — past this the reader has the shape. */
const STRINGY_MAX_HOPS = 8;

/** ONE hop in a resolution chain: an intermediate alias the head resolves THROUGH, and where it lives. */
export type StringyLink = { readonly name: string; readonly site: string };

/** ONE alias whose resolved type is exactly `string`: the head declaration, the alias hops between it and the
 *  end of the chain, and the RHS TEXT the last alias in that chain spells (`string`, or the expression the
 *  checker still reduced to `string`). `exported` separates the two remedies — an exported passthrough is a
 *  lie told to other packages, a file-local one only to its own file. */
export type StringyCandidate = {
  readonly name: string;
  readonly decl: Node;
  readonly exported: boolean;
  readonly chain: readonly StringyLink[];
  readonly rhs: string;
};

/** The findings PLUS how many aliases were examined. The stats exist so a ZERO is legible as CLEAN rather
 *  than as blindness — the permanent-zero footgun this file already ate once (`orphans contracts`). */
export type StringyAudit = { readonly candidates: readonly StringyCandidate[]; readonly aliases: number };

/** `<repo-rel file>:<line>` for a declaration — the site form every chain link prints. */
function declSite(decl: Node): string {
  return `${relPath(decl.getSourceFile().getFilePath())}:${decl.getStartLineNumber()}`;
}

/** The type alias a bare type REFERENCE names, resolved through import + re-export hops to its ORIGIN
 *  declaration (the same `getAliasedSymbol()` walk {@link bareAliasTargetKeys} uses — an alias on any hop
 *  cannot fork the identity). Undefined when the RHS is not a type reference, or names something that is not
 *  a type alias (an interface, a class, a type parameter): the chain ends there and the reader is shown the
 *  RHS text instead. Type ARGUMENTS are not a stop condition here — `type A = Lies<string>` over
 *  `type Lies<T> = string` is a real hop, and the head's stringiness was already decided by the checker. */
function aliasHopTarget(decl: Node): Node | undefined {
  if (!Node.isTypeAliasDeclaration(decl)) {
    return;
  }
  const typeNode = decl.getTypeNode();
  if (typeNode === undefined || !Node.isTypeReference(typeNode)) {
    return;
  }
  const entity = typeNode.getTypeName();
  const identifier = Node.isQualifiedName(entity) ? entity.getRight() : entity;
  const symbol = identifier.getSymbol();
  if (symbol === undefined) {
    return;
  }
  return (symbol.getAliasedSymbol() ?? symbol).getDeclarations().find((d) => Node.isTypeAliasDeclaration(d));
}

/** The RHS text of the last alias in a chain, capped — `string` for the honest case, otherwise the expression
 *  the checker reduced to `string`. */
function aliasRhsText(decl: Node): string {
  if (!Node.isTypeAliasDeclaration(decl)) {
    return decl.getText().trim().slice(0, SNIPPET_CAP);
  }
  const typeNode = decl.getTypeNode();
  return (typeNode?.getText() ?? decl.getType().getText()).trim().slice(0, SNIPPET_CAP);
}

/** Walk the alias chain from a head declaration: the hops it resolves through, plus the last hop's RHS text.
 *  The `seen` guard terminates a self-referential chain instead of looping forever. */
function stringyChainOf(head: Node): { chain: StringyLink[]; rhs: string } {
  const chain: StringyLink[] = [];
  const seen = new Set<string>([declKey(head)]);
  let cur = head;
  while (chain.length < STRINGY_MAX_HOPS) {
    const next = aliasHopTarget(cur);
    if (next === undefined || seen.has(declKey(next))) {
      break;
    }
    seen.add(declKey(next));
    chain.push({ name: Node.isTypeAliasDeclaration(next) ? next.getName() : next.getText(), site: declSite(next) });
    cur = next;
  }
  return { chain, rhs: aliasRhsText(cur) };
}

/** Every type alias of `inScope` whose resolved type is exactly `string`, plus the examined count. Pure
 *  enumeration — no printing, no scope policy (the verb owns both), so the self-test drives the same function
 *  the CLI does. Aliases are collected as DESCENDANTS, not top-level statements: one declared inside a
 *  function body or a namespace block is the same lie, told in a smaller room. */
export function collectStringyAudit(project: Project, inScope: (filePath: string) => boolean): StringyAudit {
  const candidates: StringyCandidate[] = [];
  let aliases = 0;
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (!inScope(fp) || TEST_FILE_RE.test(fp)) {
      continue;
    }
    for (const decl of sf.getDescendantsOfKind(SyntaxKind.TypeAliasDeclaration)) {
      aliases += 1;
      // THE WHOLE CUT, in one checker call: the intrinsic `string` type and nothing else. A brand is an
      // intersection, a template literal is its own flag, a union is a union — none of them answer true here.
      if (!decl.getType().isString()) {
        continue;
      }
      const { chain, rhs } = stringyChainOf(decl);
      candidates.push({ name: decl.getName(), decl, exported: decl.isExported(), chain, rhs });
    }
  }
  return { candidates, aliases };
}

/** `<name>  →  <hop> @ site  →  …  →  <rhs>` — the resolution chain a reader needs to pick the fix. */
function stringyHit(candidate: StringyCandidate): Hit {
  const hops = candidate.chain.map((link) => `  →  ${link.name} @ ${link.site}`).join("");
  // A non-`string` RHS means the walk ended on an expression the CHECKER reduced (an indexed access, a
  // `ReturnType<…>`) — say so, or the line reads as if the lens flagged something that is not string.
  const reduced = candidate.rhs === "string" ? "" : "  ⇒  string";
  const h = hitOf(candidate.decl, candidate.exported ? "stringy-export" : "stringy-local");
  h.text = `${candidate.name}${hops}  →  ${candidate.rhs}${reduced}`;
  return h;
}

/** Type aliases that resolve to bare `string` — no narrowing, no brand. Optional scope (a package name /
 *  path); bare = every package. Reports the RESOLUTION CHAIN, which is what names the fix. */
function cmdStringy(project: Project, arg: string, flags: Flags): void {
  const scope = arg === "" ? { prefix: PACKAGES_PREFIX, label: "(all packages)" } : resolveScope(project, arg, "stringy");
  const inScope = corpusPredicate(scanCorpus(project, { scope: scope.prefix, label: `path:${scope.prefix}`, skip: [SKIP_TEST_FILES] }));
  const audit = collectStringyAudit(project, inScope);
  console.log(
    `stringy: ${audit.aliases} type alias(es) examined in scope — a zero below means every one of them NARROWS or BRANDS, not that the lens is blind. (This is NOT \`aliases\`, which reports rename laundering and never inspects a type's meaning.)`,
  );
  console.log(
    "stringy = an alias whose RESOLVED type is exactly `string`: it buys a name and gives up all checking, while reading like a type at the call site. The chain (`A → B → string`) names the fix — BRAND it (`Branded`/`TypeIdOf`, packages/kit/src/ids), NARROW it (a template-literal or a literal union), or DELETE the alias and use the primitive. A template literal, a `string & {brand}` intersection, a literal/value union, and a `T extends string` parameter are all genuine narrowings and are NOT reported. No exemption marker by design: this lens does not gate.",
  );
  emit(audit.candidates.map(stringyHit), flags, `stringy ${scope.label}`);
}

// ── apisurface: exports partitioned by PACKAGE-BOUNDARY consumption (PUBLIC / INTERNAL / UNUSED) ─────────
// The barrel-bloat class every liveness lens above is blind to. `orphans` is BINARY — any importer (prod or
// test) vs none — so an export imported all over its OWN package but by no other package reads exactly like a
// real cross-boundary API. The push-tier ratchet inherits that blindness: it can pin "reached by nobody", it
// cannot see "reached only from inside its own package", which is a barrel export that should be module-private.
// This verb asks the question the ratchet cannot: for each export, is it consumed ACROSS a workspace-package
// boundary (real public API), only WITHIN its own package (accidental public surface), or not at all (rot)?
//
// THE THREE CLASSES (plus one flagged arm of PUBLIC):
//   • PUBLIC — ≥1 PROD consumer in a DIFFERENT workspace package (or a script/tooling consumer outside
//     packages/). The real cross-boundary API. The consuming package(s) are printed. `(type-only)` is noted
//     when every cross-package consumer imported it as a TYPE (`import type` / `import { type X }`) — still
//     public API, but a shape not a runtime value.
//   • INTERNAL — consumed ONLY within its own package (an other-file import in the same package, or a use in
//     its own file). A candidate to un-export from the barrel / make module-private. A same-package consumer
//     is printed.
//   • UNUSED — reached by NOBODY, prod or test, and unused in its own file: the `orphans` set, re-surfaced
//     here with boundary context. Delegated to `collectOrphanCandidates` VERBATIM so the two lenses can never
//     disagree about what an orphan is (and star-suppressed candidates carry the same caveat orphans gives).
//   • TEST-ONLY — the `testonly` arm, flagged distinctly: no PROD consumer anywhere, but a test imports it.
//     Cross-boundary (tests live outside packages/ and import via `@orb/*`) but NOT prod API — never counted
//     as PUBLIC, so a PUBLIC count is a real prod-API count.
//
// WHY A DEDICATED PER-PACKAGE PASS, not `Liveness.consumers` (the declaration-granular edge map `chains`
// reads). Two reasons, both correctness: (1) that map only records an edge when the imported local binding is
// SPELLED in the importing file, so an imported-but-unused cross-package export shows ZERO consumer edges
// while `usedProd` (import-edge presence) says alive — which would desync the PUBLIC/INTERNAL split from the
// UNUSED split this verb takes from `orphans`; (2) it carries no type-only bit. So this pass mirrors
// `markImportConsumption`'s EXACT origin resolution (named specifiers through `getExportedDeclarations().get`,
// namespace + dynamic imports as whole-surface err-alive — the same arms `orphans` trusts) but buckets by the
// IMPORTING file's package instead of client/server/test, and records the type-only bit. It is the same
// parallel-arm shape the file already carries (`buildLiveness` vs `recordDeclarationEdges`).
//
// KEYED ON `declKey`, NEVER A NAME — same rule as every liveness lens: a renaming barrel hop resolves to the
// origin declaration through `getExportedDeclarations()`, so an alias cannot fork an export's identity.
//
// CANDIDATE lens, MANUAL tier — never a gate. The INTERNAL verdict is EVIDENCE for a policy call (un-export it),
// never proof: a same-package-only export may be a deliberate seam wired at a composition root, and a
// cross-package namespace consumer (`import * as ns`) promotes a whole module to PUBLIC exactly as `orphans`
// errs alive — VERIFY with `swallowed` before acting. The report this feeds drives an owner ruling, not a delete.

/** ONE workspace package's src prefix pattern — the seam that names the package a source file belongs to. */
const PKG_SRC_RE = /\/packages\/(?<pkg>[^/]+)\/src\//u;

/** The workspace package a source file belongs to (`server`, `contracts`, …), or undefined for a file outside
 *  any package src tree (a script, a package's own build config) — a "tooling" consumer. */
function packageOfSrcFile(fp: string): string | undefined {
  return PKG_SRC_RE.exec(fp)?.groups?.["pkg"];
}

/** The consumer label for a script/tooling file (outside any package src) — a real prod consumer that is not
 *  a workspace package, so it makes an export PUBLIC while naming that it is not a package boundary. */
const TOOLING_CONSUMER_LABEL = "scripts/tooling";

/** ONE origin's cross-workspace consumption, bucketed by the IMPORTING file's package. Built by mirroring
 *  `markImportConsumption`'s resolution — so an import EDGE is consumption, matching `usedProd` (and thus the
 *  UNUSED split taken from `orphans`), never the finer "was the binding spelled" question the edge map asks. */
type ApiConsumption = {
  /** consuming workspace package → the first prod import site (`file:line`) from it. May include the origin's own. */
  readonly prodPkgs: Map<string, string>;
  /** packages that consumed via at least one VALUE (non-`import type`) import — the type-only note's inverse. */
  readonly valuePkgs: Set<string>;
  /** first non-package, non-test prod consumer (a script / a package build config) — a tooling consumer. */
  toolingSite: string | undefined;
  /** first test-path consumer — the TEST-ONLY arm when no prod consumer exists. */
  testSite: string | undefined;
};

/** `<repo-rel file>:<line>` for a node's own start — the site form every hit prints. */
function nodeSite(node: Node): string {
  const sf = node.getSourceFile();
  return `${relPath(sf.getFilePath())}:${sf.getLineAndColumnAtPos(node.getStart()).line}`;
}

/** ONE consumer of an origin: the importing file, the import site, and whether the import was a VALUE (not
 *  type-only). Bundled so the record function stays inside the house 4-parameter budget. */
type ApiConsumer = { readonly fp: string; readonly site: string; readonly isValue: boolean };

/** Record that `consumer` reaches `originKey`. Buckets exactly as the liveness does: test path → testSite;
 *  a package src file → prodPkgs; anything else (scripts/config) → toolingSite. */
function recordApiConsumer(map: Map<string, ApiConsumption>, originKey: string, consumer: ApiConsumer): void {
  let rec = map.get(originKey);
  if (rec === undefined) {
    rec = { prodPkgs: new Map(), valuePkgs: new Set(), toolingSite: undefined, testSite: undefined };
    map.set(originKey, rec);
  }
  if (isTestPath(consumer.fp)) {
    rec.testSite ??= consumer.site;
    return;
  }
  const pkg = packageOfSrcFile(consumer.fp);
  if (pkg === undefined) {
    rec.toolingSite ??= consumer.site;
    return;
  }
  if (!rec.prodPkgs.has(pkg)) {
    rec.prodPkgs.set(pkg, consumer.site);
  }
  if (consumer.isValue) {
    rec.valuePkgs.add(pkg);
  }
}

/** ONE static import's per-package consumption: named specifiers + default resolve to origins (type-only bit
 *  per specifier / per `import type` clause); `import * as ns` marks the target's WHOLE surface (err alive,
 *  value unless `import type * as`). `export { X } from` is a re-export pass-through, never consumption —
 *  which is why only IMPORT declarations are walked, exactly as `markImportConsumption` does. */
function recordImportApiConsumption(imp: ImportDeclaration, consumerFp: string, map: Map<string, ApiConsumption>): void {
  const target = imp.getModuleSpecifierSourceFile();
  if (target === undefined) {
    return;
  }
  const site = nodeSite(imp);
  const typeOnlyImport = imp.isTypeOnly();
  const ns = imp.getNamespaceImport();
  if (ns !== undefined) {
    for (const key of exposedNames(target).keys()) {
      recordApiConsumer(map, key, { fp: consumerFp, site, isValue: !typeOnlyImport });
    }
    return;
  }
  const exported = target.getExportedDeclarations();
  for (const spec of imp.getNamedImports()) {
    const isValue = !(typeOnlyImport || spec.isTypeOnly());
    for (const decl of exported.get(spec.getName()) ?? []) {
      recordApiConsumer(map, declKey(decl), { fp: consumerFp, site, isValue });
    }
  }
  if (imp.getDefaultImport() !== undefined) {
    for (const decl of exported.get("default") ?? []) {
      recordApiConsumer(map, declKey(decl), { fp: consumerFp, site, isValue: !typeOnlyImport });
    }
  }
}

/** ONE file's dynamic `import()` targets: each keeps the whole target surface alive (err alive, value —
 *  a runtime import can access any member), attributed to the importing file's package. */
function recordDynamicApiConsumption(sf: SourceFile, project: Project, consumerFp: string, map: Map<string, ApiConsumption>): void {
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const target = dynamicImportTargetOf(call, sf, project);
    if (target === undefined) {
      continue;
    }
    const site = `${relPath(consumerFp)}:${call.getStartLineNumber()}`;
    for (const decls of target.getExportedDeclarations().values()) {
      for (const decl of decls) {
        recordApiConsumer(map, declKey(decl), { fp: consumerFp, site, isValue: true });
      }
    }
  }
}

/** origin-key → per-package consumption, over the WHOLE workspace (imports + dynamic imports of every file). */
function buildApiConsumption(project: Project): Map<string, ApiConsumption> {
  const map = new Map<string, ApiConsumption>();
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    for (const imp of sf.getImportDeclarations()) {
      recordImportApiConsumption(imp, fp, map);
    }
    recordDynamicApiConsumption(sf, project, fp, map);
  }
  return map;
}

/** The boundary class of an export. TEST-ONLY is the flagged arm of PUBLIC (cross-boundary but not prod API). */
export type ApiClass = "public" | "internal" | "test-only" | "unused";

/** ONE classified export: its class, its home package, the consuming package(s) that decided a PUBLIC verdict
 *  (or the same-package/tooling consumer that decided an INTERNAL one), a reader-facing evidence site, and the
 *  two caveats a verdict is priced with (`typeOnly` for a PUBLIC shape only ever imported as a type;
 *  `starSuppressed` for an UNUSED candidate reachable through an `export *` chain, as `orphans` reports). */
export type ApiSurfaceEntry = {
  readonly name: string;
  readonly decl: Node;
  readonly klass: ApiClass;
  readonly ownPkg: string;
  readonly consumers: readonly string[];
  readonly evidence: string;
  readonly typeOnly: boolean;
  readonly starSuppressed: boolean;
};

/** The two workspace-wide maps `classifyApiExport` reads: the per-package consumption record, and the
 *  `orphans` set (its key → star-suppressed flag). Bundled so the classifier stays inside the 4-param budget. */
type ApiScanCtx = { readonly consumption: ReadonlyMap<string, ApiConsumption>; readonly orphanStar: ReadonlyMap<string, boolean> };

/** Classify ONE own-export. UNUSED is decided FIRST, off the `orphans` set (so the two lenses never disagree);
 *  otherwise the per-package consumption record splits PUBLIC (a cross-package/tooling prod consumer) from
 *  INTERNAL (own-package prod use or own-file use) from TEST-ONLY (only a test reaches it). `sf`/`ownPkg` are
 *  derived from the declaration, so the caller passes only the export and the scan context. */
function classifyApiExport(name: string, decl: Node, ctx: ApiScanCtx): ApiSurfaceEntry {
  const sf = decl.getSourceFile();
  const ownPkg = packageOfSrcFile(sf.getFilePath()) ?? "(no-package)";
  const key = declKey(decl);
  const base = { name, decl, ownPkg, consumers: [] as string[], evidence: "", typeOnly: false, starSuppressed: false };
  if (ctx.orphanStar.has(key)) {
    return { ...base, klass: "unused", evidence: "reached by nobody (prod or test)", starSuppressed: ctx.orphanStar.get(key) === true };
  }
  const rec = ctx.consumption.get(key);
  const crossPkgs = rec === undefined ? [] : [...rec.prodPkgs.keys()].filter((pkg) => pkg !== ownPkg).sort(byProdFirst);
  const tooling = rec?.toolingSite !== undefined;
  if (crossPkgs.length > 0 || tooling) {
    const consumers = tooling ? [...crossPkgs, TOOLING_CONSUMER_LABEL] : crossPkgs;
    const typeOnly = !tooling && crossPkgs.length > 0 && crossPkgs.every((pkg) => !(rec?.valuePkgs.has(pkg) ?? false));
    const evidence = rec?.prodPkgs.get(crossPkgs[0] ?? "") ?? rec?.toolingSite ?? "";
    return { ...base, klass: "public", consumers, evidence, typeOnly };
  }
  const ownPkgSite = rec?.prodPkgs.get(ownPkg);
  if (ownPkgSite !== undefined || isReferencedInOwnFile(sf, name, decl)) {
    return { ...base, klass: "internal", consumers: [ownPkg], evidence: ownPkgSite ?? `own-file use — ${nodeSite(decl)}` };
  }
  return { ...base, klass: "test-only", evidence: rec?.testSite ?? "a test import" };
}

/** Every own-export whose declaring file is `inScope` (non-test), classified by package-boundary consumption.
 *  Pure enumeration — no printing, no scope policy (the verb owns both) — so the self-test drives the exact
 *  function the CLI does. The UNUSED arm is `collectOrphanCandidates` verbatim; the rest is the per-package pass.
 *  `prebuilt` lets a caller that ALREADY built liveness (the push-tier ratchet, which also needs `isProdConsumed`
 *  for its stale arm) pass it in rather than pay a second whole-workspace liveness pass. */
export function collectApiSurface(project: Project, inScope: (filePath: string) => boolean, prebuilt?: Liveness): ApiSurfaceEntry[] {
  const live = prebuilt ?? buildLiveness(project);
  const orphanStar = new Map(collectOrphanCandidates(project, live, inScope).map((candidate) => [declKey(candidate.decl), candidate.starSuppressed]));
  const ctx: ApiScanCtx = { consumption: buildApiConsumption(project), orphanStar };
  const out: ApiSurfaceEntry[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (!inScope(fp) || TEST_FILE_RE.test(fp)) {
      continue;
    }
    for (const { name, decl } of ownExports(sf)) {
      out.push(classifyApiExport(name, decl, ctx));
    }
  }
  return out;
}

/** The four classes in report order — actionable rot first, healthy PUBLIC last. */
const API_CLASS_ORDER: readonly ApiClass[] = ["unused", "internal", "test-only", "public"];
/** Summary-table column widths: the package-name column and each right-aligned count column (wide enough for
 *  the longest header, `INTERNAL`/`TESTONLY`). */
const API_PKG_COL = 12;
const API_COUNT_COL = 10;

/** The per-package count table — the deliverable a reader wants above the hit list: how many exports of each
 *  package are PUBLIC / INTERNAL / TEST-ONLY / UNUSED, so a ZERO is legible as clean rather than as blindness. */
function printApiSummary(entries: readonly ApiSurfaceEntry[], scannedFiles: number, label: string): void {
  const byPkg = new Map<string, ApiSurfaceEntry[]>();
  for (const entry of entries) {
    byPkg.set(entry.ownPkg, [...(byPkg.get(entry.ownPkg) ?? []), entry]);
  }
  const cell = (s: string): string => s.padStart(API_COUNT_COL);
  console.log(`apisurface ${label}: ${entries.length} own-export(s) across ${byPkg.size} package(s), scanned ${scannedFiles} source file(s)`);
  console.log(`  ${"package".padEnd(API_PKG_COL)}${cell("PUBLIC")}${cell("INTERNAL")}${cell("TESTONLY")}${cell("UNUSED")}`);
  for (const [pkg, list] of [...byPkg.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const n = (klass: ApiClass): string => String(list.filter((entry) => entry.klass === klass).length);
    const unusedStar = list.filter((entry) => entry.klass === "unused" && entry.starSuppressed).length;
    const starNote = unusedStar === 0 ? "" : ` (${unusedStar} star-suppressed)`;
    console.log(`  ${pkg.padEnd(API_PKG_COL)}${cell(n("public"))}${cell(n("internal"))}${cell(n("test-only"))}${cell(n("unused"))}${starNote}`);
  }
}

/** ONE classified export as a printable Hit — the class in the [kind], the deciding evidence in the text. */
function apiSurfaceHit(entry: ApiSurfaceEntry): Hit {
  const h = hitOf(entry.decl, `api-${entry.klass}`);
  const detail = ((): string => {
    if (entry.klass === "public") {
      return `PUBLIC — consumed by ${entry.consumers.join(", ")}${entry.typeOnly ? " (type-only)" : ""}  @ ${entry.evidence}`;
    }
    if (entry.klass === "internal") {
      return `INTERNAL to ${entry.ownPkg} (consumed only within its own package)  @ ${entry.evidence}`;
    }
    if (entry.klass === "test-only") {
      return `TEST-ONLY (no prod consumer; a test imports it — not prod API)  @ ${entry.evidence}`;
    }
    return `UNUSED (${entry.evidence})${entry.starSuppressed ? " [star-suppressed — may be reached via an export* namespace consumer]" : ""}`;
  })();
  h.text = `${entry.name}  —  ${detail}`;
  return h;
}

/** Exports partitioned by package-boundary consumption: PUBLIC (cross-package prod API) / INTERNAL (own-package
 *  only — barrel-bloat candidate) / TEST-ONLY (test-reached, not prod API) / UNUSED (the `orphans` set). Default
 *  emits the actionable arms (INTERNAL + TEST-ONLY + UNUSED); `--public` adds the PUBLIC rows. Optional scope
 *  (a package name / path); bare = every package. */
function cmdApiSurface(project: Project, arg: string, flags: Flags): void {
  const scope = arg === "" ? { prefix: PACKAGES_PREFIX, label: "(all packages)" } : resolveScope(project, arg, "apisurface");
  const files = scanCorpus(project, { scope: scope.prefix, label: `path:${scope.prefix}`, skip: [SKIP_TEST_FILES] });
  const entries = collectApiSurface(project, corpusPredicate(files));
  // The summary's file count is the SCOPE's, not the whole project's — a scoped run used to print the
  // workspace total beside a package's exports, which reads as far more coverage than the run had.
  printApiSummary(entries, files.length, scope.label);
  console.log(
    "apisurface is a CANDIDATE lens — an INTERNAL verdict is EVIDENCE that an export could be made module-private, never proof (a same-package-only export may be a deliberate seam wired at a composition root). UNUSED is the `orphans` set verbatim; a namespace consumer (`import * as ns`) promotes a whole module to PUBLIC exactly as `orphans` errs alive — verify with `swallowed`. Default lists INTERNAL + TEST-ONLY + UNUSED (the actionable arms); pass `--public` to also list the cross-package PUBLIC rows.",
  );
  const shown = flags.public ? API_CLASS_ORDER : API_CLASS_ORDER.filter((klass) => klass !== "public");
  const hits = shown.flatMap((klass) => entries.filter((entry) => entry.klass === klass).map(apiSurfaceHit));
  emit(hits, flags, `apisurface ${scope.label}${flags.public ? "" : " (INTERNAL/TEST-ONLY/UNUSED — pass --public for PUBLIC)"}`);
}

// ── rot: the five rot collectors over ONE package, ONE project load + ONE liveness build ────────────
// Auditing a package with orphans + testonly + chains + typeonly-alive + swallowed today costs FIVE
// separate ~40s project loads — each verb bootstraps its own typed workspace. This composite runs the
// resolution ONCE and calls the EXACT collector function the standalone verb calls for every section —
// never a re-derived copy — so behavior parity with the individual verbs is structural, not promised in
// prose. `buildLiveness({ edges: true })` is built ONCE and shared by all five: the edge flag changes
// nothing about the liveness SETS (pinned by "ast liveness edge map (parallel + opt-in)" in the self-test),
// only whether the `chains`-only `consumers` map gets populated — so building it on is free for the other
// four. Each verb's OWN bucketed/stale-marker narration (star-suppression, declared test seams, the
// union-source bucket, `@…-ok:` staleness) is that verb's business and is deliberately NOT reproduced
// here — run the verb directly for that detail; `rot` exists to answer "which sections need a look".

export function rotOrphanHits(project: Project, live: Liveness, inScope: (fp: string) => boolean): Hit[] {
  return collectOrphanCandidates(project, live, inScope)
    .filter((c) => !c.starSuppressed)
    .map((c) => candidateHit(c, "orphan-export"));
}

export function rotTestOnlyHits(project: Project, live: Liveness, inScope: (fp: string) => boolean): Hit[] {
  const hits: Hit[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (inScope(fp) && !TEST_FILE_RE.test(fp)) {
      hits.push(...scanTestOnly(sf, live, "hit"));
    }
  }
  return hits;
}

export function rotChainHits(project: Project, live: Liveness, inScope: (fp: string) => boolean): Hit[] {
  return collectChainAudit(project, live, inScope).candidates.map(chainHit);
}

export function rotTypeOnlyHits(project: Project, inScope: (fp: string) => boolean): Hit[] {
  return collectTypeOnlyCandidates(project, inScope)
    .filter((c) => !(isTypeOnlyExempt(c.decl) || c.unionSource))
    .map((c) => typeOnlyHit(c));
}

export function rotSwallowedHits(project: Project, live: Liveness, inScope: (fp: string) => boolean): Hit[] {
  return collectSwallowedCandidates(project, live, inScope)
    .filter((c) => !isSwallowedExempt(c.decl))
    .map(swallowedHit);
}

/** One package's five sections, printed and emitted in turn — `emit`'s per-call `noteMatches` accumulates
 *  into the ONE combined epilogue `finishRun` prints at the end of `main`, so five sectioned RESULT lines
 *  still resolve to one audited scan count. */
function cmdRot(project: Project, arg: string, flags: Flags): void {
  const scope = resolveScope(project, arg, "rot");
  const inScope = corpusPredicate(
    scanCorpus(project, {
      scope: scope.prefix,
      label: `path:${scope.prefix}`,
      skip: [SKIP_TEST_FILES, { reason: "out-of-scope", test: (fp) => !PACKAGE_SRC_RE.test(fp) }],
    }),
  );
  const live = buildLiveness(project, { edges: true });
  console.log(
    `rot ${scope.label}: ONE project load + ONE liveness build, five CANDIDATE-lens sections below — orphans / testonly / chains / typeonly-alive / swallowed (each section calls the SAME collector its standalone verb calls; run \`pnpm ast <verb> ${scope.label}\` for that section's exemption-marker grammar and bucketed narration). Trades five ~40s loads for one.`,
  );
  const sections: readonly (readonly [string, Hit[]])[] = [
    ["orphans", rotOrphanHits(project, live, inScope)],
    ["testonly", rotTestOnlyHits(project, live, inScope)],
    ["chains", rotChainHits(project, live, inScope)],
    ["typeonly-alive", rotTypeOnlyHits(project, inScope)],
    ["swallowed", rotSwallowedHits(project, live, inScope)],
  ];
  for (const [name, hits] of sections) {
    emit(hits, flags, `rot ${scope.label} :: ${name}`);
  }
}

const VERBS: Record<string, (project: Project, arg: string, flags: Flags) => void> = {
  refs: cmdRefs,
  callers: cmdCallers,
  importers: cmdImporters,
  exports: cmdExports,
  jsx: cmdJsx,
  ident: cmdIdent,
  literal: cmdLiteral,
  dead: cmdDead,
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
  columns: cmdColumns,
  regkeys: cmdRegKeys,
  chains: cmdChains,
  stringy: cmdStringy,
  apisurface: cmdApiSurface,
  rot: cmdRot,
};

// depcruise pass-throughs — the module-graph layer (the same config + rules the gates run), in
// agent-readable text instead of the pnpm scripts' mermaid. flow = X's direct edges both ways;
// reaches = every module that can transitively reach X (the credential-firewall question shape).
const DEPCRUISE_VERBS: Record<string, string> = { flow: "--focus", reaches: "--reaches" };

function runDepcruise(mode: string, pattern: string): void {
  noteScope(`${mode}:${pattern}`);
  const res = spawnSync("node_modules/.bin/depcruise", ["packages", "--config", ".dependency-cruiser.cjs", "--output-type", "text", mode, pattern], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: DEPCRUISE_MAX_BUFFER_BYTES,
  });
  // depcruise emits one text line per EDGE INSTANCE, so a value import and a type import of the same
  // module render as identical lines — dedupe before printing (order preserved; counts stay honest).
  const raw = (res.stdout ?? "").trim();
  const out = raw === "" ? "" : [...new Set(raw.split("\n"))].join("\n");
  console.log(out === "" ? `RESULT ast ${mode} ${pattern}: no edges` : out);
  // A pass-through: depcruise owns the walk, so `scanned` stays n/a rather than carrying a number this
  // process did not measure. `matches` is the edge-line count — the one result quantity we DO observe.
  const lines = out === "" ? 0 : out.split("\n").length;
  noteMatches(lines, lines);
  if (res.status !== 0 && out === "") {
    console.error((res.stderr ?? "").trim());
    noteToolError();
    process.exitCode = 1;
  }
}

// Verbs that resolve module specifiers to origin declarations (need the types:true / full-graph arm).
// refs+cycles use the language service; orphans+testonly resolve every import to its origin decl so
// liveness keys on (file, name) — bare-name matching over-reports same-file use and misses collisions.
const TYPED_VERBS = new Set([
  "refs",
  "dead",
  "cycles",
  "orphans",
  "testonly",
  "prodonly",
  "unwired",
  "clientgap",
  "swallowed",
  "respell",
  "typeonly-alive",
  "columns",
  "chains",
  "stringy",
  "apisurface",
  "rot",
]);

// Verbs that load the TYPED file set (searchGlobs) WITHOUT the type graph — a purely syntactic walk (no
// language-service resolution) over the wide corpus. `literal` is the only member: a value-change battery
// needs "which code/tests pin this literal" over tests+fixtures+scripts, at the cheap syntactic load.
const WIDE_SYNTACTIC_VERBS = new Set(["literal"]);

// Verbs whose scope arg is OPTIONAL (default to the whole surface) — run bare, arg defaults to "".
const ARGLESS_VERBS = new Set(["unwired", "clientgap", "swallowed", "respell", "typeonly-alive", "columns", "regkeys", "chains", "stringy", "apisurface"]);

const VERB_LIST = [...Object.keys(VERBS), ...Object.keys(DEPCRUISE_VERBS)].join("|");
const USAGE = [
  `usage: pnpm ast <${VERB_LIST}> <arg> [--in substr] [--files] [--public] [--all] [--json] [--max n]`,
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
  "  pnpm ast literal chatDeleted       STRING-LITERAL text only (never idents/comments) — the coupled-fixture sweep",
  "  pnpm ast dead legacyHelper         evidence-ladder verdict for ONE symbol (prod/test refs, swallowed, @public, …)",
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
  "  pnpm ast columns rpg_games         drizzle columns by consumption: READ+WRITE / WRITE-only / READ-only / NEITHER",
  "  pnpm ast regkeys TEMPLATE_DEFS     registry ROWS whose key is dispatched nowhere (HEURISTIC, informational)",
  "  pnpm ast chains server             WHOLE dead chains: declarations alive only via other DEAD declarations",
  "  pnpm ast stringy kit               type aliases that RESOLVE to bare `string` (no narrowing, no brand)",
  "  pnpm ast apisurface contracts      exports by package boundary: PUBLIC (cross-pkg) / INTERNAL / UNUSED",
  "  pnpm ast rot server                orphans+testonly+chains+typeonly-alive+swallowed over ONE package, ONE load",
  "  pnpm ast flow chat/engine          module graph: X's direct edges both ways (depcruise, text)",
  "  pnpm ast reaches agent-sdk         every module that can transitively reach X (depcruise)",
  "",
  "AUDIT EPILOGUE — every run ends with ONE line on STDERR (stdout is byte-unchanged, so pipes/redirects",
  "  keep working). It is what makes a zero trustworthy:",
  "    [ast] verb=… scope=… langs=ts:N,tsx:N scanned=N skipped=N(reason:count,…) matches=N status=complete|partial|error",
  "  scanned = the files the SCOPE admitted (what a hit can come from), counted by the same pass that fed",
  "  the lens; a whole-workspace substrate pass (liveness, reference resolution) is deliberately NOT counted.",
  "  skipped reasons: out-of-scope · out-of-filter (--in) · test-file · declaration-file.",
  "  status: complete = all matches shown · partial = the list was capped (raise --max) · error = NOT a",
  "  verdict. `--json` carries the same fields as an additive `meta` object (no existing key changes).",
  "  scanned=0 prints `SCOPE ENTERED NOTHING` and exits 2 — nothing was searched, so nothing could be found.",
  "  THREE CORPORA, and the epilogue names yours: syntactic verbs load packages/*/src + tests +",
  "  scripts/check/gates; the TYPED verbs (refs/dead/cycles/orphans/testonly/prodonly/unwired/clientgap/",
  "  swallowed/respell/typeonly-alive/columns/chains/stringy/apisurface/rot) also load scripts/**,",
  "  packages/*/*.ts, *.mts and playwright/** — WITH the type graph. `literal` loads the SAME wide file set",
  "  WITHOUT the type graph (a syntactic text match needs no language service), at the cheap load.",
  "  So `ident X --in scripts/dev` scans ZERO files — it now says so instead of `no results`.",
  "  (`pnpm --filter <pkg>` scopes the BUILD, never this lens: use the scope arg or --in, and read scope=.)",
  "",
  "Scope arg (orphans/testonly/prodonly): a package NAME (kit|contracts|db|server|client|ui) OR a path",
  "  under packages/<pkg>/src (`packages/server/src/domain/chat`). A scope matching zero files is a tool",
  '  error — it prints what was tried + a suggestion and exits 2 (never a silent "no results"). The same',
  "  rule now covers every other scope shape: a raw path (exports/aliases/cycles), an --in filter that",
  "  matches nothing, and the UNIT scopes (unwired procedures, columns tables, regkeys registries,",
  "  respell domains) — zero units is a blind lens, not a clean one.",
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
  "columns (CANDIDATE lens, run on demand) = the RV-11 class: every drizzle column in packages/db/src/schema",
  "  classified by how the WORKSPACE consumes it — READ+WRITE (healthy, never a hit) · WRITE-only (something",
  "  fills it, nothing ever reads it back) · READ-only (rendered but never written — a permanent default) ·",
  "  NEITHER (pure rot). READS are EXACT (language-service references, which resolve BOTH `<table>.<col>`",
  "  query refs and `<row>.<col>` accesses on an inferred row); WRITES are STRUCTURAL (drizzle's `$inferInsert`",
  "  is a mapped type whose properties carry ZERO declarations, so no reference resolution can see a write) —",
  "  walked from every `insert(<T>)….values(x)` / `update(<T>)….set(x)` / `.onConflictDoUpdate({set:x})`. A",
  "  whole-row or spread writer names no column, so it marks its TABLE opaque and every column of it prints",
  '  `write?` — never "unwritten". A `raw?` annotation = the column\'s SQL name appears in some raw `sql`',
  "  template; v1 CANNOT attribute an alias-qualified raw query to a table, so that arm is table-agnostic and",
  "  deliberately over-inclusive. Scope = a SQL table name / table variable / schema-file substring; bare =",
  "  every table. Keep one deliberately with `// @column-ok: <reason>` on the column property; a marker on a",
  "  now-READ+WRITE column is reported STALE and exits 1 (two-sided). SLOW — one reference resolution per column.",
  "",
  "regkeys (HEURISTIC + INFORMATIONAL — never gates, no exemption marker, owner-ruled) = the ROW-level blind",
  "  spot every symbol lens shares: a string-keyed dispatch table is ONE live symbol however many of its rows",
  "  are dead. A registry is derived structurally (an exported const with 3+ rows carrying a `Record<…>`",
  "  annotation or a SCREAMING_SNAKE name — an OBJECT literal keyed by property name, or an ARRAY literal of",
  '  `{ id: "<key>" }` rows, the TEMPLATE_DEFS shape), and a row is reported when its KEY is spelled — as a',
  "  string, a property name, an identifier, or a JSX attribute — in NO non-test file outside its own table.",
  "  EXPECT FALSE POSITIVES: a key from the DB, a URL segment, a template literal, or an `Object.keys(REG)`",
  "  iteration is a LIVE row that looks dead here. That is exactly why it never gates. Syntactic only, so fast.",
  "",
  "chains (CANDIDATE lens, run on demand) = the ALIAS-RABBIT-HOLE class `orphans` is structurally blind to.",
  "  `orphans` asks 'does anything reach this export?' and stops, so a dead chain (`export const Head = Mid`",
  "  that nobody consumes, `export const Mid = Deep`, `function Deep()`) reports as ONE hit — the head — and",
  "  costs a delete-and-rerun cycle per link. No FILE lens can help either: the middle links live inside",
  "  perfectly live files. `chains` runs a FIXPOINT over a DECLARATION-granular consumption edge (which",
  "  declaration's body holds the consuming reference, not merely which file) and reports whole chains in one",
  "  run: `X ← only via Y (dead) ← only via Z (unconsumed)`. ALIVE ROOTS: a module-scope side-effect consumer,",
  "  a consumer in a test/script (outside packages/), a `/** @public <reason> */` export (the ratchet's own",
  "  marker, read through the ratchet's own predicate), and every `packages/ui/src` export (the R2 sealed",
  "  surface). A declaration NOTHING reaches is an `orphans` hit and is deliberately NOT repeated here. There",
  "  is NO per-link exemption marker by design — every chain ends at an unconsumed head that `orphans` already",
  "  reports and the ratchet already governs, so FIX AT THE HEAD (wire it, delete it, or `@public` it) and the",
  "  whole chain resolves. VERIFY before acting: a consumer this substrate cannot see (a DB-keyed registry",
  "  row, a `Trpc[…]` proxy read) makes a live declaration look chain-dead, and a fixpoint amplifies one",
  "  missed edge into a whole dead-looking subtree. Optional scope; bare = every package.",
  "",
  "stringy (FINDINGS lens, run on demand) = an alias that NEITHER NARROWS NOR BRANDS: its RESOLVED type is",
  "  exactly `string`, so it buys a name and gives up all checking while READING like a type at the call site.",
  "  DO NOT confuse it with `aliases` — that verb reports rename laundering (`X as Y` / `const Y = X` /",
  "  `type Y = X`: one declaration under N public names) and never inspects what a type MEANS; this one never",
  "  inspects what an alias is NAMED. Resolution-based on purpose: the direct `type X = string` is a grep, but",
  "  `type A = B` where B is `string` across import + re-export hops in another package is invisible to every",
  "  syntactic tool. NOT reported, because each genuinely narrows: a template-literal type (a backticked",
  "  `chat_` prefix over a string placeholder), the brand `string & { readonly [brand]: B }` (`Branded`/",
  "  `TypeIdOf`, packages/kit/src/ids — the sanctioned form), a literal union or any",
  "  union merely CONTAINING string (`JsonValue`, `string | null`), a `T extends string` parameter, and `string`",
  "  inside an object/array. A generic whose body is `string` regardless of its parameters IS reported. Each hit",
  "  prints its RESOLUTION CHAIN (`A → B @ file:line → string`) — that is what names the fix: BRAND it, NARROW",
  "  it, or DELETE the alias and use the primitive. No exemption marker and no gate (owner-ruled: the verdict is",
  "  a human's four-way call, and a marker no gate reads is dead vocabulary). Optional scope; bare = all packages.",
  "",
  "apisurface (CANDIDATE lens, run on demand) = the BARREL-BLOAT class `orphans`/the ratchet are blind to.",
  "  `orphans` is BINARY (any importer vs none), so an export used all over its OWN package but by no other",
  "  package reads exactly like a real cross-boundary API. This verb partitions every export by the PACKAGE of",
  "  its consumers: PUBLIC (≥1 PROD consumer in a DIFFERENT workspace package — the consuming package(s) are",
  "  printed; `(type-only)` when every cross-pkg consumer imported it as a TYPE) · INTERNAL (consumed ONLY",
  "  within its own package — a candidate to un-export from the barrel / make module-private) · UNUSED (the",
  "  `orphans` set verbatim, so the two never disagree — star-suppressed candidates carry the same caveat) ·",
  "  TEST-ONLY (no prod consumer anywhere, but a test imports it — cross-boundary yet NOT prod API, flagged",
  "  distinctly so a PUBLIC count is a real prod-API count). It keys on the origin declaration (a renaming",
  "  barrel hop cannot fork identity) and mirrors `orphans`' err-alive arms: a namespace consumer",
  "  (`import * as ns`) or a dynamic import promotes a whole module to PUBLIC — VERIFY with `swallowed`.",
  "  Default lists INTERNAL + TEST-ONLY + UNUSED (the actionable arms); `--public` adds the PUBLIC rows.",
  "  Optional scope (a package name / path); bare = every package, grouped in a per-package count table.",
  "",
  "literal (WIDE-CORPUS search, run on demand) = string-LITERAL text ONLY — the exact complement of `ident`",
  "  (which never looks inside a string). Matches `value` as a substring of a StringLiteral /",
  "  NoSubstitutionTemplateLiteral's full text, and every STATIC chunk of a TemplateExpression (the text",
  "  between interpolation holes — an interpolated hole is never text, so it never matches). Runs over",
  "  the WIDE corpus (tests + fixtures + scripts, no type graph): the coupled-fixture sweep a value-",
  "  changing merge needs — 'which code/tests pin this literal' as one receipted command instead of a",
  "  noisy `rg` that also matches comments and identifiers.",
  "",
  "dead (CANDIDATE lens, run on demand) = a composite evidence-ladder verdict for ONE symbol, resolved",
  "  once (the same substrate `refs` uses) and laid out as a table: production references (count + up to 3",
  "  sites) · test-only references · namespace-swallowed consumption (the `swallowed` collector, scoped to",
  "  this declaration) · the `@public`-family marker · a vendored-file home (informational — `/vendor/` or",
  "  a header comment saying so) · raw COMMENT-TEXT mentions (informational — the one arm here that",
  "  deliberately reads comments). Ends with ONE verdict, evidence-priority order: ALIVE (≥1 prod ref) ·",
  "  SWALLOWED-ONLY (may be load-bearing THROUGH the swallowing API) · TAGGED-KEEP (a `@public` marker) ·",
  '  TEST-ANCHORED (reached only from tests) · CANDIDATE (nothing reaches it). "Unwired ≠ worthless"',
  "  (constitution §1) — the verdict is a human's, never a delete signal. A name with several declarations",
  "  (a collision) is classified once per declaration.",
  "",
  "rot (CANDIDATE lens, run on demand) = the five rot collectors — orphans / testonly / chains /",
  "  typeonly-alive / swallowed — over ONE package, with ONE project load + ONE liveness build instead of",
  "  five separate ~40s loads. Each section calls the EXACT collector function its standalone verb calls",
  "  (never a re-derived copy), so behavior parity is structural. Bucketed/stale-marker narration (star-",
  "  suppression, declared test seams, the union-source bucket, `@…-ok:` staleness) is each standalone",
  "  verb's own business and is NOT reproduced here — run the verb directly for that detail. Required arg",
  "  = a package name / path (no bare form).",
  "",
  "Flags: --in <substr> path filter · --files per-file counts only (cheapest output) ·",
  "       --public (apisurface) also list PUBLIC rows, not just the actionable arms ·",
  "       --all (columns/regkeys) per-table/per-registry sectioning over EVERY table/registry — full",
  "       findings for one that has any, one collapsed line for a clean one, instead of forty manual",
  "       per-table/per-registry runs ·",
  "       --max <n> raw-line cap (default 60; big result sets auto-collapse to per-file counts) ·",
  "       --json machine output (repeated once per section for rot). Syntactic verbs load in ~10s;",
  "       refs/dead/cycles/orphans/testonly/prodonly/typeonly-alive/columns/apisurface/rot resolve types;",
  "       literal loads the wide corpus without resolving types.",
].join("\n");

function main(): void {
  const [verb, arg, ...rest] = process.argv.slice(2);
  if (verb !== undefined && arg !== undefined && DEPCRUISE_VERBS[verb] !== undefined) {
    beginRun(verb, CORPUS_DEPCRUISE, parseFlags(rest));
    runDepcruise(DEPCRUISE_VERBS[verb], arg);
    finishRun();
    return;
  }
  const run = verb === undefined ? undefined : VERBS[verb];
  // unwired/clientgap/respell take an OPTIONAL scope — default the arg to "" so they run bare (whole
  // surface). A leading FLAG is not a scope: `pnpm ast respell --max 60` used to read "--max" as the domain
  // name and exit 2 on it, so an argless verb's first token is handed back to the flag parser when it starts
  // with `--`.
  const argless = verb !== undefined && ARGLESS_VERBS.has(verb);
  // `=== true` keeps this a plain `boolean`; biome's bare `arg?.startsWith("--")` widens it to
  // `boolean | undefined`, which the `argIsFlag && arg !== undefined` read two lines down relies on not being.
  const argIsFlag = argless && arg?.startsWith("--") === true;
  const effectiveArg = argIsFlag ? "" : (arg ?? (argless ? "" : undefined));
  const flagTokens = argIsFlag && arg !== undefined ? [arg, ...rest] : rest;
  if (run === undefined || effectiveArg === undefined || verb === undefined) {
    console.log(USAGE);
    return;
  }
  const typed = TYPED_VERBS.has(verb);
  const wide = WIDE_SYNTACTIC_VERBS.has(verb);
  const flags = parseFlags(flagTokens);
  beginRun(verb, corpusOf(typed, wide), flags);
  run(loadProject(typed, wide), effectiveArg, flags);
  finishRun();
}

/** Which corpus label a run's epilogue carries — the three arms `loadProject` can produce. */
function corpusOf(typed: boolean, wide: boolean): string {
  if (typed) {
    return CORPUS_TYPED;
  }
  return wide ? CORPUS_WIDE_SYNTACTIC : CORPUS_SYNTACTIC;
}

// Run only as the CLI entrypoint — importing this module (the self-test drives the pure enumeration
// functions over an in-memory project) must NOT execute a scan.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main();
  } catch (e) {
    if (e instanceof CodemodError) {
      console.error(`ast: ${e.message}`);
      // exitCode BEFORE the epilogue: `finishRun` never downgrades a verdict a caller already set.
      process.exitCode = 1;
      noteToolError();
      finishRun();
    } else {
      throw e;
    }
  }
}

// Exported for the self-test (tests/tooling/ast-lens.test.ts) — the pure enumeration substrate the
// unwired/clientgap lenses diff, drivable over an in-memory ts-morph project — AND for the push-tier
// orphan-export ratchet (scripts/verify/orphan-export-ratchet.ts), which judges the SAME candidate set
// this file's `orphans` verb prints (one definition of "orphan", never a parallel one).
export type { Hit, Liveness };
export { buildLiveness, collectClientConsumed, collectServerProcedures, isUnwiredExempt };
