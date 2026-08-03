// Unit: the pin-prompt spacer predicate (PD-147). Pure (node), imported DIRECTLY (relative) — pin-spacer.ts
// is DOM-free so it keeps the node-only aggregator program honest (the tokens.build.ts / snap.ts precedent).
// Proves a short reply keeps the spacer (so the pinned prompt can climb to the top) and it collapses once
// the reply below the pin fills a viewport.
import { pinSpacerActive } from "../../../../packages/ui/src/primitives/message-list/pin-spacer.ts";
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
