// The pure verdicts behind design-audit's isolated-stage mode (#678): argv conflicts, the run label, and
// the refusal copy. Every arm is pinned in BOTH directions — the conflict must fire AND the legal
// combinations must stay silent, because a fence that refuses everything is as useless as one that refuses
// nothing, and either way a lane loses the branch-side receipt this mode exists to make possible.
import { parseAuditArgs, stageArgErrors, stageBootedByThisRun, stageLabel, unknownRefRefusal } from "../../../../tooling/src/ui-audit/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("--base beside a stage flag is misuse — two answers to WHERE is never resolved by a default", () => {
  expect(stageArgErrors({ isolated: true, dirty: false, ref: null, baseExplicit: true })).toHaveLength(1);
  expect(stageArgErrors({ isolated: true, dirty: false, ref: null, baseExplicit: true })[0]).toContain("--base");
});

test("--ref beside --dirty is misuse — a commit and the working tree are two different trees", () => {
  expect(stageArgErrors({ isolated: true, dirty: true, ref: "abc1234", baseExplicit: false })).toHaveLength(1);
});

test("the legal combinations are silent — the fence does not eat the mode", () => {
  // --isolated alone (HEAD), --ref alone, --dirty alone, and a bare --base run with no stage at all.
  expect(stageArgErrors({ isolated: true, dirty: false, ref: null, baseExplicit: false })).toEqual([]);
  expect(stageArgErrors({ isolated: true, dirty: false, ref: "HEAD~1", baseExplicit: false })).toEqual([]);
  expect(stageArgErrors({ isolated: true, dirty: true, ref: null, baseExplicit: false })).toEqual([]);
  expect(stageArgErrors({ isolated: false, dirty: false, ref: null, baseExplicit: true })).toEqual([]);
});

test("the RESULT label names the tree that was measured — `live` only when no stage served it", () => {
  expect(stageLabel(null)).toBe("live");
  expect(stageLabel("abc1234")).toBe("abc1234");
});

test("the unknown-ref refusal names the ref AND says no audit ran — a silent fallback is the bug", () => {
  const copy = unknownRefRefusal("no-such-branch");
  expect(copy).toContain("no-such-branch");
  expect(copy).toContain("no audit was run");
});

// @instrument-absence-proof: a run that BOOTED the stage cannot be believed — measured on the #678 receipt
// run, the boot-run walk censused 14 nodes and printed `findings=0 … exit 0` over a planted 1:1 contrast
// defect that the very next (warm) run REDed on at census 332. A partial census is not a small verdict, it
// is a FALSE CLEAN, and it slips the census/reach gaps because 14 and 1 are not zero. So the discriminator
// must be exact rather than a timing heuristic: the boot path stamps `startedAt` while we wait on it.
test("a stage this run BOOTED is cold — its stamp is at-or-after the moment we asked for it", () => {
  const t0 = Date.parse("2026-08-25T04:00:00.000Z");
  expect(stageBootedByThisRun("2026-08-25T04:00:12.000Z", t0)).toBe(true);
  expect(stageBootedByThisRun("2026-08-25T04:00:00.000Z", t0)).toBe(true);
});

test("a REUSED warm stage carries the ORIGINAL boot stamp — it is not refused", () => {
  const t0 = Date.parse("2026-08-25T04:00:00.000Z");
  expect(stageBootedByThisRun("2026-08-25T03:41:07.000Z", t0)).toBe(false);
  // An unparseable stamp must not manufacture a refusal out of nothing — the run proceeds and the caller
  // still has the printed warm-up note. (The opposite default would make an old marker unusable forever.)
  expect(stageBootedByThisRun("not-a-date", t0)).toBe(false);
});

// ── the parse arms (the flags are only useful if they reach the stage resolver) ──────────────────────────

test("--ref/--dirty/--fresh each imply --isolated, and --ref carries its value", () => {
  expect(parseAuditArgs(["--ref", "abc1234"])).toMatchObject({ isolated: true, ref: "abc1234" });
  expect(parseAuditArgs(["--dirty"])).toMatchObject({ isolated: true, dirty: true });
  expect(parseAuditArgs(["--fresh"])).toMatchObject({ isolated: true, fresh: true });
  expect(parseAuditArgs(["/library"])).toMatchObject({ isolated: false, ref: null, route: "/library" });
});

test("--ref with no value is misuse before anything runs — a bare --ref must not stage HEAD silently", () => {
  expect(parseAuditArgs(["--ref"]).errors.join("\n")).toContain("--ref requires a value");
});

test("the conflict verdict rides the parse, not just the helper", () => {
  expect(parseAuditArgs(["--isolated", "--base", "http://127.0.0.1:5173"]).errors).toHaveLength(1);
  // Flag ORDER must not change the verdict — the check runs over the finished argv.
  expect(parseAuditArgs(["--base", "http://127.0.0.1:5173", "--isolated"]).errors).toHaveLength(1);
});
