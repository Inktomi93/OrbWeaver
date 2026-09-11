// CT: the sortable seal (@dnd-kit/react). The load-bearing assertions are the ones the work order
// flagged as unverified-by-docs: keyboard reorder end-to-end (focus → Space → arrow → Space) and
// the aria-live announcement — both turn out to be on BY DEFAULT (the `Accessibility` +
// `KeyboardSensor` + `SortableKeyboardPlugin` defaults, verified against the shipped `@dnd-kit/dom`
// source), so these tests are the proof, not a hand-wired feature under test.
import { expect, test } from "@playwright/experimental-ct-react";
import { DerivedItemsList, ReorderableList } from "./sortable.fixtures.tsx";

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

test("pointer drag via the handle reorders the list and calls onReorder", async ({ mount, page }) => {
  await mount(<ReorderableList handle={true} itemCount={3} />);
  const handles = page.locator('[data-slot="sortable-handle"]');
  const rows = page.locator('[data-slot="sortable-item"]');

  const firstHandleBox = await handles.nth(0).boundingBox();
  const lastRowBox = await rows.nth(2).boundingBox();
  if (firstHandleBox === null || lastRowBox === null) {
    throw new Error("sortable CT: missing bounding box for drag geometry");
  }

  await page.mouse.move(firstHandleBox.x + firstHandleBox.width / 2, firstHandleBox.y + firstHandleBox.height / 2);
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

test("the drag activator is keyboard-focusable and auto-described (Accessibility plugin defaults)", async ({ mount, page }) => {
  await mount(<ReorderableList itemCount={3} />);
  const row = page.locator('[data-slot="sortable-item"]').first();
  await expect(row).toHaveAttribute("tabindex", "0");
  await expect(row).toHaveAttribute("aria-roledescription", NON_EMPTY);
  await expect(row).toHaveAttribute("aria-describedby", NON_EMPTY);
});

test("keyboard reorder: focus, Space to pick up, ArrowDown to move, Space to drop", async ({ mount, page }) => {
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

// @dnd-kit's KeyboardSensor moves the drag by re-ordering the list, which re-renders the rows and
// drops DOM focus off the handle button onto <body> — a keyboard-only user then can't continue a
// multi-step reorder. This is the handle-mode variant, since the ArrowDown move re-renders the
// handle button (not the whole-row activator asserted above).
test("keyboard reorder in handle mode: focus survives the ArrowDown re-render on the active handle", async ({ mount, page }) => {
  await mount(<ReorderableList handle={true} itemCount={3} />);
  const handles = page.locator('[data-slot="sortable-handle"]');
  await handles.nth(0).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  // Focus must still be on a handle button (not fallen back to <body>) so a further ArrowDown/Space
  // keeps operating the same multi-step reorder. Poll: the re-render + focus-restoration effect
  // settle a tick after the keypress.
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-slot"))).toBe("sortable-handle");
  await page.keyboard.press("Space");

  await expect(page.getByTestId("reorder-count")).toHaveText("1");
});

// The property the focus-loss defect actually breaks: continuing a MULTI-STEP keyboard reorder. If the
// first ArrowDown strands focus on <body>, the SECOND ArrowDown never reaches the sensor and the drag
// can't complete on the intended target. Pick up item 0, arrow past item 1 AND item 2 (two moves),
// drop — it must land last (count=1, order 1,2,0). This fails outright when restoration is
// render-coupled and the state-flip-before-focus-loss race fires.
test("keyboard reorder in handle mode: a second ArrowDown after the first still completes the move", async ({ mount, page }) => {
  await mount(<ReorderableList handle={true} itemCount={3} />);
  const handles = page.locator('[data-slot="sortable-handle"]');
  const rows = page.locator('[data-slot="sortable-item"]');
  await handles.nth(0).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");

  await expect(page.getByTestId("reorder-count")).toHaveText("1");
  await expect(rows.nth(0)).toContainText("Item 1");
  await expect(rows.nth(1)).toContainText("Item 2");
  await expect(rows.nth(2)).toContainText("Item 0");
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

// The announcement's CONTENT, not just its presence (side-eye 2026-08-06). dnd-kit's stock script
// interpolates `source.id` / `target.id` — in this app TypeIDs — and at drop names the target, which with
// optimistic sorting is the row ITSELF. The seal's own script says the row's NAME and its DESTINATION RANK.
test("announcements name the ROW and its position, never the raw item key", async ({ mount, page }) => {
  await mount(<ReorderableList itemCount={3} />);
  const rows = page.locator('[data-slot="sortable-item"]');
  const liveRegion = page.getByRole("status");
  await rows.nth(0).focus();

  await page.keyboard.press("Space");
  await expect(liveRegion).toHaveText("Picked up Item 0, position 1 of 3.");

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await expect(liveRegion).toHaveText("Dropped Item 0, position 2 of 3.");
  // The KEY never reaches the live region — the whole point of the finding.
  await expect(liveRegion).not.toContainText("item-0");
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
  await page.mouse.move(firstHandleBox.x + firstHandleBox.width / 2, firstHandleBox.y + firstHandleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(lastRowBox.x + lastRowBox.width / 2, lastRowBox.y + lastRowBox.height - 4, {
    steps: 10,
  });
  await page.mouse.up();

  await expect(rows.nth(0)).toContainText("Item 0");
  await expect(page.getByTestId("reorder-count")).toHaveText("0");
});

test("reduced motion: a completed drag produces no perceptible (non-zero-duration) animation", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // In-page instrumentation below — `globalThis`/`Element.prototype` in the mounted browser context
  // carry no app type; each cast is the monkeypatch scaffolding itself, not a fabricated domain value.
  await page.evaluate(() => {
    // FABRICATION-OK: in-page globalThis scaffolding (see above).
    (globalThis as unknown as { __durations: number[] }).__durations = [];
    // FABRICATION-OK: in-page Element.prototype scaffolding (see above).
    const proto = Element.prototype as unknown as {
      animate: (keyframes: unknown, options?: unknown) => Animation;
    };
    const original = proto.animate;
    // A real `function` (not an arrow) — mirrors the message-list.ct.tsx scrollTo-patch pattern:
    // `this` must be the actual animating element for the native call to succeed.
    proto.animate = function patchedAnimate(this: Element, keyframes: unknown, options?: unknown): Animation {
      const duration = typeof options === "object" && options !== null && "duration" in options ? Number((options as { duration?: number }).duration ?? 0) : 0;
      // FABRICATION-OK: in-page globalThis scaffolding (see above).
      (globalThis as unknown as { __durations: number[] }).__durations.push(duration);
      return original.call(this, keyframes, options);
    };
  });

  await mount(<ReorderableList handle={true} itemCount={3} />);
  const handles = page.locator('[data-slot="sortable-handle"]');
  const rows = page.locator('[data-slot="sortable-item"]');

  const firstHandleBox = await handles.nth(0).boundingBox();
  const lastRowBox = await rows.nth(2).boundingBox();
  if (firstHandleBox === null || lastRowBox === null) {
    throw new Error("sortable CT: missing bounding box for drag geometry");
  }
  await page.mouse.move(firstHandleBox.x + firstHandleBox.width / 2, firstHandleBox.y + firstHandleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(lastRowBox.x + lastRowBox.width / 2, lastRowBox.y + lastRowBox.height - 4, {
    steps: 10,
  });
  await page.mouse.up();

  await expect(rows.nth(0)).toContainText("Item 1");
  await expect(page.getByTestId("reorder-count")).toHaveText("1");

  // FABRICATION-OK: in-page globalThis scaffolding (see the mount-time instrumentation above).
  const durations = await page.evaluate(() => (globalThis as unknown as { __durations: number[] }).__durations);
  // Every WAAPI animation dnd-kit ran during this drag+drop — the sibling FLIP reposition AND
  // the drop-settle bounce — has ZERO duration under reduced motion: the FLIP reposition via
  // `useSortable`'s own internal prefers-reduced-motion check, and the drop-settle because this
  // seal's `Feedback.configure({ dropAnimation: null })` skips it before any WAAPI call runs at
  // all (so it never even reaches this patched `animate`).
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(durations.length).toBeGreaterThan(0);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(durations.every((duration) => duration === 0)).toBe(true);
});

test("reorders correctly when the parent passes a freshly-derived items array each render", async ({ mount, page }) => {
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
