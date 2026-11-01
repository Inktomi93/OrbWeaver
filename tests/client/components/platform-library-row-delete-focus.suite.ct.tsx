import { ROW_DELETE_NAME } from "@orb/client/lib";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { Page } from "@playwright/test";
import type { RemovableRowsStory } from "./_library-list-rows-focus-stories.tsx";

const STORY = "tests/client/components/_library-list-rows-focus-stories/RemovableRowsStory";
const IDS = ["a", "b", "c", "d"];

async function confirmDelete(page: Page, id: string): Promise<void> {
  const row = page.locator('[data-slot="list-row-root"]').filter({ hasText: `Row ${id}` });
  await row.hover();
  await row.getByRole("button", { name: /^Actions for/u }).click();
  await page.getByRole("menuitem", { name: ROW_DELETE_NAME, exact: true }).click();
}

test("confirming a delete in a virtualized list hands focus to the next row, then the one before it", async ({ page, mount }) => {
  await mount<typeof RemovableRowsStory>(STORY, { ids: IDS });
  await confirmDelete(page, "b");
  await page.getByRole("alertdialog").getByRole("button", { name: ROW_DELETE_NAME, exact: true }).click();
  await expect(page.getByRole("button", { name: /^Row b/u })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Row c/u }).first()).toBeFocused();
  await confirmDelete(page, "d");
  await page.getByRole("alertdialog").getByRole("button", { name: ROW_DELETE_NAME, exact: true }).click();
  await expect(page.getByRole("button", { name: /^Row c/u }).first()).toBeFocused();
});

test("a cancelled delete returns focus to its own trigger", async ({ page, mount }) => {
  await mount<typeof RemovableRowsStory>(STORY, { ids: IDS });
  await confirmDelete(page, "b");
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page
      .locator('[data-slot="list-row-root"]')
      .filter({ hasText: "Row b" })
      .getByRole("button", { name: /^Actions for/u }),
  ).toBeFocused();
});

test("a search that shrinks the list does not take focus from the search box", async ({ page, mount }) => {
  await mount<typeof RemovableRowsStory>(STORY, { ids: IDS });
  const row = page.getByRole("button", { name: /^Row c/u }).first();
  await row.focus();
  const search = page.getByRole("textbox", { name: "Search rows", exact: true });
  await search.click();
  await search.fill("a");
  await expect(page.getByRole("button", { name: /^Row c/u })).toHaveCount(0);
  await expect(search).toBeFocused();
});

test("a row dropped elsewhere after the user clicked away does not take focus", async ({ page, mount }) => {
  await mount<typeof RemovableRowsStory>(STORY, { ids: IDS });
  await page
    .getByRole("button", { name: /^Row b/u })
    .first()
    .focus();
  const elsewhere = page.getByRole("button", { name: "Remove elsewhere", exact: true });
  await elsewhere.click();
  await expect(page.getByRole("button", { name: /^Row d/u })).toHaveCount(0);
  await expect(elsewhere).toBeFocused();
});
