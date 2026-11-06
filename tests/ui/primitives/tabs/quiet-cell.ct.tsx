// A quiet cell dims only while it rests: its hover ink and its focus ring keep full strength.
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { QuietCellStory } from "./_quiet-cell-stories.tsx";

const STORY = "tests/ui/primitives/tabs/_quiet-cell-stories/QuietCellStory";

function opacity(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).opacity);
}

test("a resting quiet cell takes the quiet step, a hovered or focused one is at full strength", async ({ mount, page }) => {
  const component = await mount<typeof QuietCellStory>(STORY);
  const first = component.locator('[data-case="first"]');
  const second = component.locator('[data-case="second"]');
  const quiet = await opacity(component.locator('[data-probe="quiet"]'));
  expect(Number(quiet)).toBeLessThan(1);
  expect(await opacity(first), "resting").toBe(quiet);
  expect(await opacity(second), "resting").toBe(quiet);

  await second.hover();
  expect(await opacity(second), "hovered").toBe("1");
  expect(await opacity(first), "its sibling keeps resting").toBe(quiet);

  await page.mouse.move(0, 0);
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();
  expect(await opacity(first), "keyboard focus").toBe("1");
  expect(await opacity(second), "its sibling keeps resting").toBe(quiet);
});
