// A body past the render guard draws as plain text before any markup reader runs over it: a member's multi-megabyte
// message costs a viewer's main thread no strip on the untrusted path.
// @subject packages/ui/src/markdown/markdown.tsx

import { expect, test } from "@playwright/test";
import type { OversizedBodyStory } from "./_oversized-body-stories.tsx";

const STORY = "tests/ui/markdown/_oversized-body-stories/OversizedBodyStory";
// Openers that never close: the costliest shape for a markup reader, which is linear in the body.
const PANEL = "<div\n\n";
const BODY_CHARS = 4_000_000;
const DRAW_LABEL = "Draw the body";
const DRAWN_KEY = "orbOversizedDrawnAt";
// The press, one commit of a plain pre and its layout, measured near 35 ms; a markup read of the body first costs about
// a second.
const BUDGET_MS = 300;

test("an oversized untrusted body draws as its own text within the budget", async ({ mount, page }) => {
  const repeat = Math.ceil(BODY_CHARS / PANEL.length);
  const component = await mount<typeof OversizedBodyStory>(STORY, { unit: PANEL, repeat, drawLabel: DRAW_LABEL, drawnKey: DRAWN_KEY });
  const pressedAt = await page.evaluate(() => performance.now());
  await component.getByRole("button", { name: DRAW_LABEL, exact: true }).click();
  const oversized = component.locator('[data-slot="markdown-oversized"]');
  await expect(oversized).toHaveCount(1);
  const drawnAt = await page.evaluate((key) => Number(document.documentElement.dataset[key]), DRAWN_KEY);

  // The body drew whole as text: its markup was never parsed into elements.
  expect(await oversized.evaluate((node) => node.textContent.length)).toBe(PANEL.length * repeat);
  expect(drawnAt - pressedAt).toBeLessThan(BUDGET_MS);
});
