// `pnpm verify` — the ONE verification entry (UNIFIED-VERIFICATION-DESIGN.md §3). Built on the proven bones
// of the retired `pnpm check` orchestrator (sequential spawn, stream + tee, JSON artifact, max-severity
// exit), generalized over the self-describing stage REGISTRY. Four tiers, one scope convention, one exit
// contract, one summary/artifact.
//
//   pnpm verify              → --static  (today's `pnpm check`, byte-compatible)
//   pnpm verify --changed    → the inner loop (scoped, related tests)
//   pnpm verify --static     → the pre-commit bundle (= `pnpm check`)
//   pnpm verify --push       → static + node tests + CT + e2e-smoke (the pre-push bar)
//   pnpm verify --full       → push + cpd + full e2e + parity + mutation-gate
//   pnpm verify --list       → print every registry row (incl. manual) with its tiers/reason
//   pnpm verify --json       → mirror reports/verify.json to stdout
//   pnpm verify --file <p…>  → scoped to explicit paths (the check:file muscle memory)
//   pnpm verify --package <n> / --scope <glob> / --tier <name>  → package / folder / explicit-tier scope
//   pnpm verify --strict-scope  → a whole-only stage at a scoped tier REFUSES (exit 3) instead of deferring
//   pnpm verify --verbose    → stream each stage's full output live (default: COMPACT — a per-stage ✓/✗
//                              line only; full output goes to the logs + json, so the console survives any
//                              head/tail truncation; a TTY auto-enables verbose for humans)
//
// ARGV is parsed by node:util `parseArgs` under a STRICT schema (OPTIONS): an unknown flag, a value option
// with no value (or a flag as its value), >1 scope selector, or >1 tier are all MISUSE (exit 3) — never a
// silent-ignore. Both `--flag value` and `--flag=value` are handled.
//
// TRUNCATION-ROBUST OUTPUT (the load-bearing property): a reader who sees ONLY the first ~15 lines (the HEAD
// banner) OR ONLY the last ~15 lines (the TAIL block) can determine PASS/FAIL, which stages failed, and that
// reports/verify.json is the authoritative machine-readable result (verdict + per-stage status + a failure
// excerpt) alongside reports/verify/<stage>.log. The reports pointer prints at BOTH head and tail on BOTH
// pass and fail.
//
// EXIT CONTRACT (§3.3): 0 clean · 1 violations · 2 tool error · 3 misuse. Run exit = max severity over
// stages (2 > 3 > 1 > 0). A whole-only stage the scope can't run is DEFERRED with a printed + recorded
// notice — a scoped green is visibly a scoped green — unless --strict-scope makes it a refusal.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { ScopedArgv, StageDef, Tier } from "./registry.ts";
import { manualStages, stagesForTier } from "./registry.ts";
import type { Selection, SelectionRequest } from "./selection.ts";
import { badPaths, resolveSelection } from "./selection.ts";

const EXIT_CLEAN = 0;
const EXIT_VIOLATIONS = 1;
const EXIT_TOOL_ERROR = 2;
const EXIT_MISUSE = 3;

const SEVERITY_RANK: Readonly<Record<number, number>> = {
  [EXIT_TOOL_ERROR]: 3,
  [EXIT_MISUSE]: 2,
  [EXIT_VIOLATIONS]: 1,
  [EXIT_CLEAN]: 0,
};

const NAME_PAD = 20; // stage-name column width in `verify --list`.

function severityRank(code: number): number {
  return SEVERITY_RANK[code] ?? 0;
}

/** The run's exit = the highest-severity stage exit (2 > 3 > 1 > 0). Exported for the unit test. */
export function aggregateExit(codes: readonly number[]): number {
  let worst = EXIT_CLEAN;
  for (const code of codes) {
    if (severityRank(code) > severityRank(worst)) {
      worst = code;
    }
  }
  return worst;
}

type StageMode = "full" | "scoped" | "deferred" | "skipped";

type StageResult = {
  readonly name: string;
  readonly group: string;
  readonly mode: StageMode;
  readonly ok: boolean;
  readonly exitCode: number;
  readonly durationMs: number;
  readonly logFile: string | null;
  /** On failure: a short tail excerpt of the stage's output (the last few non-blank lines) so a bot
   *  reading ONLY reports/verify.json sees WHY it failed without opening the per-stage log. */
  readonly failureExcerpt: string | null;
  /** For a deferred stage: the tier where it DOES run (so a scoped green names what it skipped). */
  readonly runsAt: string | null;
};

type VerifyReport = {
  readonly tier: Tier;
  readonly scope: string;
  readonly ok: boolean;
  readonly exitCode: number;
  /** The count of stages that failed (violations or tool-error) — the top-of-file verdict at a glance. */
  readonly failed: number;
  readonly stages: readonly StageResult[];
};

// ── argv parsing ────────────────────────────────────────────────────────────────────────────────────
type Parsed = {
  readonly tier: Tier;
  readonly selection: Selection | undefined; // undefined = whole scope
  readonly strictScope: boolean;
  readonly list: boolean;
  readonly json: boolean;
  readonly verbose: boolean;
};

const ARGV_START = 2; // process.argv[0]=node, [1]=script, actual args start at 2.

// The strict option schema (node:util parseArgs, stdlib — no new dep). Every accepted flag is declared;
// `strict:true` + `allowPositionals:true` makes an UNKNOWN flag (`--bogus`) throw → we map that to exit 3
// (misuse), never a silent-ignore. The tier markers (--static/--push/--full/--changed) and the value
// selectors (--package/--scope/--tier) live here; --file/--changed's PATHS arrive as positionals (only one
// scope selector is legal at a time, so a trailing `a b` unambiguously belongs to whichever is present).
const OPTIONS = {
  // scope selectors that take a value:
  package: { type: "string" },
  scope: { type: "string" },
  tier: { type: "string" },
  // scope-selector markers whose paths come from positionals:
  file: { type: "boolean" },
  changed: { type: "boolean" },
  // tier markers (bare, no value):
  static: { type: "boolean" },
  push: { type: "boolean" },
  full: { type: "boolean" },
  // run-shaping booleans:
  "strict-scope": { type: "boolean" },
  json: { type: "boolean" },
  list: { type: "boolean" },
  verbose: { type: "boolean" }, // stream each stage's full output live (default: compact — logs+json only)
} as const;

// The value-taking string options — a flag that must NOT swallow the NEXT flag as its value. parseArgs
// happily reads `--package --json` as package="--json"; we reject a value that is itself a flag (exit 3).
const VALUE_OPTIONS = new Set(["package", "scope", "tier"]);

/** A --tier <name> value must name a real, non-manual tier. */
const RUNNABLE_TIERS: ReadonlySet<Tier> = new Set<Tier>(["changed", "static", "push", "full"]);

type ParsedValues = {
  readonly package?: string;
  readonly scope?: string;
  readonly tier?: string;
  readonly file?: boolean;
  readonly changed?: boolean;
  readonly static?: boolean;
  readonly push?: boolean;
  readonly full?: boolean;
  readonly "strict-scope"?: boolean;
  readonly json?: boolean;
  readonly list?: boolean;
  readonly verbose?: boolean;
};

/** parseArgs, but any throw (unknown flag, missing value, dangling `=`) is turned into our misuse error —
 *  parseArgs already covers UNKNOWN flags and `--opt=` shapes; we ONLY add the flag-as-value guard below. */
function parseStrict(
  argv: readonly string[],
):
  | { readonly values: ParsedValues; readonly positionals: readonly string[] }
  | { readonly error: string } {
  // Guard the `--valueOption --nextFlag` footgun BEFORE parseArgs consumes the flag as a value. A value
  // given inline (`--package=db`) is fine; the hazard is only the space-separated `--package --json` form.
  for (let i = 0; i < argv.length; i += 1) {
    const tok = argv[i];
    if (tok === undefined || !tok.startsWith("--") || tok.includes("=")) {
      continue;
    }
    const name = tok.slice(2);
    if (VALUE_OPTIONS.has(name)) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        return { error: `--${name} needs a value` };
      }
    }
  }
  try {
    const { values, positionals } = parseArgs({
      args: [...argv],
      options: OPTIONS,
      strict: true,
      allowPositionals: true,
    });
    return { values: values as ParsedValues, positionals };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Which single scope selector is present (0 ⇒ whole scope; >1 ⇒ misuse). */
function scopeSelectorCount(v: ParsedValues): number {
  return [v.file, v.changed, v.package !== undefined, v.scope !== undefined].filter(Boolean).length;
}

/** No scope flag → whole scope. A distinct sentinel (not `undefined`) so the resolver stays total. */
const WHOLE_SCOPE = { none: true } as const;
type ScopeResult = SelectionRequest | typeof WHOLE_SCOPE | { readonly error: string };

/** The --file branch: ≥1 positional path, all under the repo + existing (the check:file muscle memory). */
function fileRequest(
  positionals: readonly string[],
): SelectionRequest | { readonly error: string } {
  if (positionals.length === 0) {
    return { error: "--file needs at least one path" };
  }
  const bad = badPaths(positionals);
  if (bad.length > 0) {
    return { error: `not under the repo or nonexistent: ${bad.join(", ")}` };
  }
  return { kind: "file", paths: positionals };
}

/** The --changed branch: `--changed git` (or bare) = git diff vs HEAD; other positionals = explicit paths. */
function changedRequest(positionals: readonly string[]): SelectionRequest {
  const paths = positionals.length === 1 && positionals[0] === "git" ? [] : positionals;
  return { kind: "changed", paths };
}

/** Resolve the ONE scope request from the parsed flags + positionals, WHOLE_SCOPE for none, or an error. */
function scopeRequest(v: ParsedValues, positionals: readonly string[]): ScopeResult {
  const count = scopeSelectorCount(v);
  if (count === 0) {
    // Bare positionals with no scope selector are meaningless — reject rather than silently drop them.
    return positionals.length > 0
      ? {
          error: `unexpected argument(s): ${positionals.join(" ")} (did you mean --file / --changed?)`,
        }
      : WHOLE_SCOPE;
  }
  if (count > 1) {
    return { error: "at most one of --changed / --file / --package / --scope" };
  }
  if (v.file === true) {
    return fileRequest(positionals);
  }
  if (v.changed === true) {
    return changedRequest(positionals);
  }
  if (v.package !== undefined) {
    return v.package.length === 0
      ? { error: "--package needs a name" }
      : { kind: "package", name: v.package };
  }
  const glob = v.scope ?? "";
  return glob.length === 0 ? { error: "--scope needs a folder glob" } : { kind: "scope", glob };
}

// The bare tier markers, in registry order. `--changed` doubles as BOTH a scope selector AND its own
// (inner-loop) tier, so it lives here too.
const TIER_MARKERS: readonly (readonly [keyof ParsedValues, Tier])[] = [
  ["changed", "changed"],
  ["static", "static"],
  ["push", "push"],
  ["full", "full"],
];

/** The tier for a run: an explicit --tier <name> or a bare tier marker wins; else a scope flag implies
 *  `changed`; else `static`. A run may name AT MOST ONE distinct tier. */
function tierFor(v: ParsedValues, scoped: boolean): Tier | { readonly error: string } {
  const named = new Set<Tier>();
  for (const [key, tier] of TIER_MARKERS) {
    if (v[key] === true) {
      named.add(tier);
    }
  }
  if (v.tier !== undefined) {
    if (!RUNNABLE_TIERS.has(v.tier as Tier)) {
      return { error: `--tier must be one of changed / static / push / full (got "${v.tier}")` };
    }
    named.add(v.tier as Tier);
  }
  if (named.size > 1) {
    return { error: `at most one tier: got ${[...named].join(" ")}` };
  }
  for (const sole of named) {
    return sole;
  }
  return scoped ? "changed" : "static";
}

/** Parse argv into a run plan or a misuse error. Exported for the exit-code matrix unit test — a returned
 *  `{ error }` is what `main()` maps to exit 3 (misuse); a `Parsed` is what runs. */
export function parse(argv: readonly string[]): Parsed | { readonly error: string } {
  const parsedArgs = parseStrict(argv);
  if ("error" in parsedArgs) {
    return { error: parsedArgs.error };
  }
  const { values, positionals } = parsedArgs;
  const req = scopeRequest(values, positionals);
  if ("error" in req) {
    return { error: req.error };
  }
  const scoped = !("none" in req);
  const tier = tierFor(values, scoped);
  if (typeof tier === "object") {
    return { error: tier.error };
  }
  const strictScope = values["strict-scope"] === true;
  const list = values.list === true;
  const json = values.json === true;
  // Compact console is the DEFAULT (truncation-robust: the whole console fits, no live stage stream to
  // scroll the verdict away). A human on a TTY, or an explicit --verbose, gets the live stream.
  const verbose = values.verbose === true || process.stdout.isTTY === true;
  if ("none" in req) {
    return { tier, selection: undefined, strictScope, list, json, verbose };
  }
  return { tier, selection: resolveSelection(req), strictScope, list, json, verbose };
}

// ── the run ─────────────────────────────────────────────────────────────────────────────────────────

/** Resolve how a stage runs at this tier+scope: its concrete argv, or a mode sentinel. */
function planStage(
  stage: StageDef,
  selection: Selection | undefined,
): {
  readonly mode: StageMode;
  readonly argv: readonly [string, ...string[]] | null;
  readonly runsAt: string | null;
} {
  if (selection === undefined) {
    return { mode: "full", argv: stage.argv, runsAt: null };
  }
  // Scoped run: a stage with no scopedArgv is whole-only ⇒ deferred.
  if (stage.scopedArgv === undefined) {
    return { mode: "deferred", argv: null, runsAt: pushOrStatic(stage) };
  }
  const scoped: ScopedArgv = stage.scopedArgv(selection);
  if (scoped === "whole-only") {
    return { mode: "deferred", argv: null, runsAt: pushOrStatic(stage) };
  }
  if (scoped === "skip-empty") {
    return { mode: "skipped", argv: null, runsAt: null };
  }
  return { mode: "scoped", argv: scoped, runsAt: null };
}

/** The tier a deferred stage runs at — the lowest non-changed tier it belongs to (for the notice). */
function pushOrStatic(stage: StageDef): string {
  for (const t of ["static", "push", "full"] as const) {
    if (stage.tiers.includes(t)) {
      return `verify --${t}`;
    }
  }
  return "verify --full";
}

function logPathFor(stageName: string): string {
  return join("reports", "verify", `${stageName.replace(/:/gu, "-")}.log`);
}

// A whole-scope stage runs `pnpm <script>` (pnpm resolves the workspace bin). A scoped stage invokes a
// bin DIRECTLY (biome/eslint/tsc/depcruise/vitest/tsx) — with shell:false those aren't on PATH, so resolve
// them against node_modules/.bin (the check/file.ts idiom). `pnpm`/`node` stay as-is (PATH-resolved).
const PATH_RESOLVED = new Set(["pnpm", "node"]);

function resolveBin(root: string, cmd: string): string {
  return PATH_RESOLVED.has(cmd) ? cmd : join(root, "node_modules", ".bin", cmd);
}

const EXCERPT_LINES = 8; // failure excerpt: the last N non-blank output lines (where tools print the verdict).

/** The tail of a failed stage's output — the last few non-blank lines, where tsc/biome/vitest/playwright
 *  print their error summary. Lands in reports/verify.json + the tail console block so a bot never has to
 *  open the per-stage log to learn WHY a stage failed. */
function failureExcerpt(output: string): string {
  const lines = output.split("\n").filter((l) => l.trim().length > 0);
  return lines.slice(-EXCERPT_LINES).join("\n");
}

function runOneStage(
  root: string,
  stage: StageDef,
  selection: Selection | undefined,
  verbose: boolean,
): StageResult {
  const plan = planStage(stage, selection);
  if (plan.mode === "deferred" || plan.mode === "skipped") {
    return {
      name: stage.name,
      group: stage.group,
      mode: plan.mode,
      ok: true, // a deferred/skipped stage is not a failure — it just didn't run here
      exitCode: EXIT_CLEAN,
      durationMs: 0,
      logFile: null,
      failureExcerpt: null,
      runsAt: plan.runsAt,
    };
  }
  const argv = plan.argv as readonly [string, ...string[]];
  const header = `\n=== ${stage.name} (${argv.join(" ")})${plan.mode === "scoped" ? " [scoped]" : ""} ===\n`;
  // Compact mode (default): the full stage output goes to the per-stage log + json ONLY — the console stays
  // short enough to survive any head/tail. Verbose (TTY / --verbose): stream the header + output live.
  if (verbose) {
    process.stdout.write(header);
  }

  const start = Date.now();
  const [cmd, ...args] = argv;
  // biome-ignore lint/style/noProcessEnv: NO_COLOR passthrough to children — greppable plain output, not config.
  const env = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", ...stage.env };
  const result = spawnSync(resolveBin(root, cmd), args, {
    cwd: root,
    shell: false,
    encoding: "utf8",
    env,
  });
  const durationMs = Date.now() - start;

  const body = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (verbose) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
  }
  const logFile = logPathFor(stage.name);
  writeFileSync(join(root, logFile), `${header}${body}`);

  const exitCode = stage.classify(result.status);
  const ok = exitCode === EXIT_CLEAN;
  const line = stageLine({
    name: stage.name,
    group: stage.group,
    mode: plan.mode,
    ok,
    exitCode,
    durationMs,
    logFile,
    failureExcerpt: null,
    runsAt: null,
  });
  // In compact mode, emit the per-stage ✓/✗ line the instant the stage finishes — the reader watches
  // progress accrue without the full output. (Verbose already streamed it; the summary block repeats it.)
  if (!verbose) {
    process.stdout.write(`${line}\n`);
  }
  return {
    name: stage.name,
    group: stage.group,
    mode: plan.mode,
    ok,
    exitCode,
    durationMs,
    logFile,
    failureExcerpt: ok ? null : failureExcerpt(body),
    runsAt: null,
  };
}

function writeReport(root: string, report: VerifyReport): void {
  writeFileSync(join(root, "reports", "verify.json"), `${JSON.stringify(report, null, 2)}\n`);
}

function stageMark(r: StageResult): string {
  if (r.mode === "deferred") {
    return "→";
  }
  if (r.mode === "skipped") {
    return "·";
  }
  if (r.ok) {
    return "✓";
  }
  return r.exitCode === EXIT_TOOL_ERROR ? "‼" : "✗";
}

function stageLine(r: StageResult): string {
  if (r.mode === "deferred") {
    return `${stageMark(r)} ${r.name}  deferred (whole-only at this scope) — runs at ${r.runsAt}`;
  }
  if (r.mode === "skipped") {
    return `${stageMark(r)} ${r.name}  skipped (no files in scope)`;
  }
  const scope = r.mode === "scoped" ? " scoped" : "";
  const tag = !r.ok && r.exitCode === EXIT_TOOL_ERROR ? " [tool-error]" : "";
  return `${stageMark(r)} ${r.name} (${r.durationMs}ms)${scope}${tag}`;
}

const FAIL_KIND: Readonly<Record<number, string>> = {
  [EXIT_TOOL_ERROR]: "TOOL-ERROR",
  [EXIT_MISUSE]: "REFUSED (strict-scope)",
  [EXIT_VIOLATIONS]: "violations",
};

/** A one-line failure reason for a stage — the classifier verdict + its log path, for the tail block. */
function failReason(r: StageResult): string {
  const kind = FAIL_KIND[r.exitCode] ?? "violations";
  const where = r.logFile ?? "(no log — did not run)";
  return `  ✗ ${r.name} — ${kind} · ${where}`;
}

/** The TAIL block — the load-bearing truncation-robust output. A reader who sees ONLY the last ~15 lines
 *  MUST be able to determine PASS/FAIL, which stages failed, and that reports/verify.json is authoritative.
 *  The verdict + pointer print on BOTH pass and fail; on fail, every failing stage names its log inline. */
function printSummary(report: VerifyReport): void {
  process.stdout.write(`\n=== verify summary (tier: ${report.tier}, scope: ${report.scope}) ===\n`);
  for (const r of report.stages) {
    process.stdout.write(`${stageLine(r)}\n`);
  }
  const failed = report.stages.filter((s) => !s.ok);
  process.stdout.write("\n════════════════════════════════════════════════════════════════════\n");
  if (report.ok) {
    process.stdout.write("[verify] VERDICT: PASS (exit 0) — all stages clean\n");
  } else {
    process.stdout.write(
      `[verify] VERDICT: FAIL (exit ${report.exitCode}) — ${failed.length} stage(s) failed:\n`,
    );
    for (const r of failed) {
      process.stdout.write(`${failReason(r)}\n`);
    }
  }
  // The pointer is printed on BOTH pass and fail — a tailing reader always lands on where to read next.
  process.stdout.write(
    "[verify] AUTHORITATIVE RESULT → reports/verify.json · per-stage logs → reports/verify/<stage>.log\n",
  );
  process.stdout.write("════════════════════════════════════════════════════════════════════\n");
}

function printList(): void {
  process.stdout.write("verify — the stage registry (tiers · scope):\n\n");
  for (const t of ["changed", "static", "push", "full"] as const) {
    process.stdout.write(`  ${t}:\n`);
    for (const s of stagesForTier(t)) {
      const scoped = s.scopedArgv === undefined ? "whole-only" : "scopable";
      process.stdout.write(`    · ${s.name.padEnd(NAME_PAD)} [${s.group}] ${scoped}\n`);
    }
  }
  process.stdout.write("\n  manual (never auto-run):\n");
  for (const s of manualStages()) {
    process.stdout.write(
      `    · ${s.name.padEnd(NAME_PAD)} — ${s.manualReason ?? "(no reason given)"}\n`,
    );
  }
}

/** The HEAD banner — printed before any stage runs, so a reader who sees ONLY the first ~15 lines learns
 *  (a) a verify run is in progress + its tier/scope, and (b) that the authoritative result is
 *  reports/verify.json + reports/verify/<stage>.log. The verdict itself lands in the TAIL block. */
function printHeadBanner(tier: Tier, scope: string): void {
  process.stdout.write(
    [
      "════════════════════════════════════════════════════════════════════",
      `[verify] RUNNING · tier=${tier} · scope=${scope}`,
      "[verify] AUTHORITATIVE RESULT → reports/verify.json (read this file — it has the verdict,",
      "[verify]   per-stage status, and a failure excerpt) · per-stage logs → reports/verify/<stage>.log",
      "[verify] verdict + failing stages are repeated at the TAIL of this output.",
      "════════════════════════════════════════════════════════════════════",
      "",
    ].join("\n"),
  );
}

function runTier(root: string, parsed: Parsed): VerifyReport {
  mkdirSync(join(root, "reports", "verify"), { recursive: true });
  printHeadBanner(parsed.tier, parsed.selection?.label ?? "whole");

  const stages = stagesForTier(parsed.tier);
  const results: StageResult[] = [];
  for (const stage of stages) {
    const plan = planStage(stage, parsed.selection);
    // --strict-scope: a whole-only stage under a scoped tier is a REFUSAL (misuse), not a deferral.
    if (parsed.strictScope && plan.mode === "deferred") {
      results.push({
        name: stage.name,
        group: stage.group,
        mode: "deferred",
        ok: false,
        exitCode: EXIT_MISUSE,
        durationMs: 0,
        logFile: null,
        failureExcerpt: null,
        runsAt: plan.runsAt,
      });
      continue;
    }
    results.push(runOneStage(root, stage, parsed.selection, parsed.verbose));
  }

  const exitCode = aggregateExit(results.map((s) => s.exitCode));
  return {
    tier: parsed.tier,
    scope: parsed.selection?.label ?? "whole",
    ok: exitCode === EXIT_CLEAN,
    exitCode,
    failed: results.filter((s) => !s.ok).length,
    stages: results,
  };
}

function main(): void {
  const argv = process.argv.slice(ARGV_START);
  const parsed = parse(argv);
  if ("error" in parsed) {
    process.stderr.write(`verify: ${parsed.error}\n`);
    process.exit(EXIT_MISUSE);
  }
  if (parsed.list) {
    printList();
    return;
  }
  const root = process.cwd();
  const report = runTier(root, parsed);
  writeReport(root, report);
  printSummary(report);
  if (parsed.json) {
    process.stdout.write(`${JSON.stringify(report)}\n`);
  }
  if (report.exitCode !== EXIT_CLEAN) {
    process.exit(report.exitCode);
  }
}

// Direct-run guard (the report.ts/run.ts idiom): an import (the unit test) gets only the exported pure
// helpers; running the file spawns the tier.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main();
}
