// CT: picker-cell (#929 E6) — the ONE cell anatomy every single-choice PICTURE picker wears.
//
// THE DEFECTS THIS FILE PINS, all measured on the live Config surface (#1099):
//   · F27 — the five picker families were `flex flex-wrap` with `flex-1` children, so the LAST ROW's
//     survivors stretched: 410.4px cards under 270.9px cards in one grid. The pin is EQUAL WIDTHS across
//     rows, on a real `grid-template-columns`.
//   · E6 — cells in one grid had different HEIGHTS whenever one gloss wrapped. The pin is equal heights.
//   · The owner's zero-shift bar — hover/focus/selection may not change a cell's box. The pin is the
//     bounding rect before and during each state.
// No colour literal is asserted anywhere (§13.7): the claims are geometry and ARIA.

import { expect, test } from "@playwright/experimental-ct-react";
import { BarePickerCellStory, PickerStory } from "./picker-cell.fixtures.tsx";

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

test("the grid is a REAL grid and the LAST ROW does not stretch — every cell is the same width", async ({ mount, page }) => {
  // 480px wraps the three cells into 2 + 1. That is the exact shape F27 measured on the live surface:
  // `flex flex-wrap` + `flex-1` gave the lone survivor of the last row the whole line (410.4px cards under
  // 270.9px cards). An auto-fit grid cannot do that, and this arm is what says so.
  await mount(<PickerStory />);
  const host = page.getByTestId("picker-host");
  const template = await host.locator('[data-slot="radio-group-picker"]').evaluate((el) => getComputedStyle(el).gridTemplateColumns);
  // The positive control: `none` is what a flex-wrap masquerading as a grid reports, and it is exactly
  // what the five shipped families reported.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): a computed grid-template-columns on a mounted static grid — no async source.
  expect(template).not.toBe("none");

  const boxes = await host.locator('[data-slot="picker-cell"]').evaluateAll((cells): readonly Box[] =>
    cells.map((cell) => {
      const rect = cell.getBoundingClientRect();
      return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
    }),
  );
  expect(boxes).toHaveLength(3);
  // Genuinely wrapped — otherwise "the last row does not stretch" is a claim about a row that never existed.
  expect(new Set(boxes.map((box) => box.y)).size).toBe(2);
  expect(new Set(boxes.map((box) => box.width)).size).toBe(1);
});

test("cells in ONE row are the same height even when one gloss wraps and another is absent", async ({ mount, page }) => {
  await mount(<PickerStory width="640px" />);
  const boxes = await page
    .getByTestId("picker-host")
    .locator('[data-slot="picker-cell"]')
    .evaluateAll((cells): readonly Box[] =>
      cells.map((cell) => {
        const rect = cell.getBoundingClientRect();
        return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
      }),
    );
  expect(boxes).toHaveLength(3);
  // One row — the premise of the equal-height claim.
  expect(new Set(boxes.map((box) => box.y)).size).toBe(1);
  // Option one's gloss wraps to two lines and option three has no gloss at all; the cells still match.
  expect(new Set(boxes.map((box) => box.height)).size).toBe(1);
});

test("the cell's box is IDENTICAL at rest, on hover, on focus and when checked", async ({ mount, page }) => {
  await mount(<PickerStory />);
  const third = page.getByRole("radio", { name: "Three" });
  const read = async (): Promise<Box> => {
    const rect = await third.boundingBox();
    return { x: Math.round(rect?.x ?? -1), y: Math.round(rect?.y ?? -1), width: Math.round(rect?.width ?? -1), height: Math.round(rect?.height ?? -1) };
  };
  const rest = await read();
  expect(rest.width).toBeGreaterThan(0); // positive control: a zero box makes every comparison vacuous
  await third.hover();
  expect(await read()).toEqual(rest);
  await third.focus();
  expect(await read()).toEqual(rest);
  await third.click();
  await expect(third).toHaveAttribute("aria-checked", "true");
  expect(await read()).toEqual(rest);
});

test("the checked cell shows the native indicator, and only the checked one", async ({ mount, page }) => {
  await mount(<PickerStory />);
  const checks = page.locator('[data-slot="radio-group-picker-item-check"]');
  await expect(checks).toHaveCount(1);
  await page.getByRole("radio", { name: "Two" }).click();
  await expect(checks).toHaveCount(1);
  await expect(page.getByRole("radio", { name: "Two" }).locator('[data-slot="radio-group-picker-item-check"]')).toHaveCount(1);
});

// §13.10 N1/N2 — the NAME is the visible label (aria-labelledby), the gloss is the DESCRIPTION.
test("the cell is named by its visible label and described by its gloss — never an aria-label over the pixels", async ({ mount, page }) => {
  await mount(<PickerStory />);
  const one = page.getByRole("radio", { name: "One", exact: true });
  await expect(one).toBeVisible();
  await expect(one).not.toHaveAttribute("aria-label", /.+/);
  const wiring = await one.evaluate((cell) => {
    const labelled = cell.getAttribute("aria-labelledby");
    const described = cell.getAttribute("aria-describedby");
    return {
      labelText: labelled === null ? null : (document.getElementById(labelled)?.textContent ?? null),
      describedText: described === null ? null : (document.getElementById(described)?.textContent ?? null),
    };
  });
  // @orb-waive ct-no-oneshot-live-read-assert(expect): read after the awaited toBeVisible — the id wiring is render-time markup.
  expect(wiring.labelText).toBe("One");
  // @orb-waive ct-no-oneshot-live-read-assert(expect): same settled read, same evaluate.
  expect(wiring.describedText).toContain("The first option");
  // A gloss-less option carries no dangling description pointer.
  await expect(page.getByRole("radio", { name: "Three" })).not.toHaveAttribute("aria-describedby", /.+/);
});

// #981 F20 — ONE tab stop, roving focus, arrows change selection, and the value can never empty.
test("one tab stop, arrows move the selection, and re-activating the checked cell keeps its value", async ({ mount, page }) => {
  const picks: string[] = [];
  await mount(<PickerStory onPick={(value): void => void picks.push(value)} />);
  const one = page.getByRole("radio", { name: "One", exact: true });
  await one.focus();
  await expect(one).toHaveAttribute("tabindex", "0");
  await expect(page.getByRole("radio", { name: "Two" })).toHaveAttribute("tabindex", "-1");
  await expect(page.getByRole("radio", { name: "Three" })).toHaveAttribute("tabindex", "-1");

  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Two" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(one).toHaveAttribute("aria-checked", "true");

  // Clicking the CHECKED cell cannot empty the group (a toggle-group would have; a radio cannot).
  await one.click();
  await expect(one).toHaveAttribute("aria-checked", "true");
  await expect(page.locator('[aria-checked="true"]')).toHaveCount(1);
});

test("the presentation-only frame renders with no interaction wired — and reserves its art aperture", async ({ mount, page }) => {
  await mount(<BarePickerCellStory />);
  const cell = page.locator('[data-slot="picker-cell"]');
  await expect(cell).toHaveCount(1);
  await expect(cell).not.toHaveAttribute("role", /.+/);
  await expect(page.getByText("Bare", { exact: true })).toBeVisible();
  await expect(page.getByText("current", { exact: true })).toBeVisible();
  // `shape="square"` — the aperture is reserved and square BEFORE the feature's art has laid anything out.
  const art = await cell.locator('[data-slot="picker-cell-art"]').boundingBox();
  // @orb-waive ct-no-oneshot-live-read-assert(expect): read after the awaited toBeVisible on the cell label; the aperture is a CSS aspect box, not a loaded asset
  expect(art).not.toBeNull();
  expect(Math.round(art?.width ?? 0)).toBe(Math.round(art?.height ?? -1));
});
