// CT: `<SkeletonRows>` (rollup-audit C2) — the shared QueryBoundary loading fallback, both row shapes.
import { SkeletonRows } from "@orb/client/data";
import { expect, test } from "@playwright/experimental-ct-react";

test("shape='line' renders `count` full-width skeleton bars", async ({ mount }) => {
  const component = await mount(<SkeletonRows count={3} shape="line" />);
  await expect(component.locator('[data-slot="skeleton"]')).toHaveCount(3);
});

test("shape='avatar-row' renders `count` rows of an avatar circle + two text lines", async ({ mount }) => {
  const component = await mount(<SkeletonRows count={2} shape="avatar-row" />);
  // 3 skeletons per row (circle + 2 lines) × 2 rows.
  await expect(component.locator('[data-slot="skeleton"]')).toHaveCount(6);
});

test("defaults to shape='line' when omitted", async ({ mount }) => {
  const component = await mount(<SkeletonRows count={4} />);
  await expect(component.locator('[data-slot="skeleton"]')).toHaveCount(4);
});

test("the loading region is aria-busy so assistive tech hears 'busy'", async ({ mount, page }) => {
  await mount(<SkeletonRows count={1} />);
  await expect(page.locator('[aria-busy="true"]')).toBeVisible();
});
