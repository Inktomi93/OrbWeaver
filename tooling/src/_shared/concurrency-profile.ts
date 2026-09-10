// Capacity policy lives in the committed JSON. TypeScript and CommonJS callers share this validated
// reader; Bash hooks consume the same data through their documented fail-soft protocol.
// ORB_DEDICATED_BOX comes from the shell environment, never the repository .env file.
// Judging functions take explicit values; the public readers load the file and shell switch.
import { readFileSync } from "node:fs";
import { processEnvValue } from "./process-env.ts";

/** The committed data file — exported so the tests and the two bash readers agree on one path. */
export const CONCURRENCY_PROFILE_PATH = new URL("../../concurrency-profile.json", import.meta.url);

/** The one env switch. Spelled ONCE; every reader (bash, cjs, ts) names this same variable. */
export const DEDICATED_BOX_ENV = "ORB_DEDICATED_BOX";

/** The closed set of profiles. Named here so a reader can enumerate them without opening the JSON. */
export const CONCURRENCY_PROFILE_NAMES = ["shared", "dedicated"] as const;
export type ConcurrencyProfileName = (typeof CONCURRENCY_PROFILE_NAMES)[number];

/** One profile's caps. Every field is a CAP a specific reader applies — no field exists without a reader:
 *  · `vitestMaxWorkers`        → vitest.config.ts `maxWorkers` (a CLI `--maxWorkers` still overrides)
 *  · `ctWorkers`               → playwright-ct.config.ts `workers` (a CLI `--workers` still overrides)
 *  · `ts7Checkers`             → scripts/ts7.cjs injects `--checkers` when the caller named none
 *  · `pnpmWorkspaceConcurrency`→ verify/ops/typecheck.ts's native-program execution pool
 *  · `eslintConcurrency`       → scripts/eslint.cjs `--concurrency` (ESLint's own default is `off`, i.e.
 *                                SINGLE-THREADED — the one cap here that RAISES parallelism)
 *  · `strykerConcurrency`      → the shared Stryker config factory's worker-process pool
 *  · `cpdWorkers`              → scripts/cpd.ts `--workers` (jscpd's auto default uses every core)
 *  · `hookPoolSlots`           → .claude/hooks/biome-check.sh's HOST-WIDE flock pool, shared by its
 *                                file-scoped legs (biome + dep-cruiser)
 *  · `hookTs7Checkers`         → the `--checkers` that hook's WHOLE-PROGRAM ts7 leg passes (smaller than
 *                                `ts7Checkers`: it fires on every edit, beside whatever else is running)
 *  · `ctRunnersHostWide`       → tooling/src/verify/lib/ct-runner-lock.ts's host slot pool
 *  · `stageCap`                → snap's live-stage cap, the BASE `resolveStageLimits` starts from (#1848;
 *                                `ORB_STAGE_CAP` still overrides it, which is why this is a base and not
 *                                the answer). It was a hard-coded 3 in lib/stage-bands.ts while every
 *                                other cap moved here in #1835 — so `ORB_DEDICATED_BOX=1` retuned the
 *                                workers and left the stages alone.
 *  · `sessionCpuQuotaPct`      → .claude/hooks/cpu-fence.sh `CPUQuota=` (0 = set no ceiling)
 *  · `sessionMemoryHigh`       → .claude/hooks/cpu-fence.sh `MemoryHigh=` ("" = set no ceiling)
 *  · `wholeVerifyQueue`        → tooling/src/verify/ops/run.ts's host-wide whole-run queue */
export interface ConcurrencyProfile {
  readonly name: ConcurrencyProfileName;
  readonly vitestMaxWorkers: number;
  readonly ctWorkers: number;
  readonly ts7Checkers: number;
  readonly pnpmWorkspaceConcurrency: number;
  readonly eslintConcurrency: number;
  readonly strykerConcurrency: number;
  readonly cpdWorkers: number;
  readonly hookPoolSlots: number;
  readonly hookTs7Checkers: number;
  readonly ctRunnersHostWide: number;
  readonly stageCap: number;
  readonly sessionCpuQuotaPct: number;
  readonly sessionMemoryHigh: string;
  readonly wholeVerifyQueue: boolean;
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

/** PURE + TOTAL: one integer field at or above its floor, or the refusal naming it. Worker/slot caps use
 * the positive default; only `sessionCpuQuotaPct` passes zero because zero explicitly means no ceiling. */
function intField(row: Record<string, unknown>, name: ConcurrencyProfileName, field: keyof ConcurrencyProfile, minimum = 1): number {
  const value = row[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum) {
    const expected = minimum === 0 ? "a non-negative integer" : "a positive integer";
    return refuse(`profile "${name}" field "${field}" is ${JSON.stringify(value)} — expected ${expected}`);
  }
  return value;
}

interface ProfileFile {
  readonly profiles?: Record<string, unknown>;
}

/** Read + validate one profile out of the committed file. Every field is named EXACTLY ONCE below, so a
 *  field added to {@link ConcurrencyProfile} is a compile error here until it is read and validated. */
function profileFrom(file: ProfileFile, name: ConcurrencyProfileName): ConcurrencyProfile {
  const raw: unknown = file.profiles?.[name];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return refuse(`has no "${name}" profile object`);
  }
  const row = raw as Record<string, unknown>;
  const memoryHigh = row["sessionMemoryHigh"];
  const queue = row["wholeVerifyQueue"];
  if (typeof memoryHigh !== "string") {
    return refuse(`profile "${name}" field "sessionMemoryHigh" is ${JSON.stringify(memoryHigh)} — expected a systemd size string ("48G") or "" for no ceiling`);
  }
  if (typeof queue !== "boolean") {
    return refuse(`profile "${name}" field "wholeVerifyQueue" is ${JSON.stringify(queue)} — expected a boolean`);
  }
  return {
    name,
    vitestMaxWorkers: intField(row, name, "vitestMaxWorkers"),
    ctWorkers: intField(row, name, "ctWorkers"),
    ts7Checkers: intField(row, name, "ts7Checkers"),
    pnpmWorkspaceConcurrency: intField(row, name, "pnpmWorkspaceConcurrency"),
    eslintConcurrency: intField(row, name, "eslintConcurrency"),
    strykerConcurrency: intField(row, name, "strykerConcurrency"),
    cpdWorkers: intField(row, name, "cpdWorkers"),
    hookPoolSlots: intField(row, name, "hookPoolSlots"),
    hookTs7Checkers: intField(row, name, "hookTs7Checkers"),
    ctRunnersHostWide: intField(row, name, "ctRunnersHostWide"),
    stageCap: intField(row, name, "stageCap"),
    sessionCpuQuotaPct: intField(row, name, "sessionCpuQuotaPct", 0),
    sessionMemoryHigh: memoryHigh,
    wholeVerifyQueue: queue,
  };
}

function refuse(what: string): never {
  throw new Error(`tooling/concurrency-profile.json ${what}. That file is the ONE home for every worker/slot cap; fix it there, never at a call site.`);
}

/** PURE: parse an already-read file body into one profile. The seam a test drives with a crafted body. */
export function parseConcurrencyProfile(body: string, name: ConcurrencyProfileName): ConcurrencyProfile {
  let file: unknown;
  // The catch RE-RAISES immediately as `refuse(...)`: it exists only to replace JSON.parse's positional
  // message with one that names the file and its role. Nothing is swallowed, so there is no caught failure
  // to own here.
  try {
    file = JSON.parse(body);
  } catch {
    return refuse("is not valid JSON");
  }
  if (typeof file !== "object" || file === null || Array.isArray(file)) {
    return refuse("is not a JSON object");
  }
  return profileFrom(file as ProfileFile, name);
}

/** THE VERIFY RUNNER'S PER-STAGE HANG CEILINGS, in ms — DERIVED from the caps above, never hand-typed
 *  (#1848). Every field answers "past this the stage is WEDGED", not "this stage should be faster":
 *  · `defaultMs`   → every stage without a ceiling of its own
 *  · `ctSuiteMs`   → the whole-CT-suite stage, which is the one that outgrew the constant
 *  · `ctHostWaitMs`→ how long a CT run may queue for a host-wide slot (ct-runner-lock.ts reads it too, so
 *                    the wait a run may spend and the ceiling that must cover it cannot drift apart). */
export interface StageBudgets {
  readonly defaultMs: number;
  readonly ctSuiteMs: number;
  readonly ctHostWaitMs: number;
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
  let file: unknown;
  // Re-raised immediately as `refuse(...)`: same shape as parseConcurrencyProfile — nothing is swallowed.
  try {
    file = JSON.parse(body);
  } catch {
    return refuse("is not valid JSON");
  }
  const row: unknown = typeof file === "object" && file !== null ? (file as Record<string, unknown>)["stageBudgets"] : undefined;
  if (typeof row !== "object" || row === null || Array.isArray(row)) {
    return refuse('has no "stageBudgets" object');
  }
  const budgets = row as Record<string, unknown>;
  const defaultMinutes = positiveField(budgets, "defaultMinutes");
  const hostWaitMinutes = positiveField(budgets, "ctHostSlotWaitMinutes");
  const ctMinutes =
    Math.ceil((positiveField(budgets, "ctSuiteWorkerMinutes") / Math.max(1, profile.ctWorkers)) * positiveField(budgets, "ctCeilingFactor")) + hostWaitMinutes;
  return {
    defaultMs: defaultMinutes * MS_PER_MINUTE,
    ctSuiteMs: Math.max(defaultMinutes, ctMinutes) * MS_PER_MINUTE,
    ctHostWaitMs: hostWaitMinutes * MS_PER_MINUTE,
  };
}

/** THE BUDGET DOOR — the ceilings for the profile in force. One file read, like {@link readConcurrencyProfile}. */
export function readStageBudgets(env?: NodeJS.ProcessEnv): StageBudgets {
  const body = readFileSync(CONCURRENCY_PROFILE_PATH, "utf8");
  const switchValue = env === undefined ? processEnvValue(DEDICATED_BOX_ENV) : env[DEDICATED_BOX_ENV];
  return stageBudgetsFor(parseConcurrencyProfile(body, profileNameFor(switchValue)), body);
}

/** THE DOOR. The profile in force for this process: the committed data, selected by the shell env.
 *
 *  Read at every call rather than memoized at module load — a config reads it once, but a long-lived tool
 *  spawning children may want the switch its caller set, and the file is a few hundred bytes. */
export function readConcurrencyProfile(env?: NodeJS.ProcessEnv): ConcurrencyProfile {
  // The ambient read goes through `proc.ts`'s `processEnvValue` — this directory's ONE door for an ambient
  // tooling/test protocol value — rather than growing a second `process.env` policy site here.
  const switchValue = env === undefined ? processEnvValue(DEDICATED_BOX_ENV) : env[DEDICATED_BOX_ENV];
  return parseConcurrencyProfile(readFileSync(CONCURRENCY_PROFILE_PATH, "utf8"), profileNameFor(switchValue));
}
