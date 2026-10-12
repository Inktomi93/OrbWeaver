// <Layer> CT — the one-cell overlay stack (side-eye 2026-08-06 P1). Its whole job is a WIDTH claim:
// children share one grid cell, so the box reserves the WIDEST child rather than their sum. Asserted as
// geometry, because "reserves the max, not the sum" is not visible in any single computed property.

import { Layer } from "@orb/ui/layout";
import { expect, test } from "@playwright/experimental-ct-react";

// Mounted the way production uses it — a `shrink-0` trailing strip in a flex row — because the claim is
// about the box's INTRINSIC width. A bare block-level `<Layer>` fills its parent and would measure the
// viewport, proving nothing (it did, on the first cut of this test).
test("the box is as wide as the WIDEST child, not the sum of them", async ({ mount, page }) => {
  await mount(
    <div style={{ display: "flex", width: 400 }}>
      <div style={{ flex: 1, minWidth: 0 }}>name column</div>
      <Layer className="shrink-0" data-testid="strip">
        <span style={{ width: 120, display: "block" }}>wide</span>
        <span style={{ width: 40, display: "block" }}>narrow</span>
      </Layer>
    </div>,
  );
  const strip = page.getByTestId("strip");
  await expect(strip).toHaveCSS("display", "grid");
  // 120, never 160. Two flow SIBLINGS of the same widths reserve 160 — that sum is the defect this exists
  // to remove, and it is what the name column was paying for.
  await expect.poll(async () => await strip.evaluate((el: HTMLElement): number => Math.round(el.getBoundingClientRect().width))).toBe(120);
});

test("every child occupies the SAME cell — identical origins, whatever the order", async ({ mount }) => {
  const component = await mount(
    <Layer>
      <span data-testid="first" style={{ width: 120, display: "block" }}>
        wide
      </span>
      <span data-testid="second" style={{ width: 40, display: "block" }}>
        narrow
      </span>
    </Layer>,
  );
  let origins = await component.evaluate((el: HTMLElement): readonly (readonly [number, number])[] =>
    Array.from(el.children).map((child): readonly [number, number] => {
      const box = child.getBoundingClientRect();
      return [Math.round(box.left), Math.round(box.top)];
    }),
  );
  await expect
    .poll(async () => {
      origins = await component.evaluate((el: HTMLElement): readonly (readonly [number, number])[] =>
        Array.from(el.children).map((child): readonly [number, number] => {
          const box = child.getBoundingClientRect();
          return [Math.round(box.left), Math.round(box.top)];
        }),
      );
      return origins;
    })
    .toHaveLength(2);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(origins[0]).toEqual(origins[1]);
});
