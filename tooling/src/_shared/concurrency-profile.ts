// Capacity policy lives in the committed JSON: per-profile CEILINGS plus the measured cost of one unit of
// each kind of work. The door derives every cap from the machine it runs on and never past its ceiling, so
// a big box keeps the committed numbers and a small one scales down. ORB_DEDICATED_BOX is shell env only.
import { readFileSync } from "node:fs";
import { availableParallelism, totalmem } from "node:os";
import process from "node:process";
import { processEnvValue } from "./process-env.ts";

/** The committed data file — exported so the tests and every reader agree on one path. */
export const CONCURRENCY_PROFILE_PATH = new URL("../../concurrency-profile.json", import.meta.url);

/** The one env switch. Spelled ONCE; every reader names this same variable. */
export const DEDICATED_BOX_ENV = "ORB_DEDICATED_BOX";

/** The closed set of profiles. Named here so a reader can enumerate them without opening the JSON. */
export const CONCURRENCY_PROFILE_NAMES = ["shared", "dedicated"] as const;
export type ConcurrencyProfileName = (typeof CONCURRENCY_PROFILE_NAMES)[number];

/** Caps priced per UNIT of work: a worker, a checker, a pool slot. Each names its unit in {@link UNIT_OF}. */
export const UNIT_PRICED_CAPS = [
  "vitestMaxWorkers",
  "ctWorkers",
  "ts7Checkers",
  "eslintConcurrency",
  "strykerConcurrency",
  "cpdWorkers",
  "hookPoolSlots",
  "hookTs7Checkers",
] as const;
export type UnitPricedCap = (typeof UNIT_PRICED_CAPS)[number];

/** Caps priced per whole RUN of another cap: N programs, N CT runners, N whole-program typechecks. */
export const RUN_PRICED_CAPS = ["pnpmWorkspaceConcurrency", "ctRunnersHostWide", "ts7RunnersHostWide"] as const;
export type RunPricedCap = (typeof RUN_PRICED_CAPS)[number];

export type DerivedCap = UnitPricedCap | RunPricedCap;

/** The measured kinds of work. The JSON's `unitCosts` row carries one cost per name. */
export const UNIT_COST_NAMES = ["vitestWorker", "ctWorker", "ts7Checker", "eslintWorker", "cpdWorker", "hookLeg"] as const;
export type UnitCostName = (typeof UNIT_COST_NAMES)[number];

/** One unit's measured cost: the cores it keeps busy, the resident memory it adds, and the resident memory
 *  the run carries before its first unit (the launcher, the loaded program). A zero field sets no bound. */
export interface UnitCost {
  readonly cores: number;
  readonly memoryMiB: number;
  readonly baseMemoryMiB: number;
}
export type UnitCosts = Readonly<Record<UnitCostName, UnitCost>>;

/** The machine a cap is derived for. Explicit, so a test never depends on the host it runs on. */
export interface Machine {
  readonly cores: number;
  readonly memoryMiB: number;
}

/** Which unit prices each unit cap. Stryker's worker pool is Vitest runner processes. */
const UNIT_OF: Readonly<Record<UnitPricedCap, UnitCostName>> = {
  vitestMaxWorkers: "vitestWorker",
  strykerConcurrency: "vitestWorker",
  ctWorkers: "ctWorker",
  ts7Checkers: "ts7Checker",
  hookTs7Checkers: "ts7Checker",
  eslintConcurrency: "eslintWorker",
  cpdWorkers: "cpdWorker",
  hookPoolSlots: "hookLeg",
};

/** Which cap sizes one run of each run cap, and whether that run's cores bound the count. A whole-program
 *  typecheck past the core count only time-slices, while its memory is additive and an overrun is an OOM
 *  kill, so the two ts7 run caps are bounded by memory alone. */
const RUN_OF: Readonly<Record<RunPricedCap, { readonly of: UnitPricedCap; readonly coreBound: boolean }>> = {
  pnpmWorkspaceConcurrency: { of: "ts7Checkers", coreBound: false },
  ts7RunnersHostWide: { of: "ts7Checkers", coreBound: false },
  ctRunnersHostWide: { of: "ctWorkers", coreBound: true },
};

/** One profile's caps as a reader applies them. Every field has a reader:
 *  · `vitestMaxWorkers`        → vitest.config.ts `maxWorkers` (a CLI `--maxWorkers` still overrides)
 *  · `ctWorkers`               → playwright-ct.config.ts `workers` (a CLI `--workers` still overrides)
 *  · `ts7Checkers`             → scripts/ts7.ts injects `--checkers` when the caller named none
 *  · `pnpmWorkspaceConcurrency`→ verify/ops/typecheck.ts's native-program execution pool
 *  · `eslintConcurrency`       → scripts/eslint.ts `--concurrency` (ESLint's own default is `off`, i.e.
 *                                SINGLE-THREADED — the one cap here that RAISES parallelism)
 *  · `strykerConcurrency`      → the shared Stryker config factory's worker-process pool
 *  · `cpdWorkers`              → scripts/cpd.ts `--workers` (jscpd's auto default uses every core)
 *  · `hookPoolSlots`           → the edit hook's host-wide pool, shared by its file-scoped legs
 *  · `hookTs7Checkers`         → the `--checkers` the edit hook's whole-program ts7 leg passes (smaller than
 *                                `ts7Checkers`: it fires on every edit, beside whatever else is running)
 *  · `ctRunnersHostWide`       → verify/lib/ct-runner-lock.ts's host slot pool
 *  · `ts7RunnersHostWide`      → scripts/ts7.ts's host slot pool: whole-program typechecks on this box at once
 *  · `stageCap`                → snap's live-stage cap, the BASE `resolveStageLimits` starts from
 *                                (`ORB_STAGE_CAP` still overrides it). Committed, not derived: no stage cost
 *                                has been measured.
 *  · `wholeVerifyQueue`        → verify/ops/run.ts's host-wide whole-run queue */
export interface ConcurrencyProfile extends Readonly<Record<DerivedCap, number>> {
  readonly name: ConcurrencyProfileName;
  readonly stageCap: number;
  readonly wholeVerifyQueue: boolean;
}

/** One committed profile row: its caps are CEILINGS, and `machineShare` is the fraction of the machine's
 *  cores and memory the profile's work may size itself to. */
export interface ProfileCeilings extends ConcurrencyProfile {
  readonly machineShare: number;
}

/** PURE + TOTAL: which profile does this raw env value name?
 *
 *  IT THROWS on a value it does not recognise, and that is deliberate. The alternative — treat anything
 *  unrecognised as `shared` — makes `ORB_DEDICATED_BOX=true` and `ORB_DEDICATED_BOX=yes` silently do
 *  NOTHING on a box the operator believes they just unlocked, and the only symptom is a slow run. A dev
 *  knob that fails silently is worse than one that fails; this one names itself and the two legal values. */
export function profileNameFor(raw: string | undefined): ConcurrencyProfileName {
  const value = (raw ?? "").trim();
  if (value === "" || value === "0") {
    return "shared";
  }
  if (value === "1") {
    return "dedicated";
  }
  throw new Error(
    `${DEDICATED_BOX_ENV}="${raw ?? ""}" is not a box profile switch — set it to "1" (this machine is YOURS ALONE) or leave it unset/"0" (the shared-host default). ` +
      "It is read from the SHELL ENVIRONMENT; the repo .env is never read by tooling.",
  );
}

/** PURE + TOTAL: one positive integer, or the refusal naming it. */
function intField(row: Record<string, unknown>, where: string, field: string): number {
  const value = row[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return refuse(`${where} field "${field}" is ${JSON.stringify(value)} — expected a positive integer`);
  }
  return value;
}

/** PURE + TOTAL: one finite number at or above zero, or the refusal naming it. */
function costField(row: Record<string, unknown>, where: string, field: keyof UnitCost): number {
  const value = row[field];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return refuse(`${where} field "${field}" is ${JSON.stringify(value)} — expected a non-negative number`);
  }
  return value;
}

function objectAt(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return refuse(what);
  }
  return value as Record<string, unknown>;
}

function parseFile(body: string): Record<string, unknown> {
  let file: unknown;
  // The catch RE-RAISES immediately as `refuse(...)`: it exists only to replace JSON.parse's positional
  // message with one that names the file and its role. Nothing is swallowed.
  try {
    file = JSON.parse(body);
  } catch {
    return refuse("is not valid JSON");
  }
  return objectAt(file, "is not a JSON object");
}

/** Read + validate one profile's ceilings. Every field is named EXACTLY ONCE below, so a field added to
 *  {@link ConcurrencyProfile} is a compile error here until it is read and validated. */
function ceilingsFrom(file: Record<string, unknown>, name: ConcurrencyProfileName): ProfileCeilings {
  const profiles = file["profiles"];
  const row = objectAt(
    typeof profiles === "object" && profiles !== null ? (profiles as Record<string, unknown>)[name] : undefined,
    `has no "${name}" profile object`,
  );
  const where = `profile "${name}"`;
  const share = row["machineShare"];
  const queue = row["wholeVerifyQueue"];
  if (typeof share !== "number" || !Number.isFinite(share) || share <= 0 || share > 1) {
    return refuse(`${where} field "machineShare" is ${JSON.stringify(share)} — expected a fraction above 0 and at most 1`);
  }
  if (typeof queue !== "boolean") {
    return refuse(`${where} field "wholeVerifyQueue" is ${JSON.stringify(queue)} — expected a boolean`);
  }
  return {
    name,
    machineShare: share,
    vitestMaxWorkers: intField(row, where, "vitestMaxWorkers"),
    ctWorkers: intField(row, where, "ctWorkers"),
    ts7Checkers: intField(row, where, "ts7Checkers"),
    pnpmWorkspaceConcurrency: intField(row, where, "pnpmWorkspaceConcurrency"),
    eslintConcurrency: intField(row, where, "eslintConcurrency"),
    strykerConcurrency: intField(row, where, "strykerConcurrency"),
    cpdWorkers: intField(row, where, "cpdWorkers"),
    hookPoolSlots: intField(row, where, "hookPoolSlots"),
    hookTs7Checkers: intField(row, where, "hookTs7Checkers"),
    ctRunnersHostWide: intField(row, where, "ctRunnersHostWide"),
    ts7RunnersHostWide: intField(row, where, "ts7RunnersHostWide"),
    stageCap: intField(row, where, "stageCap"),
    wholeVerifyQueue: queue,
  };
}

function unitCostFrom(row: Record<string, unknown>, name: UnitCostName): UnitCost {
  const where = `"unitCosts.${name}"`;
  const unit = objectAt(row[name], `has no ${where} object`);
  const cost = {
    cores: costField(unit, where, "cores"),
    memoryMiB: costField(unit, where, "memoryMiB"),
    baseMemoryMiB: costField(unit, where, "baseMemoryMiB"),
  };
  if (cost.cores === 0 && cost.memoryMiB === 0) {
    return refuse(`${where} prices neither cores nor memory — a unit that costs nothing derives no cap`);
  }
  return cost;
}

function unitCostsFrom(file: Record<string, unknown>): UnitCosts {
  const row = objectAt(file["unitCosts"], 'has no "unitCosts" object');
  return {
    vitestWorker: unitCostFrom(row, "vitestWorker"),
    ctWorker: unitCostFrom(row, "ctWorker"),
    ts7Checker: unitCostFrom(row, "ts7Checker"),
    eslintWorker: unitCostFrom(row, "eslintWorker"),
    cpdWorker: unitCostFrom(row, "cpdWorker"),
    hookLeg: unitCostFrom(row, "hookLeg"),
  };
}

function refuse(what: string): never {
  throw new Error(`tooling/concurrency-profile.json ${what}. That file is the ONE home for every worker/slot cap; fix it there, never at a call site.`);
}

/** PURE: parse an already-read file body into one profile's committed CEILINGS. The seam a test drives with
 *  a crafted body; readers want {@link readConcurrencyProfile}, which derives the caps for this machine. */
export function parseConcurrencyProfile(body: string, name: ConcurrencyProfileName): ProfileCeilings {
  return ceilingsFrom(parseFile(body), name);
}

/** PURE: parse the measured unit costs out of an already-read file body. */
export function parseUnitCosts(body: string): UnitCosts {
  return unitCostsFrom(parseFile(body));
}

/** How many units fit: the smallest of the ceiling, the core bound and the memory bound, never below 1.
 *  A unit that prices no cores or no memory sets no bound on that axis. */
function fitUnits(ceiling: number, budget: Machine, unit: { readonly cores: number; readonly memoryMiB: number }): number {
  const byCores = unit.cores > 0 ? Math.floor(budget.cores / unit.cores) : ceiling;
  const byMemory = unit.memoryMiB > 0 ? Math.floor(budget.memoryMiB / unit.memoryMiB) : ceiling;
  return Math.max(1, Math.min(ceiling, byCores, byMemory));
}

/** PURE: the caps this machine affords under one profile.
 *
 *  THE FORMULA. The profile may size itself to `machineShare` of the machine's cores and memory. A unit cap
 *  is `min(ceiling, ⌊share·cores / unit.cores⌋, ⌊(share·memory − unit.baseMemory) / unit.memory⌋)`. A run
 *  cap prices one run of its inner cap at that cap's DERIVED size — `base + n·unit.memory` and `n·unit.cores`
 *  — and fits whole runs into the same share. Every cap is at least 1: a machine too small for one unit
 *  still runs one, because a zero-sized pool never runs at all. */
export function deriveConcurrencyProfile(committed: ProfileCeilings, costs: UnitCosts, machine: Machine): ConcurrencyProfile {
  const share: Machine = { cores: committed.machineShare * machine.cores, memoryMiB: committed.machineShare * machine.memoryMiB };
  const unit = (cap: UnitPricedCap): number => {
    const cost = costs[UNIT_OF[cap]];
    return fitUnits(committed[cap], { cores: share.cores, memoryMiB: share.memoryMiB - cost.baseMemoryMiB }, cost);
  };
  const units: Readonly<Record<UnitPricedCap, number>> = {
    vitestMaxWorkers: unit("vitestMaxWorkers"),
    ctWorkers: unit("ctWorkers"),
    ts7Checkers: unit("ts7Checkers"),
    eslintConcurrency: unit("eslintConcurrency"),
    strykerConcurrency: unit("strykerConcurrency"),
    cpdWorkers: unit("cpdWorkers"),
    hookPoolSlots: unit("hookPoolSlots"),
    hookTs7Checkers: unit("hookTs7Checkers"),
  };
  const run = (cap: RunPricedCap): number => {
    const { of, coreBound } = RUN_OF[cap];
    const cost = costs[UNIT_OF[of]];
    const size = units[of];
    return fitUnits(committed[cap], share, { cores: coreBound ? size * cost.cores : 0, memoryMiB: cost.baseMemoryMiB + size * cost.memoryMiB });
  };
  return {
    name: committed.name,
    ...units,
    pnpmWorkspaceConcurrency: run("pnpmWorkspaceConcurrency"),
    ctRunnersHostWide: run("ctRunnersHostWide"),
    ts7RunnersHostWide: run("ts7RunnersHostWide"),
    stageCap: committed.stageCap,
    wholeVerifyQueue: committed.wholeVerifyQueue,
  };
}

const BYTES_PER_MIB = 1_048_576;

/** The machine this process runs on. Cores are what the scheduler lets this process use; memory is the
 *  cgroup (or other OS) limit where one exists, else the physical total. */
export function readMachine(): Machine {
  const total = totalmem();
  const constrained = process.constrainedMemory();
  const bytes = constrained > 0 ? Math.min(constrained, total) : total;
  return { cores: availableParallelism(), memoryMiB: Math.floor(bytes / BYTES_PER_MIB) };
}

/** THE VERIFY RUNNER'S PER-STAGE HANG CEILINGS, in ms — DERIVED from the caps above, never hand-typed.
 *  Every field answers "past this the stage is WEDGED", not "this stage should be faster":
 *  · `defaultMs`   → every stage without a ceiling of its own
 *  · `ctSuiteMs`   → the whole-CT-suite stage, which is the one that outgrew the constant
 *  · `ctHostWaitMs`→ how long a CT run may queue for a host-wide slot (ct-runner-lock.ts reads it too, so
 *                    the wait a run may spend and the ceiling that must cover it cannot drift apart).
 *  · `ts7HostWaitMs` → how long a whole-program typecheck may queue for a host-wide ts7 slot before the head
 *                    of the queue runs as an overflow run (scripts/ts7.ts).
 *  · `mutationGateMs` → the Stryker mutation stage: a whole-corpus mutant run is measured in HOURS, not
 *                    minutes; owner-ruled ~2 h. */
export interface StageBudgets {
  readonly defaultMs: number;
  readonly ctSuiteMs: number;
  readonly ctHostWaitMs: number;
  readonly ts7HostWaitMs: number;
  readonly mutationGateMs: number;
}

const MS_PER_MINUTE = 60_000;

/** PURE + TOTAL: one positive finite number out of the budget row, or the refusal naming the field. Same
 *  posture as `intField` — no default, no coercion. A budget is allowed to be fractional (the CT ceiling
 *  factor is 1.5), which is the only reason this is not `intField`. */
function positiveField(row: Record<string, unknown>, field: string): number {
  const value = row[field];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return refuse(`"stageBudgets" field "${field}" is ${JSON.stringify(value)} — expected a positive number`);
  }
  return value;
}

/** PURE: the ceilings implied by one profile's caps and the committed budget row.
 *
 *  THE CT DERIVATION, spelled out because a reader will otherwise think it is arbitrary: the suite costs a
 *  measured number of WORKER-minutes, so its wall clock is that divided by the workers actually running;
 *  the factor is the slack a HANG detector needs over an honest run (a contended box, a retry pass); and
 *  the host-slot wait is added because a queued run spends it INSIDE the stage's wall clock. The default
 *  is a FLOOR, so shrinking the suite can never leave a stage with a ceiling under 45 minutes. */
export function stageBudgetsFor(profile: ConcurrencyProfile, body: string): StageBudgets {
  const budgets = objectAt(parseFile(body)["stageBudgets"], 'has no "stageBudgets" object');
  const defaultMinutes = positiveField(budgets, "defaultMinutes");
  const hostWaitMinutes = positiveField(budgets, "ctHostSlotWaitMinutes");
  const ctMinutes =
    Math.ceil((positiveField(budgets, "ctSuiteWorkerMinutes") / Math.max(1, profile.ctWorkers)) * positiveField(budgets, "ctCeilingFactor")) + hostWaitMinutes;
  return {
    defaultMs: defaultMinutes * MS_PER_MINUTE,
    ctSuiteMs: Math.max(defaultMinutes, ctMinutes) * MS_PER_MINUTE,
    ctHostWaitMs: hostWaitMinutes * MS_PER_MINUTE,
    ts7HostWaitMs: positiveField(budgets, "ts7HostSlotWaitMinutes") * MS_PER_MINUTE,
    mutationGateMs: Math.max(defaultMinutes, positiveField(budgets, "mutationGateMinutes")) * MS_PER_MINUTE,
  };
}

/** PURE: the derived profile for an already-read body, a switch value and a machine. */
function profileFromBody(body: string, switchValue: string | undefined, machine: Machine): ConcurrencyProfile {
  return deriveConcurrencyProfile(parseConcurrencyProfile(body, profileNameFor(switchValue)), parseUnitCosts(body), machine);
}

// The ambient read goes through `process-env.ts`'s `processEnvValue` — this directory's ONE door for an
// ambient tooling/test protocol value — rather than growing a second `process.env` policy site here.
function switchFrom(env: NodeJS.ProcessEnv | undefined): string | undefined {
  return env === undefined ? processEnvValue(DEDICATED_BOX_ENV) : env[DEDICATED_BOX_ENV];
}

/** THE BUDGET DOOR — the ceilings for the profile in force on this machine. One file read. */
export function readStageBudgets(env?: NodeJS.ProcessEnv, machine: Machine = readMachine()): StageBudgets {
  const body = readFileSync(CONCURRENCY_PROFILE_PATH, "utf8");
  return stageBudgetsFor(profileFromBody(body, switchFrom(env), machine), body);
}

/** THE DOOR. The caps in force for this process: the committed ceilings, selected by the shell env and
 *  derived for this machine.
 *
 *  Read at every call rather than memoized at module load — a config reads it once, but a long-lived tool
 *  spawning children may want the switch its caller set, and the file is a few hundred bytes. */
export function readConcurrencyProfile(env?: NodeJS.ProcessEnv, machine: Machine = readMachine()): ConcurrencyProfile {
  return profileFromBody(readFileSync(CONCURRENCY_PROFILE_PATH, "utf8"), switchFrom(env), machine);
}
