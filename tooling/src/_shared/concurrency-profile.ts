// THE ONE READING OF "HOW MUCH OF THIS BOX MAY I TAKE" (#1835, owner ask 2026-09-06). Sibling of
// load-budget.ts and deliberately its opposite half: load-budget answers "the box is busy, so stretch this
// wall clock", this answers "the box is SHARED, so start fewer workers in the first place".
//
// THE DEFECT IT ENDS. Every worker cap on the tree was written PER WORKTREE and hard-coded at its call site
// — vitest 14 forks, CT 4 workers, typecheck 4 packages x 8 checkers, the edit hook's 4-slot biome pool, one
// CT runner lock per tree. Six lanes across two accounts multiply all of that ~6x, and 14h of Prometheus
// measured the result: node_load1 peaked at 105.8 on 24 cores, CPU busy sat at 93-99% for hours, and PSI cpu
// "some" reached 0.6 while the co-hosted homelab containers only ever wanted ~3 cores. `nice` could not save
// them: under cgroup v2 user.slice and system.slice both carry weight 100, so nice only re-orders tasks
// INSIDE user.slice and never reached the containers at all.
//
// THE DATA LIVES IN JSON, NOT HERE, and that is load-bearing: bash (.claude/hooks/biome-check.sh and
// cpu-fence.sh, via jq), CommonJS (scripts/ts7.cjs, scripts/typecheck.cjs) and TypeScript (this module, and
// through it vitest.config.ts / playwright-ct.config.ts / the verify tree) all read the SAME numbers with no
// build step between them. A TypeScript constant would have forced the two non-TS readers to re-spell the
// values, which is the "one home" failure this file exists to prevent. This module is the TYPED DOOR onto
// that data — it owns the shape, the switch and the refusals, never a number.
//
// THE SWITCH IS THE SHELL ENVIRONMENT, NEVER `.env` (say it here because it is the one surprising rule):
// tooling does not read the repo `.env` at all, and a checked-in file that silently retunes the whole fleet
// for whoever pulls it is exactly the lie this module exists to end. `ORB_DEDICATED_BOX=1` in the shell that
// launches a run — or in the DEV STACK's own env, which is a different, deliberate thing — is the solo-box
// opt-in; unset means shared, which is the safe direction.
//
// PURE except for `readConcurrencyProfile`'s default env argument. Every judging function takes the raw env
// VALUE, so a test drives both profiles and the refusal without touching process.env.
import { readFileSync } from "node:fs";
import { processEnvValue } from "./proc.ts";

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
 *  · `pnpmWorkspaceConcurrency`→ scripts/typecheck.cjs `pnpm -r --workspace-concurrency`
 *  · `eslintConcurrency`       → scripts/eslint.cjs `--concurrency` (ESLint's own default is `off`, i.e.
 *                                SINGLE-THREADED — the one cap here that RAISES parallelism)
 *  · `hookPoolSlots`           → .claude/hooks/biome-check.sh's HOST-WIDE flock pool, shared by its
 *                                file-scoped legs (biome + dep-cruiser)
 *  · `hookTs7Checkers`         → the `--checkers` that hook's WHOLE-PROGRAM ts7 leg passes (smaller than
 *                                `ts7Checkers`: it fires on every edit, beside whatever else is running)
 *  · `ctRunnersHostWide`       → tooling/src/verify/lib/ct-runner-lock.ts's host slot pool
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
  readonly hookPoolSlots: number;
  readonly hookTs7Checkers: number;
  readonly ctRunnersHostWide: number;
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

/** PURE + TOTAL: one non-negative integer cap out of a raw row, or the refusal naming the field. A cap that
 *  silently defaulted would spawn `NaN` workers, which vitest reads as "unlimited" — the exact saturation
 *  this module exists to cap — so there is no default and no coercion. */
function intField(row: Record<string, unknown>, name: ConcurrencyProfileName, field: keyof ConcurrencyProfile): number {
  const value = row[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return refuse(`profile "${name}" field "${field}" is ${JSON.stringify(value)} — expected a non-negative integer`);
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
    hookPoolSlots: intField(row, name, "hookPoolSlots"),
    hookTs7Checkers: intField(row, name, "hookTs7Checkers"),
    ctRunnersHostWide: intField(row, name, "ctRunnersHostWide"),
    sessionCpuQuotaPct: intField(row, name, "sessionCpuQuotaPct"),
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
