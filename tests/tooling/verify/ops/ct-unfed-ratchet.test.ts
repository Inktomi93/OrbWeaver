// THE PERMANENT PIN for the unfed-read ratchet (#637) — the fixtures that reproduce every arm land as a
// committed test, not a one-time probe receipt, so the enforcement cannot silently regress.
//
// WHAT IT DEFENDS. The #629 census found 14 chat CT files mounting trees whose display-script and
// send-availability pipelines ran INERT (routeTrpc answers an unlisted procedure `null` by design, and
// `null` is not a view). #637 fed them and turned the census into a ratchet. Everything below is an arm that,
// if it stopped working, would leave the ratchet reading green while the debt came back:
//   • NEW — an observed unfed read with no committed row must RED. This is the whole point.
//   • SHRINK — a committed row whose read is gone must RED demanding the baseline shrink, so an allowance
//     cannot outlive the thing it admitted.
//   • SCOPED-RUN SAFETY — the shrink arm must NOT fire for a baselined file the run never executed, or every
//     `pnpm test:ct <one dir>` would red the whole ledger and the ratchet would be unusable in a lane.
//   • BLIND CENSUS — a file that ran, whose source calls `routeTrpc(`, and which produced no `ACTIVE` marker
//     must REFUSE. Without this, killing the marker turns the ratchet into a permanent false clean — the
//     single most common way an instrument in this repo lies.
//   • MALFORMED / DEAD LEDGER — an unreadable row must REFUSE (never read as zero admitted), and a row
//     naming a CT file that is off the tree must RED (no run can ever retire it).
// The GREEN control is here too: a baselined read that is still observed, in a file that ran and announced
// itself, is silent — an assertion that can only fail is not a fence, it is a wall.
import { parseBudgetMap } from "@orb/tooling/_shared/ratchet-rows";
import type { UnfedRunObservation } from "../../../../tooling/src/verify/ops/ct-unfed-ratchet.ts";
import { judgeUnfedReads, subjectOf } from "../../../../tooling/src/verify/ops/ct-unfed-ratchet.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const FILE = "tests/client/features/chat/components/composer.ct.tsx";
const OTHER = "tests/client/features/chat/surfaces/chat-room-surface.ct.tsx";
const PROC = "settings.getUserSettings";

/** A run in which `files` executed, every one of them announced the census instrument, and `unfed` was seen. */
function run(files: readonly string[], unfed: Readonly<Record<string, readonly string[]>> = {}): UnfedRunObservation {
  return {
    executedFiles: files,
    instrumentedFiles: new Set(files),
    unfedByFile: new Map(Object.entries(unfed)),
  };
}

/** Every executed file calls `routeTrpc(` and is on the tree — the ordinary case, so a test that wants a
 *  blind-census or dead-allowance arm opts INTO it rather than every other test opting out. */
const LIVE_TREE = { owesMarker: (): boolean => true, fileExists: (): boolean => true };

const EMPTY = parseBudgetMap({});
const ADMITS_ONE = parseBudgetMap({ [subjectOf(FILE, PROC)]: { count: 1, why: "declared: this mount deliberately does not exercise the settings tier" } });

test("NEW: an observed unfed read with no committed row REDS, and the diagnostic names the file, the procedure and both remedies", () => {
  const verdict = judgeUnfedReads(run([FILE], { [FILE]: [PROC] }), EMPTY, LIVE_TREE);

  expect(verdict.refusals).toEqual([]);
  expect(verdict.violations).toHaveLength(1);
  const [only = ""] = verdict.violations;
  expect(only).toContain(FILE);
  expect(only).toContain(PROC);
  // A diagnostic that names the defect but not the way out is a diagnostic the next agent works around.
  expect(only).toContain("FEED");
  expect(only).toContain("DECLARE");
});

test("GREEN: a baselined read that is still observed, in a file that ran and announced itself, is silent", () => {
  const verdict = judgeUnfedReads(run([FILE], { [FILE]: [PROC] }), ADMITS_ONE, LIVE_TREE);

  expect(verdict).toEqual({ refusals: [], violations: [] });
});

test("SHRINK: a baselined read the file no longer makes REDS demanding the row be deleted", () => {
  const verdict = judgeUnfedReads(run([FILE]), ADMITS_ONE, LIVE_TREE);

  expect(verdict.refusals).toEqual([]);
  expect(verdict.violations).toHaveLength(1);
  expect(verdict.violations[0]).toContain("STALE UNFED-READ ALLOWANCE");
  expect(verdict.violations[0]).toContain(subjectOf(FILE, PROC));
});

test("SCOPED-RUN SAFETY: a baselined file the run never executed is skipped — not shrunk, not admitted", () => {
  // The lane spelling: `pnpm test:ct <one dir>`. Without this arm every scoped run would red the ledger.
  const verdict = judgeUnfedReads(run([OTHER]), ADMITS_ONE, LIVE_TREE);

  expect(verdict).toEqual({ refusals: [], violations: [] });
});

test("SCOPED-RUN SAFETY: nor does a file that ran WITHOUT the instrument ever retire its row (it was not observed)", () => {
  const blind: UnfedRunObservation = { executedFiles: [FILE], instrumentedFiles: new Set(), unfedByFile: new Map() };

  const verdict = judgeUnfedReads(blind, ADMITS_ONE, LIVE_TREE);

  // It refuses (below) rather than silently shrinking — but the point here is that it does NOT report a shrink.
  expect(verdict.violations).toEqual([]);
});

test("BLIND CENSUS: a file that ran, calls routeTrpc, and announced nothing REFUSES — its zero is not a verdict", () => {
  const blind: UnfedRunObservation = { executedFiles: [FILE], instrumentedFiles: new Set(), unfedByFile: new Map() };

  const verdict = judgeUnfedReads(blind, EMPTY, LIVE_TREE);

  expect(verdict.violations).toEqual([]);
  expect(verdict.refusals).toHaveLength(1);
  expect(verdict.refusals[0]).toContain("BLIND CENSUS");
  expect(verdict.refusals[0]).toContain(FILE);
});

test("BLIND CENSUS does NOT fire for a file that simply does not use the stub", () => {
  const noStub: UnfedRunObservation = { executedFiles: [FILE], instrumentedFiles: new Set(), unfedByFile: new Map() };

  const verdict = judgeUnfedReads(noStub, EMPTY, { owesMarker: (): boolean => false, fileExists: (): boolean => true });

  expect(verdict).toEqual({ refusals: [], violations: [] });
});

test("MALFORMED LEDGER: a row that is not `<file> :: <proc>` REFUSES rather than reading as zero admitted", () => {
  const verdict = judgeUnfedReads(run([FILE]), parseBudgetMap({ "just-a-filename.ct.tsx": 1 }), LIVE_TREE);

  expect(verdict.refusals).toHaveLength(1);
  expect(verdict.refusals[0]).toContain("MALFORMED LEDGER ROW");
});

test("MALFORMED LEDGER: a row whose count is not 1 REFUSES — every row is exactly ONE (file, procedure) membership", () => {
  const verdict = judgeUnfedReads(run([FILE]), parseBudgetMap({ [subjectOf(FILE, PROC)]: 3 }), LIVE_TREE);

  expect(verdict.refusals).toHaveLength(1);
  expect(verdict.refusals[0]).toContain("count 3");
});

test("DEAD ALLOWANCE: a row naming a CT file that is off the tree REDS — no run could ever retire it", () => {
  const verdict = judgeUnfedReads(run([OTHER]), ADMITS_ONE, { owesMarker: (): boolean => true, fileExists: (): boolean => false });

  expect(verdict.violations).toHaveLength(1);
  expect(verdict.violations[0]).toContain("DEAD UNFED-READ ALLOWANCE");
  expect(verdict.violations[0]).toContain(FILE);
});
