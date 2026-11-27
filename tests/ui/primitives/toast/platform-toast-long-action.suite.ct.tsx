// @subject packages/ui/src/primitives/toast/toast.tsx
// The notice's one door must stay reachable when its reason outgrows the stack's capped height. A phone at an enlarged root is where it
// does: the cap is a share of the screen, and the reason grows with the text. The engines clip a scrolling stack alike, so the case runs on each.

import { ALERTS_REGION_NAME } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { ToastActionStory } from "./_transition-stories.tsx";

const STORY = "tests/ui/primitives/toast/_transition-stories/ToastActionStory";
const LINES = 24;

test.use({ viewport: { width: 390, height: 844 } });

test("a notice taller than the stack's cap keeps its action inside the stack's box and pressable", async ({ mount, page }) => {
  const reason = Array.from({ length: LINES }, (_, index) => `Reason line ${String(index + 1)} of a long notice.`).join(" ");
  await page.addInitScript(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await mount<typeof ToastActionStory>(STORY, { reason });
  await page.getByRole("button", { name: "Add long toast", exact: true }).click();
  const stack = page.getByRole("region", { name: ALERTS_REGION_NAME, exact: true });
  const action = page.locator('[data-slot="toast-action"]');
  await expect(action).toBeVisible();
  // The positive control: the notice really is taller than the stack that holds it, so the action's resting place is past the clip.
  await expect.poll(() => stack.evaluate((node) => node.scrollHeight - node.clientHeight)).toBeGreaterThan(0);
  await expect
    .poll(async () => {
      const [box, frame] = await Promise.all([action.boundingBox(), stack.boundingBox()]);
      return box !== null && frame !== null && box.y >= frame.y && box.y + box.height <= frame.y + frame.height;
    })
    .toBe(true);
  await action.click();
  await expect(page.getByText("Door presses: 1", { exact: true })).toBeVisible();
});
