// CT: the sortable seal (@dnd-kit/react). The load-bearing assertions are the ones the work order
// flagged as unverified-by-docs: keyboard reorder end-to-end (focus → Space → arrow → Space) and
// the aria-live announcement — both turn out to be on BY DEFAULT (the `Accessibility` +
// `KeyboardSensor` + `SortableKeyboardPlugin` defaults, verified against the shipped `@dnd-kit/dom`
// source), so these tests are the proof, not a hand-wired feature under test.
import { expect, test } from "@playwright/experimental-ct-react";
import { DerivedItemsList, ReorderableList } from "./sortable.fixtures";

const NON_EMPTY = /.+/u;
const PICKED_UP_RE = /picked up/iu;
const DROPPED_RE = /dropped/iu;

test("renders items in the given order with no handle by default", async ({ mount, page }) => {
  await mount(<ReorderableList itemCount={3} />);
  const rows = page.locator('[data-slot="sortable-item"]');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("Item 0");
  await expect(rows.nth(1)).toContainText("Item 1");
  await expect(rows.nth(2)).toContainText("Item 2");
  await expect(page.locator('[data-slot="sortable-handle"]')).toHaveCount(0);
});

test("handle mode renders one grip affordance per row", async ({ mount, page }) => {
  await mount(<ReorderableList handle={true} itemCount={3} />);
  await expect(page.locator('[data-slot="sortable-handle"]')).toHaveCount(3);
});

test("pointer drag via the handle reorders the list and calls onReorder", async ({
  mount,
  page,
}) => {
  await mount(<ReorderableList handle={true} itemCount={3} />);
  const handles = page.locator('[data-slot="sortable-handle"]');
  const rows = page.locator('[data-slot="sortable-item"]');

  const firstHandleBox = await handles.nth(0).boundingBox();
  const lastRowBox = await rows.nth(2).boundingBox();
  if (firstHandleBox === null || lastRowBox === null) {
    throw new Error("sortable CT: missing bounding box for drag geometry");
  }

  await page.mouse.move(
    firstHandleBox.x + firstHandleBox.width / 2,
    firstHandleBox.y + firstHandleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(lastRowBox.x + lastRowBox.width / 2, lastRowBox.y + lastRowBox.height - 4, {
    steps: 10,
  });
  await page.mouse.up();

  await expect(rows.nth(0)).toContainText("Item 1");
  await expect(rows.nth(1)).toContainText("Item 2");
  await expect(rows.nth(2)).toContainText("Item 0");
  await expect(page.getByTestId("reorder-count")).toHaveText("1");
});

test("the drag activator is keyboard-focusable and auto-described (Accessibility plugin defaults)", async ({
  mount,
  page,
}) => {
  await mount(<ReorderableList itemCount={3} />);
  const row = page.locator('[data-slot="sortable-item"]').first();
  await expect(row).toHaveAttribute("tabindex", "0");
  await expect(row).toHaveAttribute("aria-roledescription", NON_EMPTY);
  await expect(row).toHaveAttribute("aria-describedby", NON_EMPTY);
});

test("keyboard reorder: focus, Space to pick up, ArrowDown to move, Space to drop", async ({
  mount,
  page,
}) => {
  await mount(<ReorderableList itemCount={3} />);
  const rows = page.locator('[data-slot="sortable-item"]');
  await expect(rows.nth(0)).toHaveAttribute("tabindex", "0");
  await rows.nth(0).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");

  await expect(rows.nth(0)).toContainText("Item 1");
  await expect(rows.nth(1)).toContainText("Item 0");
  await expect(page.getByTestId("reorder-count")).toHaveText("1");
  await expect(page.getByTestId("last-order")).toHaveText("item-1,item-0,item-2");
});

test("keyboard drag start/drop announce through the aria-live region", async ({ mount, page }) => {
  await mount(<ReorderableList itemCount={3} />);
  const rows = page.locator('[data-slot="sortable-item"]');
  // dnd-kit's Accessibility plugin renders role="status" + aria-live="polite" — distinct from
  // CtProviders' always-on Toast viewport (role="region", aria-atomic="false").
  const liveRegion = page.getByRole("status");
  await expect(rows.nth(0)).toHaveAttribute("tabindex", "0");
  await rows.nth(0).focus();

  await page.keyboard.press("Space");
  await expect(liveRegion).toContainText(PICKED_UP_RE);

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await expect(liveRegion).toContainText(DROPPED_RE);
});

test("dropping in place (no movement) does not call onReorder", async ({ mount, page }) => {
  await mount(<ReorderableList itemCount={3} />);
  const rows = page.locator('[data-slot="sortable-item"]');
  await expect(rows.nth(0)).toHaveAttribute("tabindex", "0");
  await rows.nth(0).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("reorder-count")).toHaveText("0");
});

test("disabled blocks both pointer and keyboard reorder", async ({ mount, page }) => {
  await mount(<ReorderableList disabled={true} handle={true} itemCount={3} />);
  const handles = page.locator('[data-slot="sortable-handle"]');
  const rows = page.locator('[data-slot="sortable-item"]');

  const firstHandleBox = await handles.nth(0).boundingBox();
  const lastRowBox = await rows.nth(2).boundingBox();
  if (firstHandleBox === null || lastRowBox === null) {
    throw new Error("sortable CT: missing bounding box for drag geometry");
  }
  await page.mouse.move(
    firstHandleBox.x + firstHandleBox.width / 2,
    firstHandleBox.y + firstHandleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(lastRowBox.x + lastRowBox.width / 2, lastRowBox.y + lastRowBox.height - 4, {
    steps: 10,
  });
  await page.mouse.up();

  await expect(rows.nth(0)).toContainText("Item 0");
  await expect(page.getByTestId("reorder-count")).toHaveText("0");
});

test("reorders correctly when the parent passes a freshly-derived items array each render", async ({
  mount,
  page,
}) => {
  await mount(<DerivedItemsList />);
  const rows = page.locator('[data-slot="sortable-item"]');
  await expect(rows).toHaveCount(3);

  await page.getByTestId("rerender").click();
  await expect(rows.nth(0)).toHaveAttribute("tabindex", "0");
  await rows.nth(0).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");

  await expect(rows.nth(0)).toContainText("Bravo");
  await expect(rows.nth(1)).toContainText("Alpha");
});
