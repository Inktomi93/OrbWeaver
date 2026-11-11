// @subject tests/support/browser/enlarged-text-geometry.ts
// The probe's planted cases: a control under the boot veil or a closed dialog's leaving backdrop is read once the layer has left, a backdrop
// that never leaves fails the probe by its path, a control under a standing panel or an open dialog still fails, a scroller that scrolls sideways names the descendant that widens it,
// a control's own value cut with an ellipsis fails while a list row title the design truncates does not, and an overlay both sides
// declare is named apart while every other overlay still fails: one side or neither declared, two relations, a control outside the pair's
// parent, two controls of one declaring box, and a declaring box's control over a plain control beside the pair.
import { expect, test } from "@playwright/test";
import type { ComponentProps } from "react";
import { enlargedTextFindings, enlargedTextGeometry } from "./enlarged-text-geometry.ts";
import { HELD_LEAVING_TIMEOUT_MS, LEAVING_BACKDROP, LEAVING_RELEASE_EVENT, PLANTED_BACKDROP } from "./leaving-cover.ts";
import type {
  SurfaceCutValueStory,
  SurfaceDeclaredOverlayStory,
  SurfaceLeavingCoverStory,
  SurfaceSidewaysStory,
  SurfaceTabStripStory,
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

test("the probe refuses to read under a closed dialog's backdrop that never leaves, and names the backdrop", async ({ mount, page }) => {
  await mount<typeof SurfaceLeavingCoverStory>(LEAVING_STORY, { cover: "leaving" });
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm", exact: true }).click();
  // The close is held until the test releases it, so the backdrop stays leaving over the control for the whole probe.
  await expect(page.locator(LEAVING_BACKDROP)).toHaveCount(1);
  page.setDefaultTimeout(HELD_LEAVING_TIMEOUT_MS);
  const probe = enlargedTextFindings(page.getByRole("main"));
  await expect(probe).rejects.toThrow(/^enlarged-text geometry: a part never finished leaving: body > /u);
  await expect(probe).rejects.toThrow(PLANTED_BACKDROP);
});

test("the probe reads the control once the closed dialog's held backdrop has left", async ({ mount, page }) => {
  await mount<typeof SurfaceLeavingCoverStory>(LEAVING_STORY, { cover: "leaving" });
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.locator(LEAVING_BACKDROP)).toHaveCount(1);
  const findings = enlargedTextFindings(page.getByRole("main"));
  await page.evaluate((event) => dispatchEvent(new Event(event)), LEAVING_RELEASE_EVENT);
  expect(await findings).toEqual([]);
  await expect(page.locator(PLANTED_BACKDROP)).toHaveCount(0);
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

// The widened arms whose cause is the planted box: a wide child, a fixed-width box its block child only fills, and a wide child that
// overflows a right-to-left scroller to the left.
const WIDENING_BOXES = ["child", "filled", "rtl"] as const satisfies readonly ComponentProps<typeof SurfaceSidewaysStory>["widened"][];

for (const widened of WIDENING_BOXES) {
  test(`the sideways finding names the box that widens its scroller by a path that resolves to it (${widened})`, async ({ mount, page }) => {
    await mount<typeof SurfaceSidewaysStory>(SIDEWAYS_STORY, { widened });
    const scroller = page.locator('[data-planted="scroller"]');
    await expect(scroller).toBeVisible();
    const findings = await enlargedTextFindings(page.getByRole("main"));
    expect(findings).toEqual([expect.stringMatching(WIDENED_BY)]);
    const path = WIDENED_BY.exec(findings[0] ?? "")?.groups?.["path"] ?? "";
    // The strip beside it holds wider content than the planted box; only the planted box sets the scroller's width.
    expect(await scroller.evaluate((node, at) => node.querySelector(at) === node.querySelector('[data-planted="widening"]'), path)).toBe(true);
    // A checkpoint read at the far scroll position names the same box by the same overflow; a right-to-left scroller scrolls to negative offsets.
    await scroller.evaluate((node) =>
      node.scrollTo({ left: getComputedStyle(node).direction === "rtl" ? -node.scrollWidth : node.scrollWidth, behavior: "instant" }),
    );
    expect(await scroller.evaluate((node) => node.scrollLeft)).not.toBe(0);
    expect(await enlargedTextFindings(page.getByRole("main"))).toEqual(findings);
  });
}

test("the sideways finding names a scroller's own text when one unbreakable word in it widens it", async ({ mount, page }) => {
  await mount<typeof SurfaceSidewaysStory>(SIDEWAYS_STORY, { widened: "text" });
  const scroller = page.locator('[data-planted="scroller"]');
  await expect(scroller).toBeVisible();
  const findings = await enlargedTextFindings(page.getByRole("main"));
  expect(findings).toEqual([expect.stringMatching(/^div .* scrolls sideways by \d+, widened by its own text by \d+$/u)]);
  // The finding attributes the cause without carrying the text itself.
  expect(findings[0]).not.toContain(await scroller.evaluate((node) => node.firstChild?.textContent ?? ""));
});

const TAB_STRIP_STORY = "tests/support/browser/surface-design-fixtures/SurfaceTabStripStory";

test("the probe passes a tab strip that scrolls in a wrapper holding the tablist alone", async ({ mount, page }) => {
  await mount<typeof SurfaceTabStripStory>(TAB_STRIP_STORY, { wrapper: "strip" });
  const scroller = page.locator('[data-planted="scroller"]');
  await expect(page.getByRole("tablist", { name: "Planted views", exact: true })).toBeVisible();
  // The control for the silence: the wrapper does scroll sideways.
  expect(await scroller.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
  expect(await enlargedTextFindings(page.getByRole("main"))).toEqual([]);
});

test("the probe still fails a wrapper that holds more than the tablist", async ({ mount, page }) => {
  await mount<typeof SurfaceTabStripStory>(TAB_STRIP_STORY, { wrapper: "shared" });
  await expect(page.getByRole("tablist", { name: "Planted views", exact: true })).toBeVisible();
  expect(await enlargedTextFindings(page.getByRole("main"))).toEqual([expect.stringMatching(/^div .* scrolls sideways by \d+, widened by :scope > /u)]);
});

test("the probe still fails a wrapper its own text widens beside a lone tablist", async ({ mount, page }) => {
  await mount<typeof SurfaceTabStripStory>(TAB_STRIP_STORY, { wrapper: "text" });
  await expect(page.getByRole("tablist", { name: "Planted views", exact: true })).toBeVisible();
  expect(await enlargedTextFindings(page.getByRole("main"))).toEqual([
    expect.stringMatching(/^div .* scrolls sideways by \d+, widened by its own text by \d+$/u),
  ]);
});

test("the probe reports no sideways finding for a scroller its content fits", async ({ mount, page }) => {
  await mount<typeof SurfaceSidewaysStory>(SIDEWAYS_STORY, { widened: "none" });
  const scroller = page.locator('[data-planted="scroller"]');
  await expect(scroller).toBeVisible();
  // The control for the silence: the strip inside it does scroll, by its own declaration.
  expect(await scroller.locator("[data-sideways-strip]").evaluate((strip) => strip.scrollWidth > strip.clientWidth)).toBe(true);
  expect(await enlargedTextFindings(page.getByRole("main"))).toEqual([]);
});

const OVERLAY_STORY = "tests/support/browser/surface-design-fixtures/SurfaceDeclaredOverlayStory";
const OVER_CELL = /^button "Covered cell" \[.*\] overlaps button "Corner control" \[.*\]/u;
const OVER_NEXT = /^button "Corner control" \[.*\] overlaps button "Next cell" \[.*\]$/u;
const DECLARED_OVER_CELL = new RegExp(`${OVER_CELL.source}, declared theme-menu-over-cell$`, "u");
const UNDECLARED_OVER_CELL = new RegExp(`${OVER_CELL.source}$`, "u");

test("the probe names a declared overlay by its relation and reports no finding for it", async ({ mount, page }) => {
  await mount<typeof SurfaceDeclaredOverlayStory>(OVERLAY_STORY, { over: true, under: "same", layout: "corner" });
  await expect(page.getByRole("button", { name: "Corner control", exact: true })).toBeVisible();
  const geometry = await enlargedTextGeometry(page.getByRole("main"));
  expect(geometry.findings).toEqual([]);
  expect(geometry.declaredOverlays).toEqual([expect.stringMatching(DECLARED_OVER_CELL)]);
});

test("the probe still fails the same overlay when no box declares it", async ({ mount, page }) => {
  await mount<typeof SurfaceDeclaredOverlayStory>(OVERLAY_STORY, { over: false, under: "none", layout: "corner" });
  await expect(page.getByRole("button", { name: "Corner control", exact: true })).toBeVisible();
  const geometry = await enlargedTextGeometry(page.getByRole("main"));
  expect(geometry.findings).toEqual([expect.stringMatching(UNDECLARED_OVER_CELL)]);
  expect(geometry.declaredOverlays).toEqual([]);
});

// A declaration names both sides of the overlay: one side declared alone, or the two sides declaring different relations, is no design.
for (const [over, under] of [
  [false, "same"],
  [true, "none"],
  [true, "other"],
] as const) {
  test(`the probe still fails the overlay when the corner ${over ? "declares" : "does not declare"} and the cell declares ${under}`, async ({
    mount,
    page,
  }) => {
    await mount<typeof SurfaceDeclaredOverlayStory>(OVERLAY_STORY, { over, under, layout: "corner" });
    await expect(page.getByRole("button", { name: "Corner control", exact: true })).toBeVisible();
    const geometry = await enlargedTextGeometry(page.getByRole("main"));
    expect(geometry.findings).toEqual([expect.stringMatching(UNDECLARED_OVER_CELL)]);
    expect(geometry.declaredOverlays).toEqual([]);
  });
}

test("the probe still fails a declared control over a control outside its declaring box's parent", async ({ mount, page }) => {
  await mount<typeof SurfaceDeclaredOverlayStory>(OVERLAY_STORY, { over: true, under: "same", layout: "foreign" });
  await expect(page.getByRole("button", { name: "Next cell", exact: true })).toBeVisible();
  const geometry = await enlargedTextGeometry(page.getByRole("main"));
  expect(geometry.findings).toEqual([expect.stringMatching(OVER_NEXT)]);
  expect(geometry.declaredOverlays).toEqual([expect.stringMatching(DECLARED_OVER_CELL)]);
});

test("the probe still fails two controls of one declaring box that overlap each other", async ({ mount, page }) => {
  await mount<typeof SurfaceDeclaredOverlayStory>(OVERLAY_STORY, { over: true, under: "same", layout: "twin" });
  await expect(page.getByRole("button", { name: "Twin control", exact: true })).toBeVisible();
  const geometry = await enlargedTextGeometry(page.getByRole("main"));
  // The twin's hit area also takes the first control's centre; both readings name the same defect.
  expect(geometry.findings).toEqual([
    expect.stringMatching(/^button "Corner control" \[.*\] is covered at its centre by button "Twin control" /u),
    expect.stringMatching(/^button "Corner control" \[.*\] overlaps button "Twin control" \[.*\]$/u),
  ]);
  expect(geometry.declaredOverlays).toEqual([
    expect.stringMatching(DECLARED_OVER_CELL),
    expect.stringMatching(/^button "Covered cell" \[.*\] overlaps button "Twin control" \[.*\], declared theme-menu-over-cell$/u),
  ]);
});

test("the probe still fails a declaring box's second control over a control of the same parent that no box declares", async ({ mount, page }) => {
  await mount<typeof SurfaceDeclaredOverlayStory>(OVERLAY_STORY, { over: true, under: "same", layout: "uncovered" });
  await expect(page.getByRole("button", { name: "Second corner control", exact: true })).toBeVisible();
  const geometry = await enlargedTextGeometry(page.getByRole("main"));
  expect(geometry.findings).toEqual([expect.stringMatching(/^button "Plain cell" \[.*\] overlaps button "Second corner control" \[.*\]$/u)]);
  expect(geometry.declaredOverlays).toEqual([expect.stringMatching(DECLARED_OVER_CELL)]);
});
