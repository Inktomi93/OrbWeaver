// `pnpm verify` — the ONE verification entry (UNIFIED-VERIFICATION-DESIGN.md §3). A direct generalization
// of scripts/check/run.ts (same proven bones: sequential spawn, stream + tee, JSON artifact, max-severity
// exit) over the self-describing stage REGISTRY. Four tiers, one scope convention, one exit contract, one
// summary/artifact.
//
//   pnpm verify              → --static  (today's `pnpm check`, byte-compatible)
//   pnpm verify --changed    → the inner loop (scoped, related tests)
//   pnpm verify --static     → the pre-commit bundle (= `pnpm check`)
//   pnpm verify --push       → static + node tests + CT + e2e-smoke (the pre-push bar)
//   pnpm verify --full       → push + cpd + full e2e + parity + mutation-gate
//   pnpm verify --list       → print every registry row (incl. manual) with its tiers/reason
//   pnpm verify --json       → mirror reports/verify.json to stdout
//   pnpm verify --file <p…>  → scoped to explicit paths (the check:file muscle memory)
//   pnpm verify --package <n> / --scope <glob>  → package / folder scope
//   pnpm verify --strict-scope  → a whole-only stage at a scoped tier REFUSES (exit 3) instead of deferring
//
// EXIT CONTRACT (§3.3): 0 clean · 1 violations · 2 tool error · 3 misuse. Run exit = max severity over
// stages (2 > 3 > 1 > 0). A whole-only stage the scope can't run is DEFERRED with a printed + recorded
// notice — a scoped green is visibly a scoped green — unless --strict-scope makes it a refusal.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
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
  /** For a deferred stage: the tier where it DOES run (so a scoped green names what it skipped). */
  readonly runsAt: string | null;
};

type VerifyReport = {
  readonly tier: Tier;
  readonly scope: string;
  readonly ok: boolean;
  readonly exitCode: number;
  readonly stages: readonly StageResult[];
};

// ── argv parsing ────────────────────────────────────────────────────────────────────────────────────
type Parsed = {
  readonly tier: Tier;
  readonly selection: Selection | undefined; // undefined = whole scope
  readonly strictScope: boolean;
  readonly list: boolean;
  readonly json: boolean;
};

const TIER_FLAGS: Readonly<Record<string, Tier>> = {
  "--changed": "changed",
  "--static": "static",
  "--push": "push",
  "--full": "full",
};

/** Values after a flag that aren't themselves flags (explicit paths for --file/--changed). */
function positionalsAfter(argv: readonly string[], flag: string): readonly string[] {
  const i = argv.indexOf(flag);
  if (i === -1) {
    return [];
  }
  return argv.slice(i + 1).filter((a) => !a.startsWith("--"));
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  const v = i === -1 ? undefined : argv[i + 1];
  // A `--`-prefixed token is the NEXT flag, not this flag's value (e.g. `--package --json`).
  return v === undefined || v.startsWith("--") ? undefined : v;
}

const ARGV_START = 2; // process.argv[0]=node, [1]=script, actual args start at 2.

/** No scope flag → whole scope. A distinct sentinel (not `undefined`) so the resolver stays total. */
const WHOLE_SCOPE = { none: true } as const;
type ScopeResult = SelectionRequest | typeof WHOLE_SCOPE | { readonly error: string };

/** Resolve the ONE scope request from the flags, WHOLE_SCOPE for none, or an error string. */
function scopeRequest(argv: readonly string[]): ScopeResult {
  const hasFile = argv.includes("--file");
  const hasChanged = argv.includes("--changed");
  const hasPkg = argv.includes("--package");
  const hasScope = argv.includes("--scope");
  const pkg = flagValue(argv, "--package");
  const scope = flagValue(argv, "--scope");
  const selectors = [hasFile, hasChanged, hasPkg, hasScope].filter(Boolean).length;
  if (selectors === 0) {
    return WHOLE_SCOPE;
  }
  if (selectors > 1) {
    return { error: "at most one of --changed / --file / --package / --scope" };
  }
  if (hasFile) {
    const paths = positionalsAfter(argv, "--file");
    if (paths.length === 0) {
      return { error: "--file needs at least one path" };
    }
    const bad = badPaths(paths);
    if (bad.length > 0) {
      return { error: `not under the repo or nonexistent: ${bad.join(", ")}` };
    }
    return { kind: "file", paths };
  }
  if (hasChanged) {
    return { kind: "changed", paths: positionalsAfter(argv, "--changed") };
  }
  if (hasPkg) {
    return pkg === undefined || pkg.length === 0
      ? { error: "--package needs a name" }
      : { kind: "package", name: pkg };
  }
  return scope === undefined || scope.length === 0
    ? { error: "--scope needs a folder glob" }
    : { kind: "scope", glob: scope };
}

/** The tier for a run: an explicit --tier flag wins; else a scope flag implies `changed`; else `static`. */
function tierFor(argv: readonly string[], scoped: boolean): Tier {
  for (const [flag, tier] of Object.entries(TIER_FLAGS)) {
    if (argv.includes(flag)) {
      return tier;
    }
  }
  return scoped ? "changed" : "static";
}

function parse(argv: readonly string[]): Parsed | { readonly error: string } {
  const list = argv.includes("--list");
  const json = argv.includes("--json");
  const strictScope = argv.includes("--strict-scope");
  const req = scopeRequest(argv);
  if ("error" in req) {
    return { error: req.error };
  }
  if ("none" in req) {
    return { tier: tierFor(argv, false), selection: undefined, strictScope, list, json };
  }
  return { tier: tierFor(argv, true), selection: resolveSelection(req), strictScope, list, json };
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

function runOneStage(root: string, stage: StageDef, selection: Selection | undefined): StageResult {
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
      runsAt: plan.runsAt,
    };
  }
  const argv = plan.argv as readonly [string, ...string[]];
  const header = `\n=== ${stage.name} (${argv.join(" ")})${plan.mode === "scoped" ? " [scoped]" : ""} ===\n`;
  process.stdout.write(header);

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

  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  const logFile = logPathFor(stage.name);
  writeFileSync(join(root, logFile), `${header}${result.stdout ?? ""}${result.stderr ?? ""}`);

  const exitCode = stage.classify(result.status);
  return {
    name: stage.name,
    group: stage.group,
    mode: plan.mode,
    ok: exitCode === EXIT_CLEAN,
    exitCode,
    durationMs,
    logFile,
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

function printSummary(report: VerifyReport): void {
  process.stdout.write(`\n=== verify summary (tier: ${report.tier}, scope: ${report.scope}) ===\n`);
  for (const r of report.stages) {
    process.stdout.write(`${stageLine(r)}\n`);
  }
  const failed = report.stages.filter((s) => !s.ok);
  if (report.ok) {
    process.stdout.write("\nverify: PASS (0) — all stages clean\n");
  } else {
    const logs = failed
      .filter((s) => s.logFile !== null)
      .map((s) => s.logFile)
      .join(" · ");
    process.stdout.write(
      `\nverify: FAIL (${report.exitCode}) — ${failed.map((s) => s.name).join(", ")}${logs ? ` · detail: ${logs}` : ""} · json: reports/verify.json\n`,
    );
  }
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

function runTier(root: string, parsed: Parsed): VerifyReport {
  mkdirSync(join(root, "reports", "verify"), { recursive: true });
  process.stdout.write(
    `[verify] tier=${parsed.tier} scope=${parsed.selection?.label ?? "whole"} · logs → reports/verify/<stage>.log · json → reports/verify.json\n`,
  );

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
        runsAt: plan.runsAt,
      });
      continue;
    }
    results.push(runOneStage(root, stage, parsed.selection));
  }

  const exitCode = aggregateExit(results.map((s) => s.exitCode));
  return {
    tier: parsed.tier,
    scope: parsed.selection?.label ?? "whole",
    ok: exitCode === EXIT_CLEAN,
    exitCode,
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
