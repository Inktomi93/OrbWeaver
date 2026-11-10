// @subject tests/support/browser/enlarged-text-geometry.ts
// The probe's planted cases: a control under the boot veil is read once the veil has left, a control under a standing panel still fails,
// a control's own value cut with an ellipsis fails while a list row title the design truncates does not, and a declared overlay is
// named apart while an undeclared one, or the declared control over a control the declaration does not cover, still fails.
import { expect, test } from "@playwright/test";
import { enlargedTextFindings, enlargedTextGeometry } from "./enlarged-text-geometry.ts";
import type { SurfaceCutValueStory, SurfaceDeclaredOverlayStory, SurfaceVeilCoverStory } from "./surface-design-fixtures.tsx";

const STORY = "tests/support/browser/surface-design-fixtures/SurfaceVeilCoverStory";
const CUT_STORY = "tests/support/browser/surface-design-fixtures/SurfaceCutValueStory";
const VEIL = '[data-slot="weave-veil"]';
// A box far narrower than either text, so the planted cut does not depend on the font.
const NARROW = 120;
// A row wide enough to seat its title and its actions on one line, with the picker still wider than the room left for it.
const ACTIONS_ROW = 200;
const VALUE_CUT = /^button "Connection" has its value cut: /u;

test("the probe waits for the boot veil to leave instead of reading the control it covers", async ({ mount, page }) => {
  await mount<typeof SurfaceVeilCoverStory>(STORY, { cover: "veil" });
  await expect(page.locator(VEIL)).toBeVisible();
  expect(await enlargedTextFindings(page.getByRole("main"))).toEqual([]);
  await expect(page.locator(VEIL)).toHaveCount(0);
});

test("the probe still fails a control a standing panel covers", async ({ mount, page }) => {
  await mount<typeof SurfaceVeilCoverStory>(STORY, { cover: "panel" });
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  expect(await enlargedTextFindings(page.getByRole("main"))).toEqual([expect.stringMatching(/^button "Retry" \[.*\] is covered at its centre by div /u)]);
});

test("the probe fails a picker whose value is cut with an ellipsis", async ({ mount, page }) => {
  await mount<typeof SurfaceCutValueStory>(CUT_STORY, { width: NARROW, cut: "value" });
  await expect(page.getByRole("combobox", { name: "Connection", exact: true })).toBeVisible();
  expect(await enlargedTextFindings(page.getByRole("main"))).toEqual([expect.stringMatching(VALUE_CUT)]);
});

test("the probe stays silent when the picker wraps its value", async ({ mount, page }) => {
  await mount<typeof SurfaceCutValueStory>(CUT_STORY, { width: NARROW, cut: "value", wraps: true });
  await expect(page.getByRole("combobox", { name: "Connection", exact: true })).toBeVisible();
  expect(await enlargedTextFindings(page.getByRole("main"))).toEqual([]);
});

test("the probe stays silent for a list row title the design truncates", async ({ mount, page }) => {
  await mount<typeof SurfaceCutValueStory>(CUT_STORY, { width: NARROW, cut: "row" });
  const title = page.locator('[data-slot="list-row-title"]');
  await expect(title).toBeVisible();
  // The control for the silence: the title is cut, so the probe passes over a real truncation.
  expect(await title.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
  expect(await enlargedTextFindings(page.getByRole("main"))).toEqual([]);
});

test("the probe stays silent for a facet preview line the design truncates", async ({ mount, page }) => {
  await mount<typeof SurfaceCutValueStory>(CUT_STORY, { width: NARROW, cut: "preview" });
  const preview = page.locator('[data-slot="facet-preview"]');
  await expect(preview).toBeVisible();
  // The control for the silence: the preview is cut, so the probe passes over a real truncation.
  expect(await preview.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
  expect(await enlargedTextFindings(page.getByRole("main"))).toEqual([]);
});

test("the probe fails a picker cut inside a list row's actions", async ({ mount, page }) => {
  await mount<typeof SurfaceCutValueStory>(CUT_STORY, { width: ACTIONS_ROW, cut: "action" });
  await expect(page.getByRole("combobox", { name: "Connection", exact: true })).toBeVisible();
  expect(await enlargedTextFindings(page.getByRole("main"))).toEqual([expect.stringMatching(VALUE_CUT)]);
});

test("the probe fails a visible button label that is cut, though the label repeats the button's name", async ({ mount, page }) => {
  await mount<typeof SurfaceCutValueStory>(CUT_STORY, { width: NARROW, cut: "label" });
  await expect(page.getByRole("button", { name: "Description", exact: true })).toBeVisible();
  expect(await enlargedTextFindings(page.getByRole("main"))).toEqual([expect.stringMatching(/^button "Description" has its value cut: /u)]);
});

const OVERLAY_STORY = "tests/support/browser/surface-design-fixtures/SurfaceDeclaredOverlayStory";
const OVER_CELL = /^button "Covered cell" \[.*\] overlaps button "Corner control" \[.*\]/u;
const OVER_NEXT = /^button "Corner control" \[.*\] overlaps button "Next cell" \[.*\]$/u;

test("the probe names a declared overlay by its relation and reports no finding for it", async ({ mount, page }) => {
  await mount<typeof SurfaceDeclaredOverlayStory>(OVERLAY_STORY, { declare: "declared" });
  await expect(page.getByRole("button", { name: "Corner control", exact: true })).toBeVisible();
  const geometry = await enlargedTextGeometry(page.getByRole("main"));
  expect(geometry.findings).toEqual([]);
  expect(geometry.declaredOverlays).toEqual([expect.stringMatching(new RegExp(`${OVER_CELL.source}, declared theme-menu-over-cell$`, "u"))]);
});

test("the probe still fails the same overlay when no box declares it", async ({ mount, page }) => {
  await mount<typeof SurfaceDeclaredOverlayStory>(OVERLAY_STORY, { declare: "none" });
  await expect(page.getByRole("button", { name: "Corner control", exact: true })).toBeVisible();
  const geometry = await enlargedTextGeometry(page.getByRole("main"));
  expect(geometry.findings).toEqual([expect.stringMatching(new RegExp(`${OVER_CELL.source}$`, "u"))]);
  expect(geometry.declaredOverlays).toEqual([]);
});

test("the probe still fails a declared control over a control outside its declaring box's parent", async ({ mount, page }) => {
  await mount<typeof SurfaceDeclaredOverlayStory>(OVERLAY_STORY, { declare: "foreign" });
  await expect(page.getByRole("button", { name: "Next cell", exact: true })).toBeVisible();
  const geometry = await enlargedTextGeometry(page.getByRole("main"));
  expect(geometry.findings).toEqual([expect.stringMatching(OVER_NEXT)]);
  expect(geometry.declaredOverlays).toEqual([expect.stringMatching(new RegExp(`${OVER_CELL.source}, declared theme-menu-over-cell$`, "u"))]);
});
