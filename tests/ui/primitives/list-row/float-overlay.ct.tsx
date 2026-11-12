// A floated action cluster lies over its own row body on a fine pointer by design. The cluster and the clickable body both
// declare that relation, so the enlarged-text overlap probe names the pair instead of reporting it; an in-flow cluster overlays nothing.
import { enlargedTextGeometry } from "@orb/testkit/browser/spec";
import { OVERLAY_RELATION_ATTRIBUTE } from "@orb/ui/lib";
import { expect, test } from "@playwright/test";
import type { FloatOverlayStory } from "./_float-overlay-stories.tsx";

const STORY = "tests/ui/primitives/list-row/_float-overlay-stories/FloatOverlayStory";

test("a hovered row's floated actions over its body are a declared overlay, not a finding", async ({ mount, page }) => {
  await mount<typeof FloatOverlayStory>(STORY, { float: true });
  await page.getByRole("button", { name: "First row", exact: true }).hover();
  await expect(page.getByRole("button", { name: "Rename row" }).first()).toBeVisible();
  const geometry = await enlargedTextGeometry(page.locator("#root"));
  expect(geometry.findings).toEqual([]);
  expect(geometry.declaredOverlays).toEqual([
    expect.stringMatching(/^button "First row" \[.*\] overlaps button "Rename row" \[.*\], declared row-actions-over-body$/u),
    expect.stringMatching(/^button "First row" \[.*\] overlaps button "Delete row" \[.*\], declared row-actions-over-body$/u),
  ]);
});

test("an in-flow cluster lies over nothing and declares nothing", async ({ mount, page }) => {
  await mount<typeof FloatOverlayStory>(STORY, { float: false });
  await expect(page.getByRole("button", { name: "Rename row" }).first()).toBeVisible();
  const geometry = await enlargedTextGeometry(page.locator("#root"));
  expect(geometry.findings).toEqual([]);
  expect(geometry.declaredOverlays).toEqual([]);
  await expect(page.locator('[data-slot="list-row-actions"]').first()).not.toHaveAttribute(OVERLAY_RELATION_ATTRIBUTE);
  await expect(page.locator('[data-slot="list-row-body"]').first()).not.toHaveAttribute(OVERLAY_RELATION_ATTRIBUTE);
});
