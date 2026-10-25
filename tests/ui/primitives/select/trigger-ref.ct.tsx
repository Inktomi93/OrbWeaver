import { expect, test } from "@playwright/test";
import type { SelectTriggerRefStory } from "./_trigger-ref-stories.tsx";

test("the public trigger ref restores focus and releases its unmounted node", async ({ mount, page }) => {
  await mount<typeof SelectTriggerRefStory>("tests/ui/primitives/select/_trigger-ref-stories/SelectTriggerRefStory");
  const picker = page.getByRole("combobox", { name: "Choice", exact: true });
  await expect(picker).toHaveText("Alpha");
  await page.getByRole("button", { name: "Return to picker", exact: true }).click();
  await expect(picker).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.getByRole("option", { name: "Beta", exact: true }).click();
  await expect(picker).toHaveText("Beta");
  await page.getByRole("button", { name: "Inspect trigger", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Attached");
  await expect(picker).toHaveText("Beta");
  await page.getByRole("button", { name: "Toggle picker", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await page.getByRole("button", { name: "Inspect trigger", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Released");
});
