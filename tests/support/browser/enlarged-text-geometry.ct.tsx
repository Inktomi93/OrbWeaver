// @subject tests/support/browser/enlarged-text-geometry.ts
// The probe's planted cases: a control under the boot veil or a closed dialog's leaving backdrop is read once the layer has left, a control
// under a standing panel or an open dialog still fails, a scroller that scrolls sideways names the descendant that widens it,
// a control's own value cut with an ellipsis fails while a list row title the design truncates does not, and a declared overlay is
// named apart while an undeclared one, or the declared control over a control the declaration does not cover, still fails.
import { expect, test } from "@playwright/test";
import { enlargedTextFindings, enlargedTextGeometry } from "./enlarged-text-geometry.ts";
import type {
  SurfaceCutValueStory,
  SurfaceDeclaredOverlayStory,
  SurfaceLeavingCoverStory,
  SurfaceSidewaysStory,
  SurfaceVeilCoverStory,
} from "./surface-design-fixtures.tsx";

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

const LEAVING_STORY = "tests/support/browser/surface-design-fixtures/SurfaceLeavingCoverStory";
const LEAVING_BACKDROP = '[data-slot="alert-dialog-backdrop"][data-ending-style]';

test("the probe waits for a closed dialog's backdrop to leave instead of reading the control it covers", async ({ mount, page }) => {
  await mount<typeof SurfaceLeavingCoverStory>(LEAVING_STORY, { cover: "leaving" });
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm", exact: true }).click();
  // The closed dialog's backdrop is still mounted and leaving when the probe starts.
  await expect(page.locator(LEAVING_BACKDROP)).toHaveCount(1);
  expect(await enlargedTextFindings(page.getByRole("main"))).toEqual([]);
  await expect(page.locator('[data-slot="alert-dialog-backdrop"]')).toHaveCount(0);
});

test("the probe still fails a control an open dialog's layers stand over", async ({ mount, page }) => {
  await mount<typeof SurfaceLeavingCoverStory>(LEAVING_STORY, { cover: "standing" });
  await expect(page.getByRole("alertdialog")).toBeVisible();
  // The open modal hides the page from the accessibility tree, so the scope is found by its element.
  expect(await enlargedTextFindings(page.locator("main"))).toEqual([expect.stringMatching(/^button "Restore" \[.*\] is covered at its centre by div /u)]);
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

const SIDEWAYS_STORY = "tests/support/browser/surface-design-fixtures/SurfaceSidewaysStory";
const WIDENED_BY = /^div .* scrolls sideways by \d+, widened by (?<path>:scope(?: > [^ ]+)+) by \d+$/u;

test("the sideways finding names the descendant that widens its scroller by a path that resolves to it", async ({ mount, page }) => {
  await mount<typeof SurfaceSidewaysStory>(SIDEWAYS_STORY, { widened: true });
  const scroller = page.locator('[data-planted="scroller"]');
  await expect(scroller).toBeVisible();
  const findings = await enlargedTextFindings(page.getByRole("main"));
  expect(findings).toEqual([expect.stringMatching(WIDENED_BY)]);
  const path = WIDENED_BY.exec(findings[0] ?? "")?.groups?.["path"] ?? "";
  // The strip beside it holds wider content than the planted child; only the planted child widens the scroller.
  expect(await scroller.evaluate((node, at) => node.querySelector(at) === node.querySelector('[data-planted="widening"]'), path)).toBe(true);
  // A checkpoint read at the far scroll position names the same descendant by the same overflow.
  await scroller.evaluate((node) => node.scrollTo({ left: node.scrollWidth, behavior: "instant" }));
  expect(await enlargedTextFindings(page.getByRole("main"))).toEqual(findings);
});

test("the probe reports no sideways finding for a scroller its content fits", async ({ mount, page }) => {
  await mount<typeof SurfaceSidewaysStory>(SIDEWAYS_STORY, { widened: false });
  const scroller = page.locator('[data-planted="scroller"]');
  await expect(scroller).toBeVisible();
  // The control for the silence: the strip inside it does scroll, by its own declaration.
  expect(await scroller.locator("[data-sideways-strip]").evaluate((strip) => strip.scrollWidth > strip.clientWidth)).toBe(true);
  expect(await enlargedTextFindings(page.getByRole("main"))).toEqual([]);
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
