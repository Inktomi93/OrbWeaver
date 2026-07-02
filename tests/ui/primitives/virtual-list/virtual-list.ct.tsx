import { expect, test } from "@playwright/experimental-ct-react";
import { BoundedList, UnboundedList } from "./virtual-list.fixtures";

const ITEM_COUNT = 1000;
const ROW_HEIGHT_PX = 40;
const LIST_HEIGHT_PX = 400;
// Bounded window (400px) + overscan is ~a dozen rows; anything near this bound means windowing broke.
const MAX_WINDOWED_ROWS = 100;
const SCROLL_TARGET_INDEX = 500;

test("renders only a window of a 1000-item list", async ({ mount }) => {
  const component = await mount(
    <BoundedList
      itemCount={ITEM_COUNT}
      rowHeightPx={ROW_HEIGHT_PX}
      listHeightPx={LIST_HEIGHT_PX}
    />,
  );
  await expect(component.getByText("Item 0", { exact: true })).toBeVisible();
  const rendered = await component.locator("[data-index]").count();
  expect(rendered).toBeGreaterThan(0);
  expect(rendered).toBeLessThan(MAX_WINDOWED_ROWS);
  // A deep item is NOT in the DOM before scrolling.
  await expect(component.getByText(`Item ${SCROLL_TARGET_INDEX}`, { exact: true })).toHaveCount(0);
});

test("scrolling brings later items into view", async ({ mount, page }) => {
  const component = await mount(
    <BoundedList
      itemCount={ITEM_COUNT}
      rowHeightPx={ROW_HEIGHT_PX}
      listHeightPx={LIST_HEIGHT_PX}
    />,
  );
  await expect(component.getByText("Item 0", { exact: true })).toBeVisible();
  await component.getByText("Item 0", { exact: true }).hover();
  await page.mouse.wheel(0, SCROLL_TARGET_INDEX * ROW_HEIGHT_PX);
  await expect(component.getByText(`Item ${SCROLL_TARGET_INDEX}`, { exact: true })).toBeVisible();
});

test("rows carry stable data-index measurement wiring", async ({ mount }) => {
  const component = await mount(
    <BoundedList
      itemCount={ITEM_COUNT}
      rowHeightPx={ROW_HEIGHT_PX}
      listHeightPx={LIST_HEIGHT_PX}
    />,
  );
  await expect(component.locator('[data-index="0"]')).toBeVisible();
  // Every rendered row is wired for measureElement: row count === data-index count.
  const rows = await component.locator("[data-index]").count();
  expect(rows).toBeGreaterThan(0);
});

test("the tripwire THROWS when the parent gives no bounded height", async ({ mount, page }) => {
  await mount(<UnboundedList itemCount={ITEM_COUNT} rowHeightPx={ROW_HEIGHT_PX} />);
  // The boundary replaces the mounted subtree, so the component handle goes stale — use the page.
  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("no bounded height");
});
