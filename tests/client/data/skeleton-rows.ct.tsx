// CT: `<SkeletonRows>` (rollup-audit C2) — the shared QueryBoundary loading fallback, all three row shapes.
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

// The `datum` arm exists because the `line` arm's CONTROL-height bar is the wrong box for a readout panel
// that settles into text-height `DatumRow`s (side-eye 2026-08-08 P2): four of them measured 233px against an
// 89px settled panel. Its shape promise is two bars per row — a label and a value — at a TEXT line height, so
// both halves are asserted: the count, and that the bar is nowhere near a control step.
test("shape='datum' renders a label+value bar pair per row, at text height rather than a control height", async ({ mount }) => {
  const component = await mount(<SkeletonRows count={3} shape="datum" />);
  const bars = component.locator('[data-slot="skeleton"]');
  await expect(bars).toHaveCount(6);

  const [barHeight, controlLg] = await Promise.all([
    bars.first().evaluate((el) => el.getBoundingClientRect().height),
    bars.first().evaluate(() => {
      const probe = document.createElement("div");
      document.body.append(probe);
      probe.style.height = "var(--spacing-control-lg)";
      const height = probe.getBoundingClientRect().height;
      probe.remove();
      return height;
    }),
  ]);
  expect(barHeight).toBeGreaterThan(0);
  expect(barHeight, "a datum bar is a line of text, not a control row").toBeLessThan(controlLg);
});

test("defaults to shape='line' when omitted", async ({ mount }) => {
  const component = await mount(<SkeletonRows count={4} />);
  await expect(component.locator('[data-slot="skeleton"]')).toHaveCount(4);
});

test("the loading region is aria-busy so assistive tech hears 'busy'", async ({ mount, page }) => {
  await mount(<SkeletonRows count={1} />);
  await expect(page.locator('[aria-busy="true"]')).toBeVisible();
});
