// THE SCAN LEDGER + the scan seam — every invocation ends with ONE auditable epilogue; a
// zero-scan run is a TOOL ERROR, never a clean no-results. Split from ast.ts (P4 of #393).
// exitToolError now THROWS AstToolError (arm D: process.exit is run-tool.ts's alone); the cli
// maps it to EXIT.toolError.

import process from "node:process";
import type { SourceFile } from "ts-morph";
import { warn } from "../../_shared/log.ts";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import { harnessGlobs, searchGlobs } from "../../_shared/ts-workspace.ts";
import type { Flags, ScanMeta, ScanSpec, ScanStatus, ScopeMatch, SkipReason, SkipRule } from "../contract/types.ts";
import { REPO_ROOT, TEST_FILE_RE } from "./root.ts";

/** The typed tool-error carrier exitToolError throws — the cli maps it to EXIT.toolError. */
export class AstToolError extends Error {}

interface ScanLedger {
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
}

/** The invocation's ledger. Undefined when this module is IMPORTED rather than run (the self-test and the
 *  push-tier ratchet drive the pure collectors) — every note is a no-op then, so importing prints nothing. */
export let ledger: ScanLedger | undefined;

const TOOL_ERROR_EXIT = 2;

export const EPILOGUE_TAG = "[ast]";

/** Render the actual shared glob authority repo-relative, so an epilogue can never advertise a stale
 *  approximation of what its loader admitted. Exclusions retain their leading `!`. */
function corpusLabel(authority: string, globs: readonly string[]): string {
  const rootPrefix = `${REPO_ROOT}/`;
  const patterns = globs.map((glob) => {
    const excluded = glob.startsWith("!");
    const absolute = excluded ? glob.slice(1) : glob;
    const relative = absolute.startsWith(rootPrefix) ? absolute.slice(rootPrefix.length) : absolute;
    return `${excluded ? "!" : ""}${relative}`;
  });
  return `${authority}(${patterns.join(",")})`;
}

/** Semantic searches expose authored roots from the native per-tsconfig programs. */
export const CORPUS_TYPED = "native-program-authored-roots(per-tsconfig)";

export const CORPUS_SYNTACTIC = corpusLabel("harness-globs", harnessGlobs(REPO_ROOT));

/** The shared search globs without a type graph, used by the literal/fixture sweep. Native semantic
 *  program roots are selected independently, so this is not a promise of identical file membership. */
export const CORPUS_WIDE_SYNTACTIC = corpusLabel("search-globs-no-types", searchGlobs(REPO_ROOT));

export const CORPUS_DEPCRUISE = "depcruise(.dependency-cruiser.cjs)";

export function beginRun(verb: string, corpus: string, flags: Flags): void {
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
export function noteScope(part: string): void {
  ledger?.scopeParts.push(part);
}

/** A scope that resolves to UNITS, not paths — tRPC procedures, drizzle tables, registries, domains. Zero
 *  units is a lens that entered nothing (a router shape it no longer recognizes, a table name typo): the
 *  same tool error as a zero-file path scope, and the reason `unwired` can no longer report a silent clean
 *  when `appRouter` stops matching. */
export function noteUnits(kind: string, count: number): void {
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
export function noteMatches(total: number, shown: number): void {
  if (ledger === undefined) {
    return;
  }
  ledger.matches += total;
  ledger.truncated = ledger.truncated || shown < total;
}

/** The run is not a verdict — a broken subprocess, an unavailable compiler API, an empty unit scope. */
export function noteToolError(): void {
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
export function scanMeta(): ScanMeta {
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
  return `${EPILOGUE_TAG} SCOPE ENTERED NOTHING — ${cause}. This is a TOOL ERROR (exit ${TOOL_ERROR_EXIT}), not a clean result: nothing was searched, so nothing could be found. Corpus authorities: syntactic verbs load ${CORPUS_SYNTACTIC}; wide syntactic verbs load ${CORPUS_WIDE_SYNTACTIC}; typed verbs load ${CORPUS_TYPED}.`;
}

/** Print the epilogue (stderr) and set the exit code when the run is not a verdict. Idempotent — the
 *  tool-error path calls it before exiting, and `main` calls it on the way out. */
export function finishRun(): void {
  if (ledger === undefined || ledger.finished) {
    return;
  }
  ledger.finished = true;
  const meta = scanMeta();
  warn(formatEpilogue(meta));
  if (meta.status !== "error") {
    return;
  }
  if (ledger.scanned === 0) {
    warn(emptyScopeDiagnosis(ledger));
  }
  // Never DOWNGRADE an exit code a lens already set: the two-sided STALE-marker arms (swallowed /
  // typeonly-alive / columns) own exit 1, and that verdict outranks the generic tool-error code here.
  // (The depcruise pass-through used to be listed here too. It is not a verdict-setter any more: with
  // `--output-type text` depcruise cannot report violations at all, so its nonzero exits are tool breaks
  // and go through `exitToolError` — ops/depcruise.ts carries the receipt. #1507.)
  if (process.exitCode === undefined || process.exitCode === 0) {
    process.exitCode = TOOL_ERROR_EXIT;
  }
}

/** A tool error with its own message: print it, close the ledger (so the epilogue still lands), and
 *  THROW AstToolError — the cli maps it to EXIT.toolError (arm D: process.exit is run-tool.ts's alone).
 *  The ONE tool-error door — every scope/API failure in this file goes through it, so none can skip
 *  the audit. */
export function exitToolError(message: string): never {
  warn(message);
  noteToolError();
  finishRun();
  throw new AstToolError(message);
}

/** The verbs' own test fence is `TEST_FILE_RE` (a `.test`/`.ct` FILE), not `isTestPath` — mirror the
 *  spelling the lens uses, or the count and the lens disagree on the tests/ tree. */
export const SKIP_TEST_FILES: SkipRule = { reason: "test-file", test: (fp) => TEST_FILE_RE.test(fp) };

export const SKIP_DECLARATION_FILES: SkipRule = { reason: "declaration-file", test: (fp) => fp.endsWith(".d.ts") };

/** The whole loaded corpus — the symbol verbs (`refs`/`callers`/`importers`/`jsx`/`ident`), which search
 *  workspace-wide and narrow only their OUTPUT with `--in`. */
export const WHOLE_CORPUS: ScanSpec = { scope: "", label: "workspace" };

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
export function scanCorpus(project: SourceCorpus, spec: ScanSpec): SourceFile[] {
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
export function corpusPredicate(files: readonly SourceFile[]): (filePath: string) => boolean {
  const paths = new Set(files.map((sf) => sf.getFilePath()));
  return (filePath) => paths.has(filePath);
}
