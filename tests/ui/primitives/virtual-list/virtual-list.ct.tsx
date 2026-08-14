import { expect, test } from "@playwright/experimental-ct-react";
import {
  AriaLabelList,
  BoundedList,
  CustomRangeExtractorList,
  DerivedItemsList,
  EndApproachList,
  FadeEdgeList,
  LanesList,
  OverscanList,
  ScrollToIndexList,
  UnboundedList,
} from "./virtual-list.fixtures.tsx";

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

// Split across two tests — playwright-ct mounts exactly one root per test. 200px window / 20px rows
// ≈ 10 visible; the seal's own default overscan (1) pads a couple rows past that on each side, while
// overscan=20 pads well past it — the two bounds below distinguish the branches without a cross-test
// comparison.
test("overscan default: renders roughly the visible window + the seal's own default padding", async ({ mount }) => {
  const component = await mount(<OverscanList itemCount={500} />);
  const rendered = await component.locator("[data-index]").count();
  expect(rendered).toBeGreaterThan(0);
  expect(rendered).toBeLessThan(20);
});

test("overscan=20 renders MORE off-screen rows than the seal's own default window", async ({ mount }) => {
  const component = await mount(<OverscanList itemCount={500} overscan={20} />);
  const rendered = await component.locator("[data-index]").count();
  expect(rendered).toBeGreaterThanOrEqual(30);
});

test("fadeEdge=false never writes the data-more cue, even with more list below the fold", async ({ mount }) => {
  const component = await mount(<FadeEdgeList itemCount={100} fadeEdge={false} />);
  const scroller = component.locator('[data-slot="virtual-list-scroll"]');
  await expect(scroller).not.toHaveAttribute("data-more", "");
});

test("fadeEdge=true: data-more is set while more list is below the fold, and lifts at the bottom", async ({ mount, page }) => {
  const component = await mount(<FadeEdgeList itemCount={100} fadeEdge={true} />);
  const scroller = component.locator('[data-slot="virtual-list-scroll"]');
  await expect(scroller).toHaveAttribute("data-more", "");

  await component.getByText("Item 0", { exact: true }).hover();
  await page.mouse.wheel(0, 100 * 40);
  await expect(scroller).not.toHaveAttribute("data-more", "");
});

test("scrollToIndex pins the last item into view (end-aligned) once the prop is set", async ({ mount }) => {
  const component = await mount(<ScrollToIndexList itemCount={300} />);
  await expect(component.getByText("Item 299", { exact: true })).toHaveCount(0);
  await component.getByTestId("pin-to-end").click();
  await expect(component.getByText("Item 299", { exact: true })).toBeVisible();
});

test("onEndApproach fires when the rendered window is within endApproachRows of the tail", async ({ mount }) => {
  // A list entirely within the default endApproachRows (8) of its own tail fires on/shortly after
  // mount (it may re-fire once more as rows settle from estimated to measured size — still gated,
  // never the "does not fire" zero of the sibling test below).
  const component = await mount(<EndApproachList itemCount={5} />);
  await expect(component.getByTestId("calls")).not.toHaveText("0");
});

test("onEndApproach does NOT fire when the window is farther from the tail than endApproachRows", async ({ mount }) => {
  const component = await mount(<EndApproachList itemCount={500} endApproachRows={2} />);
  await expect(component.getByTestId("calls")).toHaveText("0");
});

test("aria-label passes through to the role=list scroll container", async ({ mount }) => {
  const component = await mount(<AriaLabelList itemCount={20} ariaLabel="Fixture rows" />);
  await expect(component.getByRole("list", { name: "Fixture rows" })).toBeVisible();
});
