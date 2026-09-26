// The ONE home for the fleet's worker/slot caps (tooling/concurrency-profile.json + its typed door,
// tooling/src/_shared/concurrency-profile.ts). Home per Spine-Testing §2: a tooling module's test lives in
// tests/tooling/.
//
// WHAT THIS SUITE IS FOR (#1835, 0176). The committed JSON holds each profile's CEILINGS and the measured
// cost of one unit of work; the door derives every cap from the machine. So two things are pinned here: the
// file's SHAPE (a profile that lost a field would otherwise reach a config as `NaN` workers, which vitest
// reads as UNLIMITED), and the DERIVATION, always against an explicit machine so no assertion depends on the
// host running the suite. The big box keeps the committed ceilings exactly; a small box gets smaller caps.
//
// The two profiles are pinned by RELATION, not by literal, wherever a literal would just re-spell the JSON:
// the point of `dedicated` is that it is never STRICTER than `shared`. The handful of absolute numbers below
// are the ones that OTHER law quotes by value (the shared-host defaults the doctrine text now promises) —
// changing one of those is a doctrine edit, and this suite is what says so.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, totalmem } from "node:os";
import { join } from "node:path";
import process from "node:process";
import type { ConcurrencyProfile, DerivedCap, Machine, ProfileCeilings, UnitCosts } from "@orb/tooling/_shared/concurrency-profile";
import {
  CONCURRENCY_PROFILE_NAMES,
  CONCURRENCY_PROFILE_PATH,
  DEDICATED_BOX_ENV,
  deriveConcurrencyProfile,
  parseConcurrencyProfile,
  parseUnitCosts,
  profileNameFor,
  RUN_PRICED_CAPS,
  readConcurrencyProfile,
  readMachine,
  readStageBudgets,
  stageBudgetsFor,
  UNIT_PRICED_CAPS,
} from "@orb/tooling/_shared/concurrency-profile";
import { HOST_POOL_ROOT_ENV, tryAcquireHostSlot } from "@orb/tooling/_shared/host-slots";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import { TS7_ADMISSION_ENV, TS7_POOL_NAME, TS7_SLOT_BUSY_EXIT } from "@orb/tooling/_shared/ts7-admission";
import { expect, test } from "../../support/tool-fixtures.ts";

const BODY = readFileSync(CONCURRENCY_PROFILE_PATH, "utf8");
const COSTS = parseUnitCosts(BODY);

/** Every derived cap — each must be ≥1 in both profiles (a zero worker pool never runs). */
const DERIVED_CAPS: readonly DerivedCap[] = [...UNIT_PRICED_CAPS, ...RUN_PRICED_CAPS];
/** The positive integers a committed row carries: the derived caps' ceilings plus the committed stage cap. */
const POSITIVE_CAPS: readonly (DerivedCap | "stageCap")[] = [...DERIVED_CAPS, "stageCap"];

const MIB_PER_GIB = 1024;
const BYTES_PER_MIB = 1024 * 1024;
/** The owner's box, whose caps the ceilings were tuned on. */
const BIG_BOX: Machine = { cores: 24, memoryMiB: 48 * MIB_PER_GIB };
/** The 4-core box whose `process.constrainedMemory()` reads ~13.4 GiB, where 0176's OOM kills were measured. */
const SMALL_BOX: Machine = { cores: 4, memoryMiB: 13_681 };

/** A committed row without its share: the caps a machine big enough for every ceiling derives. */
function capsOf(committed: ProfileCeilings): ConcurrencyProfile {
  const { machineShare: _share, ...caps } = committed;
  return caps;
}

test("both committed profiles parse, and every cap is a usable positive integer", () => {
  for (const name of CONCURRENCY_PROFILE_NAMES) {
    const profile = parseConcurrencyProfile(BODY, name);
    expect(profile.name, "the parsed profile names itself").toBe(name);
    expect(profile.machineShare, `${name}.machineShare is a fraction of the machine`).toBeGreaterThan(0);
    expect(profile.machineShare).toBeLessThanOrEqual(1);
    for (const cap of POSITIVE_CAPS) {
      expect(profile[cap], `${name}.${cap} must be a positive integer — a zero-sized pool never runs`).toBeGreaterThanOrEqual(1);
    }
  }
});

test("SHARED is the default and its CEILINGS carry the exact numbers the doctrine text promises", () => {
  const shared = parseConcurrencyProfile(BODY, "shared");
  // The lane skill (.claude/skills/lane/SKILL.md) points at tooling/concurrency-profile.json for these
  // values instead of quoting them ("pass a worker flag only to go below the values"). These pins keep the
  // shared-host ceilings from drifting silently.
  expect(shared.vitestMaxWorkers, "vitest maxWorkers default").toBe(4);
  // 2 -> 4 by OWNER RULING 2026-09-06 (#1848). The measured CT suite is ~160 WORKER-minutes (488 files /
  // 5121 cases), so 2 workers made the push bar ~95 min and 4 makes it ~51; the box-wide bound is
  // `ctRunnersHostWide` (<=8 Chromiums), not this per-run number.
  expect(shared.ctWorkers, "playwright CT workers default").toBe(4);
  expect(shared.ts7Checkers, "ts7 --checkers default").toBe(4);
  expect(shared.pnpmWorkspaceConcurrency, "pnpm -r --workspace-concurrency default").toBe(1);
  // The ONE cap here that RAISES parallelism: ESLint ships `--concurrency off` (single-threaded), so this
  // row is a speed-up we are choosing to spend, not a ceiling we are imposing.
  expect(shared.eslintConcurrency, "eslint --concurrency default").toBe(4);
  expect(shared.strykerConcurrency, "Stryker calibration-preserving worker pool").toBe(6);
  expect(shared.cpdWorkers, "jscpd workers on the shared host").toBe(4);
  expect(shared.hookPoolSlots, "the edit hook's HOST-WIDE pool, shared by its file-scoped legs").toBe(4);
  expect(shared.hookTs7Checkers, "the edit hook's whole-program TS leg fires on every edit — it takes fewer checkers than a batch run").toBe(2);
  expect(shared.ctRunnersHostWide, "concurrent CT runners allowed across the whole host").toBe(2);
  expect(shared.ts7RunnersHostWide, "concurrent whole-program typechecks allowed across the whole host").toBe(3);
  expect(shared.stageCap, "live snap stages per box — 3 on a host that also serves the dev stack and the homelab").toBe(3);
});

test("DEDICATED is never STRICTER than shared", () => {
  const shared = parseConcurrencyProfile(BODY, "shared");
  const dedicated = parseConcurrencyProfile(BODY, "dedicated");
  for (const cap of POSITIVE_CAPS) {
    expect(dedicated[cap], `dedicated.${cap} must not be lower than shared.${cap} — the opt-in is an UNLOCK`).toBeGreaterThanOrEqual(shared[cap]);
  }
  expect(dedicated.machineShare, "a box that is yours alone is yours to size to").toBeGreaterThanOrEqual(shared.machineShare);
  expect(dedicated.strykerConcurrency, "Stryker's calibrated concurrency is profile-independent").toBe(6);
  expect(dedicated.cpdWorkers, "jscpd may use the whole dedicated 24-core box").toBe(24);
});

test("the whole-run verify queue applies in BOTH profiles — two whole runs on one box is never faster", () => {
  for (const name of CONCURRENCY_PROFILE_NAMES) {
    expect(parseConcurrencyProfile(BODY, name).wholeVerifyQueue, `${name}.wholeVerifyQueue`).toBe(true);
  }
});

// ── the derivation (0176): caps follow the machine, never past the committed ceiling ────────────────────

test("the owner's 24-core/48 GB box derives EXACTLY the committed ceilings, in both profiles", () => {
  for (const name of CONCURRENCY_PROFILE_NAMES) {
    const committed = parseConcurrencyProfile(BODY, name);
    expect(deriveConcurrencyProfile(committed, COSTS, BIG_BOX), `${name} on the big box`).toStrictEqual(capsOf(committed));
  }
});

test("a 4-core/13.4 GB box derives SMALLER caps, and the host-wide typecheck pool fits its memory", () => {
  for (const name of CONCURRENCY_PROFILE_NAMES) {
    const committed = parseConcurrencyProfile(BODY, name);
    const small = deriveConcurrencyProfile(committed, COSTS, SMALL_BOX);
    for (const cap of DERIVED_CAPS) {
      expect(small[cap], `${name}.${cap} never exceeds its ceiling`).toBeLessThanOrEqual(committed[cap]);
      expect(small[cap], `${name}.${cap} never drops below one`).toBeGreaterThanOrEqual(1);
    }
    const cores = committed.machineShare * SMALL_BOX.cores;
    expect(small.vitestMaxWorkers, `${name}: vitest workers fit the cores`).toBeLessThanOrEqual(cores);
    expect(small.ts7Checkers, `${name}: checkers fit the cores`).toBeLessThanOrEqual(cores);
    // THE 0176 SYMPTOM: several whole-program typechecks each sized to the whole box. The pool admits only
    // as many runs as the profile's memory share holds at the derived checker count.
    const run = COSTS.ts7Checker.baseMemoryMiB + small.ts7Checkers * COSTS.ts7Checker.memoryMiB;
    expect(small.ts7RunnersHostWide * run, `${name}: the concurrent typechecks fit the memory share`).toBeLessThanOrEqual(
      committed.machineShare * SMALL_BOX.memoryMiB,
    );
  }
  const shared = deriveConcurrencyProfile(parseConcurrencyProfile(BODY, "shared"), COSTS, SMALL_BOX);
  const committed = parseConcurrencyProfile(BODY, "shared");
  for (const cap of ["vitestMaxWorkers", "ctWorkers", "ts7Checkers", "eslintConcurrency", "cpdWorkers", "ctRunnersHostWide", "ts7RunnersHostWide"] as const) {
    expect(shared[cap], `shared.${cap} is strictly smaller on the small box`).toBeLessThan(committed[cap]);
  }
  expect(shared.ts7RunnersHostWide, "one whole-program typecheck at a time on the small box").toBe(1);
});

const FLAT_COSTS: UnitCosts = {
  vitestWorker: { cores: 1, memoryMiB: 1000, baseMemoryMiB: 0 },
  ctWorker: { cores: 1, memoryMiB: 1000, baseMemoryMiB: 0 },
  ts7Checker: { cores: 1, memoryMiB: 1000, baseMemoryMiB: 4000 },
  eslintWorker: { cores: 1, memoryMiB: 1000, baseMemoryMiB: 0 },
  cpdWorker: { cores: 1, memoryMiB: 0, baseMemoryMiB: 0 },
  hookLeg: { cores: 1, memoryMiB: 1000, baseMemoryMiB: 0 },
};

test("each cap is the smallest of its ceiling, its core bound and its memory bound, never below one", () => {
  const whole = { ...parseConcurrencyProfile(BODY, "dedicated"), machineShare: 1 };
  // Cores bind: 3 cores, plenty of memory.
  expect(deriveConcurrencyProfile(whole, FLAT_COSTS, { cores: 3, memoryMiB: 1_000_000 }).vitestMaxWorkers).toBe(3);
  // Memory binds: plenty of cores, 5 GiB-ish of memory.
  expect(deriveConcurrencyProfile(whole, FLAT_COSTS, { cores: 64, memoryMiB: 5500 }).vitestMaxWorkers).toBe(5);
  // The ceiling binds: a huge machine never goes past the committed number.
  expect(deriveConcurrencyProfile(whole, FLAT_COSTS, { cores: 512, memoryMiB: 10_000_000 }).vitestMaxWorkers).toBe(whole.vitestMaxWorkers);
  // A unit that prices no memory is bounded by cores alone.
  expect(deriveConcurrencyProfile(whole, FLAT_COSTS, { cores: 6, memoryMiB: 1 }).cpdWorkers).toBe(6);
  // The base is paid before the first unit: 6000 MiB less a 4000 base leaves room for two checkers.
  expect(deriveConcurrencyProfile(whole, FLAT_COSTS, { cores: 64, memoryMiB: 6000 }).ts7Checkers).toBe(2);
  // A machine too small for one unit still runs one: a zero-sized pool never runs at all.
  const tiny = deriveConcurrencyProfile(whole, FLAT_COSTS, { cores: 1, memoryMiB: 100 });
  for (const cap of DERIVED_CAPS) {
    expect(tiny[cap], `${cap} on a tiny machine`).toBe(1);
  }
});

test("the profile's machine share scales both bounds", () => {
  const half = { ...parseConcurrencyProfile(BODY, "dedicated"), machineShare: 0.5 };
  expect(deriveConcurrencyProfile(half, FLAT_COSTS, { cores: 8, memoryMiB: 1_000_000 }).vitestMaxWorkers, "half of 8 cores").toBe(4);
  expect(deriveConcurrencyProfile(half, FLAT_COSTS, { cores: 64, memoryMiB: 8000 }).vitestMaxWorkers, "half of 8000 MiB").toBe(4);
});

test("a run cap prices one run at its inner cap's DERIVED size, and only the CT runs are core-bound", () => {
  const whole = { ...parseConcurrencyProfile(BODY, "dedicated"), machineShare: 1 };
  // 64 cores, 30000 MiB: 8 checkers (the dedicated ceiling) => a 12000 MiB run => two runs fit.
  const roomy = deriveConcurrencyProfile(whole, FLAT_COSTS, { cores: 64, memoryMiB: 30_000 });
  expect(roomy.ts7Checkers).toBe(8);
  expect(roomy.ts7RunnersHostWide).toBe(2);
  expect(roomy.pnpmWorkspaceConcurrency).toBe(2);
  // 4 cores: the checkers drop to 4, a run to 8000 MiB, and three runs fit the same memory — the typecheck
  // run caps ignore cores, because past the core count a typecheck only time-slices.
  const fewCores = deriveConcurrencyProfile(whole, FLAT_COSTS, { cores: 4, memoryMiB: 30_000 });
  expect(fewCores.ts7Checkers).toBe(4);
  expect(fewCores.ts7RunnersHostWide).toBe(3);
  // A CT run is 4 workers x 1 core, so 4 cores hold exactly one run whatever the memory.
  expect(fewCores.ctRunnersHostWide).toBe(1);
});

test("readMachine reads this process's cores and memory, never more memory than the box has", () => {
  const machine = readMachine();
  expect(Number.isInteger(machine.cores) && machine.cores >= 1, "at least one core").toBe(true);
  expect(machine.memoryMiB, "some memory").toBeGreaterThan(0);
  expect(machine.memoryMiB * BYTES_PER_MIB, "a cgroup limit never reads above the physical total").toBeLessThanOrEqual(totalmem());
});

test(`${DEDICATED_BOX_ENV} selects the profile, and an unrecognised value REFUSES instead of silently meaning "shared"`, () => {
  expect(profileNameFor(undefined), "unset = the safe direction").toBe("shared");
  expect(profileNameFor(""), "empty = unset").toBe("shared");
  expect(profileNameFor("0")).toBe("shared");
  expect(profileNameFor("1")).toBe("dedicated");
  expect(profileNameFor(" 1 "), "surrounding whitespace is not a different answer").toBe("dedicated");
  // The whole point: `true` / `yes` are the spellings an operator reaches for, and treating them as
  // "shared" would leave a dedicated box running at shared-host speed with no symptom but slowness.
  for (const bogus of ["true", "yes", "on", "2", "shared"]) {
    expect(() => profileNameFor(bogus), `${DEDICATED_BOX_ENV}=${bogus} must refuse`).toThrow(new RegExp(`${DEDICATED_BOX_ENV}="${bogus}"`, "u"));
  }
});

test("the env door reads the committed file end to end and derives for the machine it is given", () => {
  for (const machine of [BIG_BOX, SMALL_BOX]) {
    expect(readConcurrencyProfile({}, machine), "no env = shared").toStrictEqual(
      deriveConcurrencyProfile(parseConcurrencyProfile(BODY, "shared"), COSTS, machine),
    );
    expect(readConcurrencyProfile({ [DEDICATED_BOX_ENV]: "1" }, machine)).toStrictEqual(
      deriveConcurrencyProfile(parseConcurrencyProfile(BODY, "dedicated"), COSTS, machine),
    );
  }
  expect(readConcurrencyProfile({}), "the default machine is this one").toStrictEqual(readConcurrencyProfile({}, readMachine()));
});

// ── the stage budgets (#1848): the ONE place a verify stage's hang ceiling comes from ─────────────────
//
// The point of these arms is that the ceiling is DERIVED. A 45-minute constant applied to every stage is
// what made `verify --full` report `[tool-error] TIMED OUT` for a CT suite that was merely still working,
// so the property under test is the RELATION between the caps and the ceilings — never a literal minute
// count, which would just re-spell the JSON and go stale the same way.

test("the CT ceiling FOLLOWS ctWorkers, covers the host-slot wait, and never dips under the default", () => {
  const shared = parseConcurrencyProfile(BODY, "shared");
  const budgets = stageBudgetsFor(shared, BODY);
  const halfTheWorkers = stageBudgetsFor({ ...shared, ctWorkers: Math.max(1, Math.floor(shared.ctWorkers / 2)) }, BODY);
  expect(halfTheWorkers.ctSuiteMs, "half the workers ⇒ a strictly longer honest run ⇒ a longer ceiling").toBeGreaterThan(budgets.ctSuiteMs);
  // A queued run spends the host-slot wait INSIDE the stage's wall clock, so the ceiling has to contain it
  // (ct-runner-lock.ts reads `ctHostWaitMs` from this same row — one number, two readers).
  expect(budgets.ctSuiteMs, "the ceiling must exceed the wait a run is allowed to spend queueing").toBeGreaterThan(budgets.ctHostWaitMs);
  expect(budgets.ctSuiteMs, "…and the default floor").toBeGreaterThanOrEqual(budgets.defaultMs);
  // A typecheck queued for a host slot waits inside its stage too, so its wait stays under the stage default.
  expect(budgets.ts7HostWaitMs, "the typecheck queue wait fits inside a stage").toBeLessThan(budgets.defaultMs);
  // An absurdly cheap suite must still not shrink a stage's ceiling below the default.
  const cheap = BODY.replace(/"ctSuiteWorkerMinutes": \d+/u, '"ctSuiteWorkerMinutes": 1').replace(
    /"ctHostSlotWaitMinutes": \d+/u,
    '"ctHostSlotWaitMinutes": 1',
  );
  expect(stageBudgetsFor(shared, cheap).ctSuiteMs).toBe(stageBudgetsFor(shared, cheap).defaultMs);
  // The mutation ceiling is its own row, floored at the default like every other ceiling.
  expect(budgets.mutationGateMs, "a mutant run is measured in hours").toBeGreaterThan(budgets.defaultMs);
  const cheapMutation = BODY.replace(/"mutationGateMinutes": \d+/u, '"mutationGateMinutes": 1');
  expect(stageBudgetsFor(shared, cheapMutation).mutationGateMs).toBe(stageBudgetsFor(shared, cheapMutation).defaultMs);
});

test("a broken stageBudgets row REFUSES loudly — never a defaulted ceiling", () => {
  const shared = parseConcurrencyProfile(BODY, "shared");
  expect(() => stageBudgetsFor(shared, '{"profiles":{}}')).toThrow(/has no "stageBudgets" object/u);
  expect(() => stageBudgetsFor(shared, BODY.replace(/"defaultMinutes": \d+/u, '"defaultMinutes": 0'))).toThrow(/field "defaultMinutes" is 0/u);
  expect(() => stageBudgetsFor(shared, BODY.replace(/"ctSuiteWorkerMinutes": \d+/u, '"ctSuiteWorkerMinutes": "165"'))).toThrow(
    /field "ctSuiteWorkerMinutes" is "165"/u,
  );
  expect(() => stageBudgetsFor(shared, BODY.replace(/"ts7HostSlotWaitMinutes": \d+/u, '"ts7HostSlotWaitMinutes": 0'))).toThrow(
    /field "ts7HostSlotWaitMinutes" is 0/u,
  );
  expect(() => stageBudgetsFor(shared, BODY.replace(/"mutationGateMinutes": \d+/u, '"mutationGateMinutes": -1'))).toThrow(/field "mutationGateMinutes" is -1/u);
});

test("the budget door reads the committed file end to end, per profile and machine", () => {
  for (const machine of [BIG_BOX, SMALL_BOX]) {
    expect(readStageBudgets({}, machine)).toStrictEqual(stageBudgetsFor(readConcurrencyProfile({}, machine), BODY));
    expect(readStageBudgets({ [DEDICATED_BOX_ENV]: "1" }, machine)).toStrictEqual(
      stageBudgetsFor(readConcurrencyProfile({ [DEDICATED_BOX_ENV]: "1" }, machine), BODY),
    );
  }
  expect(readStageBudgets({}, SMALL_BOX).ctSuiteMs, "fewer CT workers on a small box ⇒ a longer honest CT run").toBeGreaterThan(
    readStageBudgets({}, BIG_BOX).ctSuiteMs,
  );
});

/** The committed file with one shared-row field (or, given `row: "unitCosts.<name>"`, one unit-cost field)
 *  replaced or DROPPED (when `value` is absent) — the two ways an edit to the JSON breaks it. Built by
 *  rewriting the entry list rather than mutating, so the parsed body stays the oracle for every other case. */
function bodyWith(path: readonly [string, string], field: string, value?: unknown): string {
  const file = JSON.parse(BODY) as Record<string, Record<string, Record<string, unknown>>>;
  const [section, key] = path;
  const table = file[section] ?? {};
  const entries: [string, unknown][] = Object.entries(table[key] ?? {}).filter(([name]) => name !== field);
  if (value !== undefined) {
    entries.push([field, value]);
  }
  return JSON.stringify({ ...file, [section]: { ...table, [key]: Object.fromEntries(entries) } });
}
const SHARED_ROW = ["profiles", "shared"] as const;

test("worker and slot ceilings reject zero, and the machine share must be a fraction", () => {
  for (const cap of POSITIVE_CAPS) {
    expect(() => parseConcurrencyProfile(bodyWith(SHARED_ROW, cap, 0), "shared"), `${cap}=0 must refuse`).toThrow(/expected a positive integer/u);
  }
  for (const share of [0, -0.5, 1.5, "0.5"]) {
    expect(() => parseConcurrencyProfile(bodyWith(SHARED_ROW, "machineShare", share), "shared"), `machineShare=${String(share)}`).toThrow(
      /field "machineShare" is .* expected a fraction above 0 and at most 1/u,
    );
  }
});

test("a broken unit-cost row REFUSES loudly — never an unbounded cap", () => {
  expect(() => parseUnitCosts('{"profiles":{}}')).toThrow(/has no "unitCosts" object/u);
  expect(() => parseUnitCosts(bodyWith(["unitCosts", "ts7Checker"], "memoryMiB", -1))).toThrow(/"unitCosts.ts7Checker" field "memoryMiB" is -1/u);
  expect(() => parseUnitCosts(bodyWith(["unitCosts", "ctWorker"], "cores"))).toThrow(/"unitCosts.ctWorker" field "cores" is undefined/u);
  const free = JSON.parse(BODY) as { unitCosts: Record<string, unknown> };
  free.unitCosts["hookLeg"] = { cores: 0, memoryMiB: 0, baseMemoryMiB: 0 };
  expect(() => parseUnitCosts(JSON.stringify(free)), "a unit that costs nothing derives no cap").toThrow(/prices neither cores nor memory/u);
});

// Both spawn doors are captured, because the wrappers use both: eslint and cpd block on spawnSync, while ts7 spawns
// asynchronously so its host slot's lease keeps beating. The async fake settles on the next tick, as a real child does.
const CAPTURE_PRELOAD = `
const fs = require("node:fs");
const { EventEmitter } = require("node:events");
const childProcess = require("node:child_process");
function capture(command, args, options) {
  fs.writeFileSync(process.env.ORB_WRAPPER_CAPTURE, JSON.stringify({ command, args, cwd: options?.cwd ?? null }));
  return process.env.ORB_WRAPPER_OUTCOME ?? "0";
}
childProcess.spawnSync = (command, args, options) => {
  const outcome = capture(command, args, options);
  if (outcome === "spawn-error") return { status: null, signal: null, error: new Error("planted spawn failure") };
  if (outcome === "signal") return { status: null, signal: "SIGTERM" };
  return { status: Number(outcome), signal: null };
};
childProcess.spawn = (command, args, options) => {
  const outcome = capture(command, args, options);
  const child = new EventEmitter();
  process.nextTick(() => {
    if (outcome === "spawn-error") child.emit("error", new Error("planted spawn failure"));
    else if (outcome === "signal") child.emit("exit", null, "SIGTERM");
    else child.emit("exit", Number(outcome), null);
  });
  return child;
};
require("node:module").syncBuiltinESMExports();
`;

interface WrapperCapture {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string | null;
}

/** Runs one wrapper with its spawn captured. The host pool root is the scratch dir, so a ts7 run never
 *  contends with — or blocks — an operator's live typecheck; `prepare` may plant pool state there first. */
function runWrapper(
  script: "ts7.ts" | "eslint.ts" | "cpd.ts",
  args: readonly string[],
  box: string | undefined,
  extra: { readonly outcome?: string; readonly env?: NodeJS.ProcessEnv; readonly prepare?: (runtime: NodeJS.ProcessEnv) => void } = {},
): {
  readonly status: number | null;
  readonly stderr: string;
  readonly capture: WrapperCapture | null;
} {
  const dir = mkdtempSync(join(tmpdir(), "orb-cap-wrapper-"));
  const preload = join(dir, "capture.cjs");
  const captureFile = join(dir, "capture.json");
  writeFileSync(preload, CAPTURE_PRELOAD);
  const env = inheritedProcessEnv(Object.fromEntries([["ORB_WRAPPER_CAPTURE", captureFile]]));
  env["ORB_WRAPPER_OUTCOME"] = extra.outcome ?? "0";
  env[HOST_POOL_ROOT_ENV] = dir;
  Object.assign(env, extra.env);
  extra.prepare?.({ [HOST_POOL_ROOT_ENV]: dir });
  if (box === undefined) {
    delete env[DEDICATED_BOX_ENV];
  } else {
    env[DEDICATED_BOX_ENV] = box;
  }
  const result = spawnSync(process.execPath, ["--require", preload, join(process.cwd(), "scripts", script), ...args], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  });
  const capture = existsSync(captureFile) ? (JSON.parse(readFileSync(captureFile, "utf8")) as WrapperCapture) : null;
  rmSync(dir, { recursive: true, force: true });
  return { status: result.status, stderr: result.stderr, capture };
}

function optionValue(args: readonly string[] | undefined, option: string): string | undefined {
  if (args === undefined) {
    return;
  }
  const at = args.indexOf(option);
  return at === -1 ? undefined : args[at + 1];
}

test("all worker wrappers reject a malformed box switch before spawning, even with an explicit worker override", () => {
  const cases = [
    ["ts7.ts", ["--checkers", "1", "--version"], 1],
    ["eslint.ts", ["--concurrency", "off", "--version"], 2],
  ] as const;
  for (const [script, args, expectedStatus] of cases) {
    const result = runWrapper(script, args, "true");
    expect(result.status, script).toBe(expectedStatus);
    expect(result.stderr, script).toContain(`${DEDICATED_BOX_ENV}="true"`);
    expect(result.capture, `${script} must refuse before spawning`).toBeNull();
  }

  const cpd = runWrapper("cpd.ts", ["--workers", "1", "--version"], "true");
  expect(cpd.status).toBe(2);
  expect(cpd.stderr).toContain("launcher configuration refused the run");
  expect(cpd.stderr).toContain(`${DEDICATED_BOX_ENV}="true"`);
  expect(cpd.capture).toBeNull();
});

test("worker wrappers inject the door's derived shared/dedicated caps and preserve explicit native worker overrides", () => {
  // The child runs on this same machine, so the door's answer here IS the value the wrapper must inject.
  const shared = readConcurrencyProfile({});
  const dedicated = readConcurrencyProfile({ [DEDICATED_BOX_ENV]: "1" });
  const tsShared = runWrapper("ts7.ts", ["--version"], undefined).capture;
  const tsDedicated = runWrapper("ts7.ts", ["--version"], "1").capture;
  const tsExplicit = runWrapper("ts7.ts", ["--checkers", "1", "--version"], "1").capture;
  expect(optionValue(tsShared?.args, "--checkers")).toBe(String(shared.ts7Checkers));
  expect(optionValue(tsDedicated?.args, "--checkers")).toBe(String(dedicated.ts7Checkers));
  expect(tsExplicit?.args.filter((arg) => arg === "--checkers")).toHaveLength(1);
  expect(optionValue(tsExplicit?.args, "--checkers")).toBe("1");

  const eslintShared = runWrapper("eslint.ts", ["--version"], undefined).capture;
  const eslintDedicated = runWrapper("eslint.ts", ["--version"], "1").capture;
  const eslintExplicit = runWrapper("eslint.ts", ["--concurrency", "off", "--version"], "1").capture;
  expect(optionValue(eslintShared?.args, "--concurrency")).toBe(String(shared.eslintConcurrency));
  expect(optionValue(eslintDedicated?.args, "--concurrency")).toBe(String(dedicated.eslintConcurrency));
  expect(eslintExplicit?.args.filter((arg) => arg === "--concurrency")).toHaveLength(1);
  expect(optionValue(eslintExplicit?.args, "--concurrency")).toBe("off");

  const cpdShared = runWrapper("cpd.ts", ["-c", "jscpd.json"], undefined).capture;
  const cpdDedicated = runWrapper("cpd.ts", ["-c", "jscpd.json"], "1").capture;
  const cpdExplicit = runWrapper("cpd.ts", ["--workers=2", "-c", "jscpd.json"], "1").capture;
  expect(optionValue(cpdShared?.args, "--workers")).toBe(String(shared.cpdWorkers));
  expect(optionValue(cpdDedicated?.args, "--workers")).toBe(String(dedicated.cpdWorkers));
  expect(cpdExplicit?.args.filter((arg) => arg === "--workers=2" || arg === "--workers")).toEqual(["--workers=2"]);
});

test("the TS7 wrapper holds a host slot for a program run, and an advisory run with every slot live exits busy without spawning", () => {
  // A program run takes a slot and gives it back: the capture proves the compiler was spawned, and the
  // pool is empty again afterwards (checked through the next arm, which needs every slot free to fill).
  expect(runWrapper("ts7.ts", ["--noEmit", "-p", "tsconfig.json"], undefined).capture?.args).toContain("--noEmit");
  const slots = readConcurrencyProfile({}).ts7RunnersHostWide;
  const fill = (runtime: NodeJS.ProcessEnv): void => {
    // The holder is THIS test process: live for the whole wrapper run, and never a reused pid.
    for (let slot = 0; slot < slots; slot += 1) {
      tryAcquireHostSlot({ name: TS7_POOL_NAME, label: "a live typecheck", slots }, { env: runtime });
    }
  };
  const busy = runWrapper("ts7.ts", ["--noEmit", "-p", "tsconfig.json"], undefined, { env: { [TS7_ADMISSION_ENV]: "try" }, prepare: fill });
  expect(busy.status).toBe(TS7_SLOT_BUSY_EXIT);
  expect(busy.stderr).toContain("SKIPPED");
  expect(busy.capture, "a skipped advisory run never reaches the compiler").toBeNull();
  // …and a run that builds no program is never pooled, so it answers even with the pool full.
  expect(runWrapper("ts7.ts", ["--version"], undefined, { env: { [TS7_ADMISSION_ENV]: "try" }, prepare: fill }).capture).not.toBeNull();
  // A malformed admission switch refuses before spawning rather than silently queueing.
  const bogus = runWrapper("ts7.ts", ["--noEmit", "-p", "tsconfig.json"], undefined, { env: { [TS7_ADMISSION_ENV]: "yes" } });
  expect(bogus.status).not.toBe(0);
  expect(bogus.stderr).toContain(`${TS7_ADMISSION_ENV}="yes"`);
  expect(bogus.capture).toBeNull();
});

test("the CPD wrapper preserves native verdicts and makes every abnormal child outcome a loud tool error", () => {
  expect(runWrapper("cpd.ts", ["-c", "jscpd.json"], undefined, { outcome: "0" }).status).toBe(0);
  expect(runWrapper("cpd.ts", ["-c", "jscpd.json"], undefined, { outcome: "1" }).status).toBe(1);

  const other = runWrapper("cpd.ts", ["-c", "jscpd.json"], undefined, { outcome: "2" });
  expect(other.status).toBe(2);
  expect(other.stderr).toContain("only native exits 0 and 1 are duplication verdicts");

  const signalled = runWrapper("cpd.ts", ["-c", "jscpd.json"], undefined, { outcome: "signal" });
  expect(signalled.status).toBe(2);
  expect(signalled.stderr).toContain("terminated by signal SIGTERM");

  const failed = runWrapper("cpd.ts", ["-c", "jscpd.json"], undefined, { outcome: "spawn-error" });
  expect(failed.status).toBe(2);
  expect(failed.stderr).toContain("failed to spawn");
  expect(failed.stderr).toContain("planted spawn failure");
});

test("the TS7 wrapper removes valid incremental cache options without dropping unrelated compiler argv", () => {
  const cases = [
    {
      argv: ["--incremental", "--tsBuildInfoFile", "/tmp/vitest-build-info", "--noEmit", "-p", "tsconfig.json"],
      preserved: ["--noEmit", "-p", "tsconfig.json"],
    },
    {
      argv: ["--incremental", "true", "--tsBuildInfoFile=/tmp/vitest-build-info", "--pretty", "false"],
      preserved: ["--pretty", "false"],
    },
    {
      argv: ["--incremental=false", "--tsBuildInfoFile", "/tmp/vitest-build-info", "--listFilesOnly"],
      preserved: ["--listFilesOnly"],
    },
    {
      argv: ["--INCREMENTAL=TRUE", "--TSBUILDINFOFILE=/tmp/vitest-build-info", "--version"],
      preserved: ["--version"],
    },
    {
      argv: ["-i", "--tsBuildInfoFile", "/tmp/vitest-build-info", "--noEmit"],
      preserved: ["--noEmit"],
    },
    {
      argv: ["-I", "FALSE", "--tsBuildInfoFile=/tmp/vitest-build-info", "--pretty", "false"],
      preserved: ["--pretty", "false"],
    },
  ] as const;
  for (const { argv, preserved } of cases) {
    const result = runWrapper("ts7.ts", argv, undefined);
    expect(result.status).toBe(0);
    expect(result.capture).not.toBeNull();
    expect(
      result.capture?.args.some((arg) => {
        const normalized = arg.toLowerCase();
        return normalized === "--incremental" || normalized.startsWith("--incremental=") || normalized === "-i" || normalized.startsWith("-i=");
      }),
    ).toBe(false);
    expect(result.capture?.args.some((arg) => arg.toLowerCase() === "--tsbuildinfofile" || arg.toLowerCase().startsWith("--tsbuildinfofile="))).toBe(false);
    for (const arg of preserved) {
      expect(result.capture?.args).toContain(arg);
    }
  }
});

test("the TS7 wrapper rejects malformed incremental cache options before spawning", () => {
  const cases = [
    ["--incremental=maybe"],
    ["--incremental="],
    ["-i=true"],
    ["-I=false"],
    ["--tsBuildInfoFile"],
    ["--tsBuildInfoFile", ""],
    ["--tsBuildInfoFile", "--noEmit"],
    ["--tsBuildInfoFile="],
  ] as const;
  for (const argv of cases) {
    const result = runWrapper("ts7.ts", argv, undefined);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/--incremental expects true or false|-i does not accept an equals-form value|--tsBuildInfoFile requires a path value/u);
    expect(result.capture).toBeNull();
  }
});

test("a broken profile file REFUSES loudly and names itself — never a defaulted cap", () => {
  expect(() => parseConcurrencyProfile("{ not json", "shared")).toThrow(/tooling\/concurrency-profile\.json is not valid JSON/u);
  expect(() => parseConcurrencyProfile("[]", "shared")).toThrow(/is not a JSON object/u);
  expect(() => parseConcurrencyProfile('{"profiles":{}}', "shared")).toThrow(/has no "shared" profile object/u);
  expect(() => parseConcurrencyProfile(bodyWith(SHARED_ROW, "ctWorkers"), "shared"), "a field that went missing").toThrow(/field "ctWorkers" is undefined/u);
  expect(() => parseConcurrencyProfile(bodyWith(SHARED_ROW, "vitestMaxWorkers", "4"), "shared"), "a cap that became a string").toThrow(
    /field "vitestMaxWorkers" is "4"/u,
  );
  expect(() => parseConcurrencyProfile(bodyWith(SHARED_ROW, "wholeVerifyQueue", "true"), "shared"), "a boolean that became a string").toThrow(
    /field "wholeVerifyQueue" is "true"/u,
  );
});
