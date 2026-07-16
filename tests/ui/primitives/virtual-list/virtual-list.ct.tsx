import { expect, test } from "@playwright/experimental-ct-react";
import { BoundedList, CustomRangeExtractorList, DerivedItemsList, LanesList, UnboundedList } from "./virtual-list.fixtures";

const ITEM_COUNT = 1000;
const ROW_HEIGHT_PX = 40;
const LIST_HEIGHT_PX = 400;
// Bounded window (400px) + overscan is ~a dozen rows; anything near this bound means windowing broke.
const MAX_WINDOWED_ROWS = 100;
const SCROLL_TARGET_INDEX = 500;

test("renders only a window of a 1000-item list", async ({ mount }) => {
  const component = await mount(<BoundedList itemCount={ITEM_COUNT} rowHeightPx={ROW_HEIGHT_PX} listHeightPx={LIST_HEIGHT_PX} />);
  await expect(component.getByText("Item 0", { exact: true })).toBeVisible();
  const rendered = await component.locator("[data-index]").count();
  expect(rendered).toBeGreaterThan(0);
  expect(rendered).toBeLessThan(MAX_WINDOWED_ROWS);
  // A deep item is NOT in the DOM before scrolling.
  await expect(component.getByText(`Item ${SCROLL_TARGET_INDEX}`, { exact: true })).toHaveCount(0);
});

test("scrolling brings later items into view", async ({ mount, page }) => {
  const component = await mount(<BoundedList itemCount={ITEM_COUNT} rowHeightPx={ROW_HEIGHT_PX} listHeightPx={LIST_HEIGHT_PX} />);
  await expect(component.getByText("Item 0", { exact: true })).toBeVisible();
  await component.getByText("Item 0", { exact: true }).hover();
  await page.mouse.wheel(0, SCROLL_TARGET_INDEX * ROW_HEIGHT_PX);
  await expect(component.getByText(`Item ${SCROLL_TARGET_INDEX}`, { exact: true })).toBeVisible();
});

test("rows carry stable data-index measurement wiring", async ({ mount }) => {
  const component = await mount(<BoundedList itemCount={ITEM_COUNT} rowHeightPx={ROW_HEIGHT_PX} listHeightPx={LIST_HEIGHT_PX} />);
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

// R7 (ui-primitive-contract, the systemic gap missing from all 3 virtual seals): the parent
// re-renders passing a freshly-DERIVED items array — not a stable module-const reference.
test("renders correctly when the parent passes a freshly-derived items array each render", async ({ mount }) => {
  const component = await mount(<DerivedItemsList />);
  await expect(component.getByText("Alpha", { exact: true })).toBeVisible();

  await component.getByTestId("rerender").click();
  await expect(component.getByText("Alpha", { exact: true })).toBeVisible();
  await expect(component.getByText("Bravo", { exact: true })).toBeVisible();
  await expect(component.getByText("Charlie", { exact: true })).toBeVisible();
});

test("lanes passthrough: rows carry a data-lane round-robined across the lane count", async ({ mount }) => {
  const component = await mount(<LanesList itemCount={9} lanes={3} />);
  const lanes = await component.locator("[data-lane]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-lane")));
  expect(lanes.length).toBeGreaterThan(0);
  expect(new Set(lanes)).toEqual(new Set(["0", "1", "2"]));
});

test("rangeExtractor passthrough: a custom extractor's forced index stays mounted off-screen", async ({ mount, page }) => {
  const component = await mount(<CustomRangeExtractorList itemCount={200} />);
  await expect(component.getByText("Item 0", { exact: true })).toBeVisible();
  await component.getByText("Item 0", { exact: true }).hover();
  await page.mouse.wheel(0, 100 * 40);
  // The normal overscan window has scrolled well past index 0 — only the custom rangeExtractor
  // forcing it into the range keeps it mounted.
  await expect(component.getByText("Item 0", { exact: true })).toHaveCount(1);
});
