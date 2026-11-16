// The panel readers read a drawn body only up to their bound, and the speaker guard only where the body may frame: a
// member's multi-megabyte message costs a viewer no read at all. Under the bound a panel is found on either tier, for
// the frame or for the plain notice.
// @subject packages/client/src/features/chat/lib/reply-parts.ts

import { MESSAGE_TEXT_MAX_CHARS } from "@orb/contracts/chat";
import { expect, test } from "@orb/testkit/node";
import { PANEL_READ_MAX_CHARS, readPanels } from "#client/features/chat/lib/reply-parts.ts";

// Openers that never close: the costliest shape for the readers, each linear in the body (seconds at this length).
const UNIT = "<div\n\n";
const PANEL = '<div style="color:red">HP 10</div>';
const HUGE = UNIT.repeat(Math.floor(MESSAGE_TEXT_MAX_CHARS / UNIT.length));
// Answering without a read is one comparison; any read of a body this long takes far longer.
const BUDGET_MS = 50;
// The same openers filling the bound read in about 0.9 s on a sandboxed row; a read that turns quadratic takes minutes.
const AT_BOUND = `${UNIT.repeat(Math.floor((PANEL_READ_MAX_CHARS - PANEL.length) / UNIT.length))}${PANEL}`;
const AT_BOUND_BUDGET_MS = 3000;

test.each([
  ["a plain row", "tierA"],
  ["a sandboxed row", "tierB"],
] as const)("%s answers a multi-megabyte body within the budget, reading nothing", (_name, cardTier) => {
  const started = performance.now();
  const read = readPanels(HUGE, { cardTier, lenientCards: false });
  const elapsedMs = performance.now() - started;

  expect(read.modelPanel).toBe(false);
  expect(elapsedMs).toBeLessThan(BUDGET_MS);
});

test("a sandboxed body of openers filling the bound is read within its budget", () => {
  const started = performance.now();
  const read = readPanels(AT_BOUND, { cardTier: "tierB", lenientCards: false });
  const elapsedMs = performance.now() - started;

  // Positive control: the body is read to its end, where its one panel sits.
  expect(read.modelPanel).toBe(true);
  expect(AT_BOUND.length).toBeLessThanOrEqual(PANEL_READ_MAX_CHARS);
  expect(elapsedMs).toBeLessThan(AT_BOUND_BUDGET_MS);
});

test("past the bound a sandboxed body is opaque whole, so no speaker label splits markup nothing read", () => {
  const body = `${PANEL}\n\n${"x".repeat(PANEL_READ_MAX_CHARS)}`;

  expect(readPanels(body, { cardTier: "tierB", lenientCards: false })).toEqual({ opaque: [{ start: 0, end: body.length }], modelPanel: false });
});

test("under the bound a panel is found on either tier, and only the sandboxed one guards it from the speaker split", () => {
  // Positive control: the same panel the bound hides.
  expect(readPanels(PANEL, { cardTier: "tierB", lenientCards: false })).toEqual({ opaque: [{ start: 0, end: PANEL.length }], modelPanel: true });
  expect(readPanels(PANEL, { cardTier: "tierA", lenientCards: false })).toEqual({ opaque: [], modelPanel: true });
});
