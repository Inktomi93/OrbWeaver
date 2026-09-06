// The ONE home for the fleet's worker/slot caps (tooling/concurrency-profile.json + its typed door,
// tooling/src/_shared/concurrency-profile.ts). Home per Spine-Testing §2: a tooling module's test lives in
// tests/tooling/.
//
// WHAT THIS SUITE IS FOR (#1835). The committed JSON is read by FOUR unrelated languages — bash (two
// hooks, via jq), CommonJS (scripts/ts7.cjs, scripts/typecheck.cjs), TypeScript configs (vitest,
// playwright-ct) and the verify tree — and only this one of them has a type checker. So the file's SHAPE is
// pinned here: a profile that lost a field, or grew a string where a cap belongs, would otherwise reach the
// bash readers as an empty jq result and the TS readers as `NaN` workers, which vitest reads as UNLIMITED —
// i.e. the exact box saturation the file exists to cap, delivered by the file meant to prevent it.
//
// The two profiles are pinned by RELATION, not by literal, wherever a literal would just re-spell the JSON:
// the point of `dedicated` is that it is never STRICTER than `shared`. The handful of absolute numbers below
// are the ones that OTHER law quotes by value (the shared-host defaults the doctrine text now promises) —
// changing one of those is a doctrine edit, and this suite is what says so.
import { readFileSync } from "node:fs";
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
  // COUPLED PROSE, STILL STALE AT THIS COMMIT: .claude/rules/lane-standing-facts.md and
  // .claude/agent-doctrine.md both quote "CT 2" by value. This lane may not edit `.claude/**` beyond the
  // worktree-remove hook, so the prose edit is owed by the integrator — this comment is the receipt.
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
