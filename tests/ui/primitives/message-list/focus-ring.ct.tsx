import { expect, test } from "@playwright/test";
import type { MessageListFocusRingStory } from "./_focus-ring-stories.tsx";

const ROW = '[data-slot="message-list-row"]';
const STORY = "tests/ui/primitives/message-list/_focus-ring-stories/MessageListFocusRingStory";

// A row's focus outline is clipped by the log's scrollport wherever it would paint outside the port. The rows fill the
// port's width, so the sides are the clip's whole job; a row taller than the port has its head on the port's edge.
test.describe("a focused transcript row keeps its whole focus outline inside the scrollport", () => {
  for (const [name, keys, index] of [
    ["a short row", ["ArrowDown", "ArrowDown"], 2],
    ["a row taller than the port, reached from above", ["ArrowDown"], 1],
    ["a row taller than the port, reached from below", ["ArrowDown", "ArrowDown", "ArrowUp"], 1],
  ] as const) {
    test(name, async ({ mount, page }) => {
      await mount<typeof MessageListFocusRingStory>(STORY);
      const log = page.getByRole("log", { name: "Focus ring", exact: true });
      await expect(log.locator(ROW).first()).toBeVisible();
      await page.getByRole("button", { name: "Before the list", exact: true }).focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Home");
      await expect(log.locator(`${ROW}[data-index="0"]`)).toBeFocused();
      for (const key of keys) {
        await page.keyboard.press(key);
      }
      const focused = log.locator(`${ROW}[data-index="${String(index)}"]`);
      await expect(focused).toBeFocused();
      await expect(focused).toHaveCSS("outline-style", "solid");
      const slack = await focused.evaluate((node) => {
        const style = getComputedStyle(node);
        const port = node.closest('[data-slot="message-list-scroll"]')?.getBoundingClientRect();
        const box = node.getBoundingClientRect();
        if (port === undefined) {
          throw new Error("the row has no scrollport");
        }
        // The painted band spans offset to offset + width outside the border box; a negative offset moves it in.
        const reach = Math.max(0, Number.parseFloat(style.outlineOffset) + Number.parseFloat(style.outlineWidth));
        return {
          width: Number.parseFloat(style.outlineWidth),
          left: box.left - reach - port.left,
          right: port.right - (box.right + reach),
          // A head or a foot the port shows is a side the reader looks for the outline on; one it scrolled past owes nothing.
          top: box.top >= port.top ? box.top - reach - port.top : 0,
          bottom: box.bottom <= port.bottom ? port.bottom - (box.bottom + reach) : 0,
        };
      });
      expect(slack.width).toBeGreaterThan(0);
      expect(slack.left).toBeGreaterThanOrEqual(0);
      expect(slack.right).toBeGreaterThanOrEqual(0);
      expect(slack.top).toBeGreaterThanOrEqual(0);
      expect(slack.bottom).toBeGreaterThanOrEqual(0);
    });
  }
});
