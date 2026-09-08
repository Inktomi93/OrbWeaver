// The ONE home for the fleet's worker/slot caps (tooling/concurrency-profile.json + its typed door,
// tooling/src/_shared/concurrency-profile.ts). Home per Spine-Testing §2: a tooling module's test lives in
// tests/tooling/.
//
// WHAT THIS SUITE IS FOR (#1835). The committed JSON is read by FOUR unrelated languages — bash (two
// hooks, via jq), CommonJS (scripts/ts7.cjs), TypeScript configs and tools (vitest,
// playwright-ct) and the verify tree — and only this one of them has a type checker. So the file's SHAPE is
// pinned here: a profile that lost a field, or grew a string where a cap belongs, would otherwise reach the
// bash readers as an empty jq result and the TS readers as `NaN` workers, which vitest reads as UNLIMITED —
// i.e. the exact box saturation the file exists to cap, delivered by the file meant to prevent it.
//
// The two profiles are pinned by RELATION, not by literal, wherever a literal would just re-spell the JSON:
// the point of `dedicated` is that it is never STRICTER than `shared`. The handful of absolute numbers below
// are the ones that OTHER law quotes by value (the shared-host defaults the doctrine text now promises) —
// changing one of those is a doctrine edit, and this suite is what says so.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import type { ConcurrencyProfile } from "@orb/tooling/_shared/concurrency-profile";
import {
  CONCURRENCY_PROFILE_NAMES,
  CONCURRENCY_PROFILE_PATH,
  DEDICATED_BOX_ENV,
  parseConcurrencyProfile,
  profileNameFor,
  readConcurrencyProfile,
  readStageBudgets,
  stageBudgetsFor,
} from "@orb/tooling/_shared/concurrency-profile";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import { expect, test } from "../../support/tool-fixtures.ts";

const BODY = readFileSync(CONCURRENCY_PROFILE_PATH, "utf8");

/** The caps that are CAPS — every one must be ≥1 in both profiles (a zero worker pool never runs). */
const POSITIVE_CAPS = [
  "vitestMaxWorkers",
  "ctWorkers",
  "ts7Checkers",
  "pnpmWorkspaceConcurrency",
  "eslintConcurrency",
  "hookPoolSlots",
  "hookTs7Checkers",
  "ctRunnersHostWide",
  "stageCap",
] as const satisfies readonly (keyof ConcurrencyProfile)[];

test("both committed profiles parse, and every cap is a usable positive integer", () => {
  for (const name of CONCURRENCY_PROFILE_NAMES) {
    const profile = parseConcurrencyProfile(BODY, name);
    expect(profile.name, "the parsed profile names itself").toBe(name);
    for (const cap of POSITIVE_CAPS) {
      expect(profile[cap], `${name}.${cap} must be a positive integer — a zero-sized pool never runs`).toBeGreaterThanOrEqual(1);
    }
  }
});

test("SHARED is the default and carries the exact numbers the doctrine text promises", () => {
  const shared = parseConcurrencyProfile(BODY, "shared");
  // These six are quoted BY VALUE in .claude/rules/lane-standing-facts.md and .claude/agent-doctrine.md
  // ("lanes pass no --maxWorkers/--workers; the defaults ARE the shared-host values"). Changing one here
  // without changing the prose makes the prose a lie, which is what this pin is for.
  expect(shared.vitestMaxWorkers, "vitest maxWorkers default").toBe(4);
  // 2 -> 4 by OWNER RULING 2026-09-06 (#1848). The measured CT suite is ~160 WORKER-minutes (488 files /
  // 5121 cases), so 2 workers made the push bar ~95 min and 4 makes it ~51; the box-wide bound is
  // `ctRunnersHostWide` (<=8 Chromiums) plus the cpu-fence quota, not this per-run number.
  // COUPLED PROSE: .claude/rules/lane-standing-facts.md quotes the shared CT value by literal ("vitest 4,
  // CT 4"); it was repaired in the #1848 fold commit. `.claude/agent-doctrine.md` carries no CT literal.
  expect(shared.ctWorkers, "playwright CT workers default").toBe(4);
  expect(shared.ts7Checkers, "ts7 --checkers default").toBe(4);
  expect(shared.pnpmWorkspaceConcurrency, "pnpm -r --workspace-concurrency default").toBe(1);
  // The ONE cap here that RAISES parallelism: ESLint ships `--concurrency off` (single-threaded), so this
  // row is a speed-up we are choosing to spend, not a ceiling we are imposing.
  expect(shared.eslintConcurrency, "eslint --concurrency default").toBe(4);
  expect(shared.hookPoolSlots, "the edit hook's HOST-WIDE pool, shared by its two file-scoped legs").toBe(4);
  expect(shared.hookTs7Checkers, "the edit hook's whole-program TS leg fires on every edit — it takes fewer checkers than a batch run").toBe(2);
  expect(shared.ctRunnersHostWide, "concurrent CT runners allowed across the whole host").toBe(2);
  expect(shared.stageCap, "live snap stages per box — 3 on a host that also serves the dev stack and the homelab").toBe(3);
  // A ceiling of 0 would mean "no ceiling" — the shared profile MUST set one, or the cpu-fence hook
  // stands down on the very box it exists for.
  expect(shared.sessionCpuQuotaPct, "the per-session CPUQuota% the cpu-fence hook sets").toBeGreaterThan(0);
  expect(shared.sessionMemoryHigh, "the per-session MemoryHigh the cpu-fence hook sets").not.toBe("");
});

test("DEDICATED is never STRICTER than shared, and stands the per-session ceiling down", () => {
  const shared = parseConcurrencyProfile(BODY, "shared");
  const dedicated = parseConcurrencyProfile(BODY, "dedicated");
  for (const cap of POSITIVE_CAPS) {
    expect(dedicated[cap], `dedicated.${cap} must not be lower than shared.${cap} — the opt-in is an UNLOCK`).toBeGreaterThanOrEqual(shared[cap]);
  }
  // The two "0 / empty means no ceiling" fields, asserted as the ABSENCE they encode: on a box that is
  // yours alone the hook prints that it is standing down rather than throttling you.
  expect(dedicated.sessionCpuQuotaPct, "no CPUQuota on a dedicated box").toBe(0);
  expect(dedicated.sessionMemoryHigh, "no MemoryHigh on a dedicated box").toBe("");
});

test("the whole-run verify queue applies in BOTH profiles — two whole runs on one box is never faster", () => {
  for (const name of CONCURRENCY_PROFILE_NAMES) {
    expect(parseConcurrencyProfile(BODY, name).wholeVerifyQueue, `${name}.wholeVerifyQueue`).toBe(true);
  }
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

test("the env door reads the committed file end to end", () => {
  expect(readConcurrencyProfile({}), "no env = shared").toStrictEqual(parseConcurrencyProfile(BODY, "shared"));
  expect(readConcurrencyProfile({ [DEDICATED_BOX_ENV]: "1" })).toStrictEqual(parseConcurrencyProfile(BODY, "dedicated"));
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
  // An absurdly cheap suite must still not shrink a stage's ceiling below the default.
  const cheap = BODY.replace(/"ctSuiteWorkerMinutes": \d+/u, '"ctSuiteWorkerMinutes": 1').replace(
    /"ctHostSlotWaitMinutes": \d+/u,
    '"ctHostSlotWaitMinutes": 1',
  );
  expect(stageBudgetsFor(shared, cheap).ctSuiteMs).toBe(stageBudgetsFor(shared, cheap).defaultMs);
});

test("a broken stageBudgets row REFUSES loudly — never a defaulted ceiling", () => {
  const shared = parseConcurrencyProfile(BODY, "shared");
  expect(() => stageBudgetsFor(shared, '{"profiles":{}}')).toThrow(/has no "stageBudgets" object/u);
  expect(() => stageBudgetsFor(shared, BODY.replace(/"defaultMinutes": \d+/u, '"defaultMinutes": 0'))).toThrow(/field "defaultMinutes" is 0/u);
  expect(() => stageBudgetsFor(shared, BODY.replace(/"ctSuiteWorkerMinutes": \d+/u, '"ctSuiteWorkerMinutes": "165"'))).toThrow(
    /field "ctSuiteWorkerMinutes" is "165"/u,
  );
});

test("the budget door reads the committed file end to end, per profile", () => {
  expect(readStageBudgets({})).toStrictEqual(stageBudgetsFor(parseConcurrencyProfile(BODY, "shared"), BODY));
  expect(readStageBudgets({ [DEDICATED_BOX_ENV]: "1" })).toStrictEqual(stageBudgetsFor(parseConcurrencyProfile(BODY, "dedicated"), BODY));
});

/** The committed shared row, with one field replaced or (when `value` is absent) DROPPED — the two ways an
 *  edit to the JSON breaks it. Built by rewriting the entry list rather than mutating, so the parsed body
 *  stays the oracle for every other case in this file. */
function sharedRowWith(field: string, value?: unknown): string {
  const file = JSON.parse(BODY) as { readonly profiles: Record<string, Record<string, unknown>> };
  const entries: [string, unknown][] = Object.entries(file.profiles["shared"] ?? {}).filter(([key]) => key !== field);
  if (value !== undefined) {
    entries.push([field, value]);
  }
  return JSON.stringify({ ...file, profiles: { ...file.profiles, shared: Object.fromEntries(entries) } });
}

test("worker and slot caps reject zero while the dedicated CPU quota may be zero", () => {
  for (const cap of POSITIVE_CAPS) {
    expect(() => parseConcurrencyProfile(sharedRowWith(cap, 0), "shared"), `${cap}=0 must refuse`).toThrow(/expected a positive integer/u);
  }
  expect(parseConcurrencyProfile(sharedRowWith("sessionCpuQuotaPct", 0), "shared").sessionCpuQuotaPct).toBe(0);
});

const CAPTURE_PRELOAD = `
const fs = require("node:fs");
const childProcess = require("node:child_process");
childProcess.spawnSync = (command, args, options) => {
  fs.writeFileSync(process.env.ORB_WRAPPER_CAPTURE, JSON.stringify({ command, args, cwd: options?.cwd ?? null }));
  return { status: 0 };
};
`;

interface WrapperCapture {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string | null;
}

function runWrapper(
  script: "ts7.cjs" | "eslint.cjs",
  args: readonly string[],
  box: string | undefined,
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

test("all CJS wrappers reject a malformed box switch before spawning, even with an explicit worker override", () => {
  const cases = [
    ["ts7.cjs", ["--checkers", "1", "--version"]],
    ["eslint.cjs", ["--concurrency", "off", "--version"]],
  ] as const;
  for (const [script, args] of cases) {
    const result = runWrapper(script, args, "true");
    expect(result.status, script).not.toBe(0);
    expect(result.stderr, script).toContain(`${DEDICATED_BOX_ENV}=\"true\"`);
    expect(result.capture, `${script} must refuse before spawnSync`).toBeNull();
  }
});

test("CJS wrappers derive shared/dedicated defaults and preserve explicit native worker overrides", () => {
  const tsShared = runWrapper("ts7.cjs", ["--version"], undefined).capture;
  const tsDedicated = runWrapper("ts7.cjs", ["--version"], "1").capture;
  const tsExplicit = runWrapper("ts7.cjs", ["--checkers", "1", "--version"], "1").capture;
  expect(optionValue(tsShared?.args, "--checkers")).toBe("4");
  expect(optionValue(tsDedicated?.args, "--checkers")).toBe("8");
  expect(tsExplicit?.args.filter((arg) => arg === "--checkers")).toHaveLength(1);
  expect(optionValue(tsExplicit?.args, "--checkers")).toBe("1");

  const eslintShared = runWrapper("eslint.cjs", ["--version"], undefined).capture;
  const eslintDedicated = runWrapper("eslint.cjs", ["--version"], "1").capture;
  const eslintExplicit = runWrapper("eslint.cjs", ["--concurrency", "off", "--version"], "1").capture;
  expect(optionValue(eslintShared?.args, "--concurrency")).toBe("4");
  expect(optionValue(eslintDedicated?.args, "--concurrency")).toBe("8");
  expect(eslintExplicit?.args.filter((arg) => arg === "--concurrency")).toHaveLength(1);
  expect(optionValue(eslintExplicit?.args, "--concurrency")).toBe("off");
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
    const result = runWrapper("ts7.cjs", argv, undefined);
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
    const result = runWrapper("ts7.cjs", argv, undefined);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/--incremental expects true or false|-i does not accept an equals-form value|--tsBuildInfoFile requires a path value/u);
    expect(result.capture).toBeNull();
  }
});

test("a broken profile file REFUSES loudly and names itself — never a defaulted cap", () => {
  expect(() => parseConcurrencyProfile("{ not json", "shared")).toThrow(/tooling\/concurrency-profile\.json is not valid JSON/u);
  expect(() => parseConcurrencyProfile("[]", "shared")).toThrow(/is not a JSON object/u);
  expect(() => parseConcurrencyProfile('{"profiles":{}}', "shared")).toThrow(/has no "shared" profile object/u);
  expect(() => parseConcurrencyProfile(sharedRowWith("ctWorkers"), "shared"), "a field that went missing").toThrow(/field "ctWorkers" is undefined/u);
  expect(() => parseConcurrencyProfile(sharedRowWith("vitestMaxWorkers", "4"), "shared"), "a cap that became a string").toThrow(
    /field "vitestMaxWorkers" is "4"/u,
  );
  expect(() => parseConcurrencyProfile(sharedRowWith("wholeVerifyQueue", "true"), "shared"), "a boolean that became a string").toThrow(
    /field "wholeVerifyQueue" is "true"/u,
  );
  expect(() => parseConcurrencyProfile(sharedRowWith("sessionMemoryHigh", 48), "shared"), "a size string that became a number").toThrow(
    /field "sessionMemoryHigh" is 48/u,
  );
});
