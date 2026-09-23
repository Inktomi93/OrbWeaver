// Unit: the pin-prompt spacer predicate. Pure (node), imported DIRECTLY (relative) — pin-spacer.ts
// is DOM-free so it keeps the node-only aggregator program honest (the tokens.build.ts / snap.ts precedent).
// Proves a short reply keeps the spacer (so the pinned prompt can climb to the top) and it collapses once
// the reply below the pin fills a viewport.
import { pinSpacerActive, pinSpacerSpent } from "../../../../packages/ui/src/primitives/message-list/pin-spacer.ts";
import { expect, test } from "../../../support/fixtures.ts";

const VIEWPORT = 600;

test("a fresh pin (empty reply below) needs the spacer", () => {
  expect(pinSpacerActive(VIEWPORT, 40)).toBe(true);
});

test("a reply shorter than the viewport still needs the spacer to reach the top", () => {
  expect(pinSpacerActive(VIEWPORT, 200)).toBe(true);
});

test("a reply that exactly fills the viewport no longer needs the spacer (equal = filled)", () => {
  expect(pinSpacerActive(VIEWPORT, 600)).toBe(false);
});

test("a reply taller than the viewport collapses the spacer", () => {
  expect(pinSpacerActive(VIEWPORT, 900)).toBe(false);
});

// `pinSpacerSpent` is the caller-facing half (#1384 moved the decision out of message-list.tsx so the
// primitive stayed under the 450-line cap): the same predicate, plus the two ABSENT cases that decide
// whether the caller may drop the pin at all. Those two are the point — a pin the virtualizer is not
// currently rendering has an UNKNOWN span, and treating unknown as "spent" would drop a live pin.
test("a rendered pin whose reply fills a viewport is spent", () => {
  expect(pinSpacerSpent(VIEWPORT, { start: 100, end: 200 }, { start: 600, end: 700 })).toBe(true);
});

test("a rendered pin whose reply is still short is NOT spent", () => {
  expect(pinSpacerSpent(VIEWPORT, { start: 100, end: 200 }, { start: 300, end: 400 })).toBe(false);
});

test("a pin the virtualizer is not rendering is never spent (unknown span, not a zero one)", () => {
  expect(pinSpacerSpent(VIEWPORT, undefined, { start: 600, end: 700 })).toBe(false);
});

test("an empty rendered window is never spent", () => {
  expect(pinSpacerSpent(VIEWPORT, { start: 100, end: 200 }, undefined)).toBe(false);
});
