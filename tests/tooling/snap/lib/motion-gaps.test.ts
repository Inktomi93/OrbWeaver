// @instrument-proof: `--motion`'s argv-position hints fire on a run that already could not measure, and
// each names the arm or the argv the operator actually wanted.
// @instrument-absence-proof: neither hint fires on a shape where the queue position is correct — a hint on
// a legitimate run is noise that trains an operator to ignore the gap list.
//
// #2439: `snap <route> --wheel-burst <sel>=100:10 --motion` reports `frames-raw=0/0 measured-input=0` and
// refuses. That is the CORRECT arithmetic over an EMPTY window and it reads as a smooth one: `--motion`
// takes its own argv position, and a selector-less window opens after the reach actions AND after
// `__orb.resetEvidence()`, so every frame the burst caused is discarded before the window starts. The fix
// is a hint, NOT a parse-time refusal — the same ruling `motionQueueHint`'s own header records for the
// mirror-image case, and for the same reason: wheeling to load more rows and then measuring the window
// their arrival animates is a legitimate run, so refusing the combination would delete a capability to fix
// a misread. The first test below pins BOTH halves: the combination parses clean, and the hint exists.
// Both hints are attached only to a run that already has a gap (ops/arms/motion.ts).
//
// Every fixture comes out of the REAL argv parser rather than a hand-shaped `Args`, so the queue positions
// under test are the ones snap actually builds.
import type { Args } from "../../../../tooling/src/snap/contract/types.ts";
import { parseSnapArgs } from "../../../../tooling/src/snap/index.ts";
import { motionPrecedingInputHint, motionQueueHint, orderMotionGaps } from "../../../../tooling/src/snap/lib/motion-gaps.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

// A REAL rendered selector, and deliberately not a `data-testid` one: these fixtures only exercise the
// argv parser, and a testid nothing mints would be a dead selector promise (`testid-liveness` A1).
const BURST = '[data-slot="message-list-scroll"]=100:10';

/** The queue position `--motion` took, which is what both hints are keyed on. */
function motionIndex(args: Args): number {
  return args.actions.findIndex((entry) => entry.type === "step" && entry.action.kind === "motion-click");
}

test("a wheel burst before a selector-less --motion parses clean and is NAMED, with the arm that can measure it (#2439)", () => {
  const args = parseSnapArgs(["/", "--goto", "chats", "--wheel-burst", BURST, "--motion"]);
  // Half one of the ruling: this is not misuse, so it must not refuse at parse.
  expect(args.errors).toEqual([]);

  const hint = motionPrecedingInputHint(args, motionIndex(args), null);
  expect(hint?.evidence).toBe("the measured input");
  expect(hint?.detail).toContain("--wheelburst");
  expect(hint?.detail).toContain("resetEvidence");
  // Half two: the operator is told an empty window is not a smooth one, and where to go instead.
  expect(hint?.detail).toContain("not a smooth one");
  expect(hint?.detail).toContain("--perf");
  expect(hint?.detail).toContain("--cpu-profile");
});

test("the nav that merely reaches the surface is not an input, so an ordinary entry window is silent (#2439 control)", () => {
  const reached = parseSnapArgs(["/", "--goto", "chats", "--motion"]);
  expect(motionPrecedingInputHint(reached, motionIndex(reached), null)).toBeNull();

  const paused = parseSnapArgs(["/", "--goto", "chats", "--pause", "200", "--motion"]);
  expect(motionPrecedingInputHint(paused, motionIndex(paused), null)).toBeNull();

  const bare = parseSnapArgs(["/", "--motion"]);
  expect(motionPrecedingInputHint(bare, motionIndex(bare), null)).toBeNull();
});

test("a selector-bearing --motion dispatches its own click inside the trace, so the reach input is just reach (#2439 control)", () => {
  const args = parseSnapArgs(["/", "--goto", "chats", "--wheel-burst", BURST, "--motion", '[data-slot="composer-chat-actions"]']);

  expect(motionPrecedingInputHint(args, motionIndex(args), '[data-slot="composer-chat-actions"]')).toBeNull();
});

test("the REFUSED gap list leads with the CAUSE, not with the zero-frame arithmetic it produced (#2464)", () => {
  // The shape the owner read as "headless cannot composite": an empty window refuses on a zero frame
  // POPULATION, and that line printed first reads as a browser limitation. The hint is the reason the
  // window was empty, so it goes first.
  const frameRefusal = { evidence: "a composited frame population", detail: "frames-raw=0/0" };
  const args = parseSnapArgs(["/", "--goto", "chats", "--wheel-burst", BURST, "--motion"]);
  const hint = motionPrecedingInputHint(args, motionIndex(args), null);
  expect(hint).not.toBeNull();

  const ordered = orderMotionGaps([frameRefusal], hint === null ? [] : [hint]);
  expect(ordered[0]?.evidence).toBe("the measured input");
  expect(ordered.at(-1)).toEqual(frameRefusal);

  // The gating is unchanged and is the control: a window that MEASURED gets no hint at all, so a clean run
  // never grows a lecture — and an ordering that leaked one would fail here.
  expect(orderMotionGaps([], hint === null ? [] : [hint])).toEqual([]);
});

test("the sibling queue hint still owns the mirror-image case, and neither hint claims the other's shape", () => {
  const early = parseSnapArgs(["/", "--motion", "--wheel-burst", BURST]);
  const earlyHint = motionQueueHint(early, motionIndex(early));
  expect(earlyHint?.evidence).toBe("a settled surface to measure");
  expect(earlyHint?.detail).toContain("ARGV ORDER");

  // A run whose motion step is last has no following action to warn about.
  const late = parseSnapArgs(["/", "--goto", "chats", "--wheel-burst", BURST, "--motion"]);
  expect(motionQueueHint(late, motionIndex(late))).toBeNull();
});
