// Combobox turns typed text into chips: Enter and comma commit, a pasted list splits, duplicates and the cap are refused.
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { FreeTextChipsStory, RerenderingParentStory } from "./combobox-chips-stories.tsx";

const STORIES = "tests/ui/primitives/combobox/combobox-chips-stories";

const input = (page: Page): Locator => page.locator('[data-slot="combobox-input"]');
const chips = (page: Page): Locator => page.locator('[data-slot="combobox-chip"]');
const committed = (page: Page): Locator => page.getByRole("status", { name: "Committed chips" });

test("Enter commits typed text, a pasted list splits on commas, and duplicates are dropped", async ({ mount, page }) => {
  await mount<typeof FreeTextChipsStory>(`${STORIES}/FreeTextChipsStory`, {});
  await input(page).fill("red, green ,red,  ");
  await input(page).press("Enter");
  await expect(committed(page)).toHaveText("red|green");
  await expect(chips(page)).toHaveCount(2);
  await expect(input(page)).toHaveValue("");

  await input(page).fill("red");
  await input(page).press("Enter");
  await expect(committed(page)).toHaveText("red|green");
  await expect(page.getByRole("status", { name: "Change count" })).toHaveText("1");
});

test("typing a comma commits the text before it", async ({ mount, page }) => {
  await mount<typeof FreeTextChipsStory>(`${STORIES}/FreeTextChipsStory`, {});
  await input(page).pressSequentially("amber,");
  await expect(committed(page)).toHaveText("amber");
  await expect(input(page)).toHaveValue("");
});

test("the cap refuses further chips but a chip can still be removed to make room", async ({ mount, page }) => {
  await mount<typeof FreeTextChipsStory>(`${STORIES}/FreeTextChipsStory`, { maxItems: 2 });
  await input(page).fill("a,b,c");
  await input(page).press("Enter");
  await expect(committed(page)).toHaveText("a|b");

  await input(page).fill("d");
  await input(page).press("Enter");
  await expect(committed(page)).toHaveText("a|b");

  await chips(page).first().locator('[data-slot="combobox-chip-remove"]').click();
  await expect(committed(page)).toHaveText("b");
  await input(page).fill("d");
  await input(page).press("Enter");
  await expect(committed(page)).toHaveText("b|d");
});

test("a parent that re-renders with fresh arrays keeps its chips and keeps accepting entries", async ({ mount, page }) => {
  await mount<typeof RerenderingParentStory>(`${STORIES}/RerenderingParentStory`);
  await expect(chips(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Rerender parent" }).click();
  await page.getByRole("button", { name: "Rerender parent" }).click();
  await expect(page.getByRole("status", { name: "Parent renders" })).toHaveText("2");
  await expect(chips(page)).toHaveCount(1);
  await expect(committed(page)).toHaveText("ember");
  await input(page).fill("cinder");
  await input(page).press("Enter");
  await expect(committed(page)).toHaveText("ember|cinder");
  await expect(chips(page)).toHaveCount(2);
});
