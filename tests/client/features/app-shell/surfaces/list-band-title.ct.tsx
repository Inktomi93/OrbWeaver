// The list band inside the production shell: a section's name stays whole and the band's secondary actions fold into their menu
// first, with the context pane docked beside the content, while its primary create action stays inline. The shell's own
// stylesheet decides this, so the cases mount the shell.
import { seedShellState } from "@orb/testkit/browser/spec";
import { SECTION_LABELS, SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const BAND = '.shell-panel[data-panel-side="list"] .shell-panel-header';
const TRIGGER = '[data-slot="overflow-actions-trigger"]';
// On a phone the shell sheds the band's title, so the screen's name and census ride the topbar.
const PHONE_TITLE = '.shell-topbar-identity[data-identity="narrow"] .shell-topbar-title';
// A search that matches nothing turns the band's census into "0 of N", the widest figure the band prints.
const NOTHING_MATCHES = "no item has this name";
// The band's shown actions: each is a cell of the action row, and a folded cell is marked out of the row.
const SHOWN_CONTROLS = `[data-slot="list-pane-action"] > :not([data-overflowed]) :is(button, a)`;
// A band whose secondary action is a lone icon keeps it beside the primary's icon, so it has no menu; the others run
// short of room at the widest census and fold their secondary actions into the menu.
const FOLDING = [
  { id: "characters", label: SECTION_LABELS.characters },
  { id: "databank", label: SECTION_LABELS.databank },
] as const;
const UNFOLDED = [
  { id: "chats", label: SECTION_LABELS.chats },
  { id: "presets", label: SECTION_LABELS.presets },
] as const;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

let root: Root;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.beforeEach(async ({ corpus, page }) => {
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SECTION_PROCEDURES);
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

test.use({ viewport: { width: 1280, height: 900 } });

/** The band at its widest census, its name whole, and its shown primary: the last control the band shows. */
async function widestBand(page: Page, label: string): Promise<{ readonly band: Locator; readonly primary: Locator }> {
  const band = page.locator(BAND);
  const title = band.getByRole("heading", { level: 2 });
  const name = title.locator("> span").first();
  await expect(name).toHaveText(label);
  await page.locator('[data-slot="list-search"] input').first().fill(NOTHING_MATCHES);
  await expect(title).toContainText(" of ");
  await expect.poll(() => name.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const primary = band.locator(SHOWN_CONTROLS).last();
  await expect(primary).toBeVisible();
  return { band, primary };
}

for (const collection of FOLDING) {
  test(`the ${collection.id} band keeps its whole name and its primary inline while its other actions fold into the menu, with Context docked`, async ({
    mount,
    page,
  }) => {
    await seedShellState(page, { activeSection: collection.id, panelOverrides: { [collection.id]: { list: "docked", context: "docked" } } });
    await mount<typeof AppShellStory>(STORY, {});
    const { band, primary } = await widestBand(page, collection.label);
    const primaryName = await primary.evaluate((element) => element.getAttribute("aria-label") ?? element.textContent.trim());
    // The positive control: the band really is short of room, so its secondary actions are in the menu and its primary is not.
    await band.locator(TRIGGER).click();
    await expect(page.getByRole("menuitem").first()).toBeVisible();
    await expect(page.getByRole("menuitem").filter({ hasText: primaryName })).toHaveCount(0);
  });
}

for (const collection of [...FOLDING, ...UNFOLDED]) {
  test(`the ${collection.id} band's actions overlap neither its whole name nor its census, with Context docked`, async ({ mount, page }) => {
    await seedShellState(page, { activeSection: collection.id, panelOverrides: { [collection.id]: { list: "docked", context: "docked" } } });
    await mount<typeof AppShellStory>(STORY, {});
    const { band } = await widestBand(page, collection.label);
    const title = band.getByRole("heading", { level: 2 });
    const name = title.locator("> span").first();
    const census = band.locator('[data-slot="list-pane-census"]');
    await expect(census).toBeVisible();
    // The room settles a frame after the census grows, so the clearances are read until they hold.
    await expect
      .poll(async () => {
        const [nameBox, censusBox, actionBoxes] = await Promise.all([
          name.boundingBox(),
          census.boundingBox(),
          band.locator(SHOWN_CONTROLS).evaluateAll((controls) => controls.map((control) => control.getBoundingClientRect().left)),
        ]);
        const firstAction = Math.min(...actionBoxes);
        return {
          nameClearsCensus: nameBox !== null && censusBox !== null && nameBox.x + nameBox.width <= censusBox.x,
          censusClearsActions: censusBox !== null && censusBox.x + censusBox.width <= firstAction,
          nameWhole: await name.evaluate((element) => element.scrollWidth <= element.clientWidth),
        };
      })
      .toEqual({ nameClearsCensus: true, censusClearsActions: true, nameWhole: true });
  });
}

for (const collection of UNFOLDED) {
  test(`the ${collection.id} band keeps its whole name, its secondary action and its primary inline, with Context docked`, async ({ mount, page }) => {
    await seedShellState(page, { activeSection: collection.id, panelOverrides: { [collection.id]: { list: "docked", context: "docked" } } });
    await mount<typeof AppShellStory>(STORY, {});
    const { band } = await widestBand(page, collection.label);
    await expect(band.locator(SHOWN_CONTROLS)).toHaveCount(2);
    await expect(band.locator(TRIGGER)).toHaveCount(0);
  });
}

/** How a census paints in the box that holds it: all of it, none of it, or a fragment that reads as another number. */
const CENSUS_PAINTS = ["whole", "gone", "partial"] as const;
type CensusPaint = (typeof CENSUS_PAINTS)[number];
const WHOLE_OR_GONE = /^(whole|gone)$/u;
// A box edge sits on a fractional pixel after a layout step, so an edge within this distance counts as on the other box's edge.
const EDGE_TOLERANCE_PX = 0.5;

interface Extent {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

interface PaintedText {
  readonly visible: boolean;
  /** What can paint: the holder's box cut by every clipping box between the text and the holder. */
  readonly clip: Extent;
  /** The text's own line boxes. */
  readonly glyphs: readonly Extent[];
}

async function readPaintedText(census: Locator, holderSelector: string): Promise<PaintedText> {
  // The room settles over a frame or two after the census, the text size or the pane width changes, so the read follows two frames.
  await census.page().evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  return census.evaluate((element, selector): PaintedText => {
    const holder = element.closest(selector);
    if (holder === null) {
      throw new Error(`The census has no ${selector} around it`);
    }
    // A DOMRect keeps its edges on its prototype, so each box crosses the wire as a plain extent.
    const extentOf = ({ left, right, top, bottom }: DOMRect): Extent => ({ left, right, top, bottom });
    let clip = extentOf(holder.getBoundingClientRect());
    for (let box: Element | null = element; box !== null && box !== holder.parentElement; box = box.parentElement) {
      const { overflowX, overflowY } = getComputedStyle(box);
      const rect = box.getBoundingClientRect();
      if (overflowX !== "visible" || overflowY !== "visible") {
        clip = {
          left: Math.max(clip.left, rect.left),
          right: Math.min(clip.right, rect.right),
          top: Math.max(clip.top, rect.top),
          bottom: Math.min(clip.bottom, rect.bottom),
        };
      }
    }
    const glyphs: Extent[] = [];
    for (const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT); walker.nextNode(); ) {
      const range = document.createRange();
      range.selectNodeContents(walker.currentNode);
      glyphs.push(...[...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0).map(extentOf));
    }
    return { visible: element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }), clip, glyphs };
  }, holderSelector);
}

/** A line's glyph box runs past its element's box above and below, so the block axis asks only which line the glyphs sit on. */
function onLine(glyph: Extent, clip: Extent): boolean {
  const middle = (glyph.top + glyph.bottom) / 2;
  return middle >= clip.top && middle <= clip.bottom;
}

function classifyPaint({ visible, clip, glyphs }: PaintedText): CensusPaint {
  const apart = (glyph: Extent): boolean =>
    !onLine(glyph, clip) || glyph.right <= clip.left + EDGE_TOLERANCE_PX || glyph.left >= clip.right - EDGE_TOLERANCE_PX;
  const inside = (glyph: Extent): boolean =>
    onLine(glyph, clip) && glyph.left >= clip.left - EDGE_TOLERANCE_PX && glyph.right <= clip.right + EDGE_TOLERANCE_PX;
  if (!visible || (glyphs.length > 0 && glyphs.every(apart))) {
    return "gone";
  }
  return glyphs.length > 0 && glyphs.every(inside) ? "whole" : "partial";
}

async function paintOf(census: Locator, holderSelector: string): Promise<CensusPaint> {
  return classifyPaint(await readPaintedText(census, holderSelector));
}

for (const collection of [...FOLDING, ...UNFOLDED]) {
  test(`the ${collection.id} band prints its census whole or not at all, and its value stays in the heading's name, with Context docked`, async ({
    mount,
    page,
  }) => {
    await seedShellState(page, { activeSection: collection.id, panelOverrides: { [collection.id]: { list: "docked", context: "docked" } } });
    await mount<typeof AppShellStory>(STORY, {});
    const title = page.locator(BAND).getByRole("heading", { level: 2 });
    const census = page.locator(BAND).locator('[data-slot="list-pane-census"]');
    await expect(title).toContainText(collection.label);
    // The positive control: the census is in the band, whatever the room does with it.
    await expect(census).toHaveText(/\d/u);
    await expect(title).toHaveAccessibleName(new RegExp(`${collection.label}.*${(await census.textContent()) ?? ""}`, "u"));
    expect(await paintOf(census, '[data-slot="list-pane-title"]')).toMatch(WHOLE_OR_GONE);
    // The widest census the band prints.
    await page.locator('[data-slot="list-search"] input').first().fill(NOTHING_MATCHES);
    await expect(census).toContainText(" of ");
    await expect(title).toHaveAccessibleName(new RegExp(`${collection.label}.*${(await census.textContent()) ?? ""}`, "u"));
    expect(await paintOf(census, '[data-slot="list-pane-title"]')).toMatch(WHOLE_OR_GONE);
  });
}

test.describe("on the narrowest phone", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 320, height: 800 } });

  for (const collection of [...FOLDING, ...UNFOLDED]) {
    test(`the ${collection.id} screen name prints its census whole or not at all, and its value stays in the name`, async ({ mount, page }) => {
      await seedShellState(page, { activeSection: collection.id });
      await mount<typeof AppShellStory>(STORY, {});
      const title = page.locator(PHONE_TITLE);
      const census = title.locator(".shell-topbar-title-census");
      await expect(title.locator(".shell-topbar-title-name")).toHaveText(collection.label);
      await expect(census).toHaveText(/\d/u);
      await expect(title).toContainText((await census.textContent()) ?? "");
      expect(await paintOf(census, ".shell-topbar-title")).toMatch(WHOLE_OR_GONE);
      await page.locator('[data-slot="list-search"] input').first().fill(NOTHING_MATCHES);
      await expect(census).toContainText(" of ");
      await expect(title).toContainText((await census.textContent()) ?? "");
      expect(await paintOf(census, ".shell-topbar-title")).toMatch(WHOLE_OR_GONE);
    });
  }
});
