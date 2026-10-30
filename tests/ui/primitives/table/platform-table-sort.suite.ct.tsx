// Table derives sort order, aria-sort and paging from its data; a feature surface never reaches the null placement or a controlled sort.
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { ControlledSortTableStory, PagedTableStory, SortableTableStory } from "./table-sort-stories.tsx";

const STORIES = "tests/ui/primitives/table/table-sort-stories";

/** The first column of every body row, in rendered order. */
function names(page: Page): Promise<(string | null)[]> {
  return page.locator('[data-slot="table-row"] td:first-child').allTextContents();
}

function sortButton(page: Page, column: string): Locator {
  return page.locator('[data-slot="table-header-cell"]').filter({ hasText: column }).locator('[data-slot="table-sort-button"]');
}

function headerCell(page: Page, column: string): Locator {
  return page.locator('[data-slot="table-header-cell"]').filter({ hasText: column });
}

test("a header click cycles ascending, descending and unsorted, and aria-sort follows", async ({ mount, page }) => {
  await mount<typeof SortableTableStory>(`${STORIES}/SortableTableStory`);
  const name = headerCell(page, "Name");
  await expect(name).toHaveAttribute("aria-sort", "none");
  const original = await names(page);
  expect(original).toEqual(["Ada", "Bram", "Cleo", "Dov"]);

  await sortButton(page, "Name").click();
  await expect(name).toHaveAttribute("aria-sort", "ascending");
  expect(await names(page)).toEqual(["Ada", "Bram", "Cleo", "Dov"]);

  await sortButton(page, "Name").click();
  await expect(name).toHaveAttribute("aria-sort", "descending");
  expect(await names(page)).toEqual(["Dov", "Cleo", "Bram", "Ada"]);

  await sortButton(page, "Name").click();
  await expect(name).toHaveAttribute("aria-sort", "none");
  expect(await names(page)).toEqual(original);
});

test("a blank value sorts last in both directions", async ({ mount, page }) => {
  await mount<typeof SortableTableStory>(`${STORIES}/SortableTableStory`);
  await sortButton(page, "Age").click();
  await expect(headerCell(page, "Age")).toHaveAttribute("aria-sort", "ascending");
  expect(await names(page)).toEqual(["Cleo", "Ada", "Dov", "Bram"]);

  await sortButton(page, "Age").click();
  await expect(headerCell(page, "Age")).toHaveAttribute("aria-sort", "descending");
  expect(await names(page)).toEqual(["Dov", "Ada", "Cleo", "Bram"]);
});

test("sorting one column clears the indicator on the other", async ({ mount, page }) => {
  await mount<typeof SortableTableStory>(`${STORIES}/SortableTableStory`);
  await sortButton(page, "Name").click();
  await sortButton(page, "Age").click();
  await expect(headerCell(page, "Age")).toHaveAttribute("aria-sort", "ascending");
  await expect(headerCell(page, "Name")).toHaveAttribute("aria-sort", "none");
});

test("a column that is not sortable has no button and no aria-sort", async ({ mount, page }) => {
  await mount<typeof SortableTableStory>(`${STORIES}/SortableTableStory`);
  await expect(headerCell(page, "Key")).not.toHaveAttribute("aria-sort", /.*/u);
  await expect(headerCell(page, "Key").locator('[data-slot="table-sort-button"]')).toHaveCount(0);
  await expect(sortButton(page, "Name")).toHaveCount(1);
});

test("a controlled sort reports each request and leaves the rows where its caller put them", async ({ mount, page }) => {
  await mount<typeof ControlledSortTableStory>(`${STORIES}/ControlledSortTableStory`);
  await sortButton(page, "Name").click();
  await expect(page.getByRole("status", { name: "Sort requests" })).toHaveText("1");
  expect(await names(page)).toEqual(["Ada", "Bram", "Cleo", "Dov"]);
  await expect(headerCell(page, "Name")).toHaveAttribute("aria-sort", "none");
});

test("paging runs over the sorted rows, not the source order", async ({ mount, page }) => {
  await mount<typeof PagedTableStory>(`${STORIES}/PagedTableStory`);
  expect(await names(page)).toEqual(["Dov", "Cleo", "Bram"]);
  await page.locator('[data-slot="table-pager"] button').nth(1).click();
  expect(await names(page)).toEqual(["Ada"]);
  await expect(page.locator('[data-slot="table-pager"] button').nth(1)).toBeDisabled();
});
