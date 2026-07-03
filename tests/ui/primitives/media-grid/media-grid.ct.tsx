// CT: the MediaGrid seal — virtualized 2D grid, reserved square cells, roving-tabindex keyboard
// nav, per-cell accessible names, selection mode, and the animated/thumbnail src dispatch
// (ui-package-design §6.1 / work-order #6).

import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import {
  ActivatableGrid,
  AnimatedDispatchGrid,
  BasicGrid,
  DerivedItemsGrid,
  MixedContentGrid,
  SelectableGrid,
  UnboundedGrid,
} from "./media-grid.fixtures";

const ITEM_COUNT = 30;
const MIN_CELL_WIDTH_PX = 100;
const WIDE_PX = 300; // → 3 columns at a 100px floor, 0 gap
const NARROW_PX = 220; // → 2 columns at the same floor
const NAV_ITEM_COUNT = 9; // 3x3, fully mounted — no virtualization truncation to fight in nav tests

test("renders only a window of a 30-item grid", async ({ mount }) => {
  const component = await mount(
    <BasicGrid
      heightPx={300}
      itemCount={ITEM_COUNT}
      minCellWidth={MIN_CELL_WIDTH_PX}
      widthPx={WIDE_PX}
    />,
  );
  await expect(component.getByRole("gridcell", { name: "Item 0" })).toBeVisible();
  const rendered = await component.getByRole("gridcell").count();
  expect(rendered).toBeGreaterThan(0);
  expect(rendered).toBeLessThan(ITEM_COUNT);
  // A deep item is NOT in the DOM before scrolling.
  await expect(component.getByRole("gridcell", { name: "Item 29" })).toHaveCount(0);
});

test("column count is derived from the container width (responsive)", async ({ mount }) => {
  const wide = await mount(
    <BasicGrid heightPx={300} itemCount={6} minCellWidth={MIN_CELL_WIDTH_PX} widthPx={WIDE_PX} />,
  );
  await expect(wide.getByRole("grid")).toHaveAttribute("aria-colcount", "3");
  await expect(wide.getByRole("grid")).toHaveAttribute("aria-rowcount", "2");
  await wide.unmount();

  const narrow = await mount(
    <BasicGrid heightPx={300} itemCount={6} minCellWidth={MIN_CELL_WIDTH_PX} widthPx={NARROW_PX} />,
  );
  await expect(narrow.getByRole("grid")).toHaveAttribute("aria-colcount", "2");
  await expect(narrow.getByRole("grid")).toHaveAttribute("aria-rowcount", "3");
});

test("cells reserve an identical square box whether or not media has loaded (no layout shift)", async ({
  mount,
}) => {
  const component = await mount(<MixedContentGrid widthPx={WIDE_PX} />);
  const imaged = component.getByRole("gridcell", { name: "Has image" });
  const placeholder = component.getByRole("gridcell", { name: "No image yet" });
  const imagedBox = await imaged.boundingBox();
  const placeholderBox = await placeholder.boundingBox();
  if (imagedBox === null || placeholderBox === null) {
    throw new Error("expected both cells to have a bounding box");
  }
  expect(Math.abs(imagedBox.width - imagedBox.height)).toBeLessThan(1);
  expect(Math.abs(placeholderBox.width - placeholderBox.height)).toBeLessThan(1);
  // Identical reserved size regardless of whether the cell has an image.
  expect(Math.abs(imagedBox.width - placeholderBox.width)).toBeLessThan(1);
  await expect(placeholder.locator('[data-slot="media-grid-placeholder"]')).toHaveCSS(
    "background-color",
    TOKENS["color.muted"].value,
  );
});

test("animated items render the original url, not the thumbnail variant", async ({ mount }) => {
  const component = await mount(<AnimatedDispatchGrid />);
  await expect(component.getByRole("gridcell", { name: "Static" }).locator("img")).toHaveAttribute(
    "src",
    "thumb-static.png",
  );
  await expect(
    component.getByRole("gridcell", { name: "Animated" }).locator("img"),
  ).toHaveAttribute("src", "full-animated.png");
});

test("each cell carries its item's alt as the accessible name", async ({ mount }) => {
  const component = await mount(
    <BasicGrid
      heightPx={300}
      itemCount={NAV_ITEM_COUNT}
      minCellWidth={MIN_CELL_WIDTH_PX}
      widthPx={WIDE_PX}
    />,
  );
  await expect(component.getByRole("gridcell", { name: "Item 4" })).toBeVisible();
});

test("roving tabindex: only the focused cell is a tab stop, arrows move it by row/column", async ({
  mount,
  page,
}) => {
  const component = await mount(
    <BasicGrid
      heightPx={300}
      itemCount={NAV_ITEM_COUNT}
      minCellWidth={MIN_CELL_WIDTH_PX}
      widthPx={WIDE_PX}
    />,
  );
  const item0 = component.getByRole("gridcell", { name: "Item 0" });
  const item1 = component.getByRole("gridcell", { name: "Item 1" });
  const item4 = component.getByRole("gridcell", { name: "Item 4" });
  const item8 = component.getByRole("gridcell", { name: "Item 8" });

  await expect(item0).toHaveAttribute("tabindex", "0");
  await expect(item1).toHaveAttribute("tabindex", "-1");

  await item0.focus();
  await page.keyboard.press("ArrowRight");
  await expect(item1).toBeFocused();
  await expect(item1).toHaveAttribute("tabindex", "0");
  await expect(item0).toHaveAttribute("tabindex", "-1");

  await page.keyboard.press("ArrowDown"); // +3 columns: Item 1 → Item 4
  await expect(item4).toBeFocused();

  await page.keyboard.press("End");
  await expect(item8).toBeFocused();

  await page.keyboard.press("Home");
  await expect(item0).toBeFocused();
});

test("selection mode: click toggles aria-selected + the checkmark badge, both directions", async ({
  mount,
}) => {
  const component = await mount(<SelectableGrid itemCount={6} />);
  const cell = component.getByRole("gridcell", { name: "Item 1" });
  await expect(cell).toHaveAttribute("aria-selected", "false");
  await expect(component.getByTestId("selected-count")).toHaveText("0 selected");

  await cell.click();
  await expect(cell).toHaveAttribute("aria-selected", "true");
  await expect(component.getByTestId("selected-count")).toHaveText("1 selected");
  await expect(cell.locator('[data-slot="media-grid-selected-badge"]')).toHaveCSS(
    "background-color",
    TOKENS["color.primary"].value,
  );

  await cell.click();
  await expect(cell).toHaveAttribute("aria-selected", "false");
  await expect(component.getByTestId("selected-count")).toHaveText("0 selected");
});

test("browse mode (no selection prop): click fires onActivate", async ({ mount }) => {
  const component = await mount(<ActivatableGrid itemCount={6} />);
  await expect(component.getByTestId("activated")).toHaveText("none");
  await component.getByRole("gridcell", { name: "Item 2" }).click();
  await expect(component.getByTestId("activated")).toHaveText("Item 2");
});

test("the tripwire THROWS when the parent gives no bounded height", async ({ mount, page }) => {
  await mount(<UnboundedGrid itemCount={ITEM_COUNT} />);
  // The boundary replaces the mounted subtree, so the component handle goes stale — use the page.
  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("no bounded height");
});

// R7 (ui-primitive-contract, the systemic gap missing from all 3 virtual seals): the parent
// re-renders passing a freshly-DERIVED items array — not a stable module-const reference.
test("renders correctly when the parent passes a freshly-derived items array each render", async ({
  mount,
}) => {
  const component = await mount(<DerivedItemsGrid />);
  await expect(component.getByRole("gridcell", { name: "Alpha" })).toBeVisible();

  await component.getByTestId("rerender").click();
  await expect(component.getByRole("gridcell", { name: "Alpha" })).toBeVisible();
  await expect(component.getByRole("gridcell", { name: "Bravo" })).toBeVisible();
  await expect(component.getByRole("gridcell", { name: "Charlie" })).toBeVisible();
});
