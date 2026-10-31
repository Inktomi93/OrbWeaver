// The overflow rows' room, focus and offline behaviour on the production shell, at the widths and text scales where they were
// measured to fail: a row claims only what it shows and keeps its trigger on screen; a surface opened from the More menu
// returns focus to the trigger; arrival focus skips an action that moved into the menu; a pane whose first read cannot proceed
// offline paints its own copy; hidden entries leave no box and no gap.
import { enlargeUntilVisible, seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, SECTION_LABELS, SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const FONT_SCALE_PROPERTY = channelName("fontScale");
const TRIGGER = '[data-slot="overflow-actions-trigger"]';
const TRAIL = ".shell-topbar-trail";
const BAND_ACTION = '.shell-panel[data-panel-side="list"] [data-slot="list-pane-action"]';
const PHONE = { width: 390, height: 844 } as const;
const NARROWEST_PHONE = { width: 320, height: 640 } as const;
const DESKTOP = { width: 1440, height: 900 } as const;
// Sub-pixel layout rounding.
const SUBPIXEL = 1;

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

function boxOf(locator: Locator): Promise<{ readonly left: number; readonly right: number; readonly width: number }> {
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, width: box.width };
  });
}

/** The triggers shown on the page, and those that lie past the viewport's edges, once the trail's own has shown. */
async function triggersAgainst(
  page: Page,
  width: number,
): Promise<{ readonly shown: number; readonly off: readonly { readonly left: number; readonly right: number }[] }> {
  await expect(page.locator(TRAIL).locator(TRIGGER)).toBeVisible();
  const boxes = await page
    .locator(TRIGGER)
    .evaluateAll((elements) =>
      elements.filter((element) => element.checkVisibility()).map((element) => element.getBoundingClientRect().toJSON() as { left: number; right: number }),
    );
  return { shown: boxes.length, off: boxes.filter((box) => box.left < -SUBPIXEL || box.right > width + SUBPIXEL) };
}

const SCALES = [5, 6, 7, 8] as const;

test.describe("on a phone", () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test("Escape from the refinery start picker, opened from the band's menu, returns focus to the trigger", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "refinery" });
    await mount<typeof AppShellStory>(STORY, {});
    const trigger = page.locator(BAND_ACTION).locator(TRIGGER);
    await enlargeUntilVisible(page, trigger, FONT_SCALE_PROPERTY, SCALES);
    // By keyboard, as a screen-reader user opens it: the item that held focus is gone when the picker closes.
    await trigger.focus();
    await page.keyboard.press("Enter");
    const item = page.getByRole("menuitem", { name: "Start a new session", exact: true });
    await item.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-slot="popover-popup"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  });

  test("at 300% text every trigger stays on screen", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof AppShellStory>(STORY, {});
    await setRootFontScale(page, FONT_SCALE_PROPERTY, 3);
    const { shown, off } = await triggersAgainst(page, PHONE.width);
    expect(shown).toBeGreaterThan(0);
    expect(off).toEqual([]);
  });

  test("keyboard arrival lands on the menu trigger when the band's first action has moved into it", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "home" });
    await mount<typeof AppShellStory>(STORY, {});
    await setRootFontScale(page, FONT_SCALE_PROPERTY, 4);
    const entry = page.locator(".shell-rail").getByRole("button", { name: SECTION_LABELS.chats, exact: true });
    await entry.focus();
    await entry.press("Enter");
    const trigger = page.locator(BAND_ACTION).locator(TRIGGER);
    await expect(trigger).toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test("at 200% text a band keeps its primary inline in the room its shed title left", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof AppShellStory>(STORY, {});
    await setRootFontScale(page, FONT_SCALE_PROPERTY, 2);
    const action = page.locator(BAND_ACTION);
    await expect(action.getByRole("button", { name: "New", exact: true })).toBeVisible();
    await expect(action.locator(TRIGGER)).toHaveCount(0);
  });
});

test.describe("on the narrowest phone", () => {
  test.use({ viewport: NARROWEST_PHONE, hasTouch: true, isMobile: true });

  test("the topbar title keeps the room the moved doors left, and the trail claims only its trigger", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "characters" });
    await mount<typeof AppShellStory>(STORY, {});
    const trail = page.locator(TRAIL);
    const trigger = trail.locator(TRIGGER);
    await expect(trigger).toBeVisible();
    const claim = (await boxOf(trail)).width;
    expect(claim).toBeLessThanOrEqual((await boxOf(trigger)).width + SUBPIXEL);
    const title = page.locator('.shell-topbar-identity[data-identity="narrow"] .shell-topbar-title');
    await expect.poll(() => title.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
  });

  test("at 200% text every trigger stays on screen", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "characters" });
    await mount<typeof AppShellStory>(STORY, {});
    await setRootFontScale(page, FONT_SCALE_PROPERTY, 2);
    const { shown, off } = await triggersAgainst(page, NARROWEST_PHONE.width);
    expect(shown).toBeGreaterThan(0);
    expect(off).toEqual([]);
  });

  test("the trail of a section with no visible action takes no box", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "home" });
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(".shell-topbar")).toBeVisible();
    await expect.poll(async () => (await boxOf(page.locator(TRAIL))).width).toBeLessThanOrEqual(SUBPIXEL);
    // The control: a section with a visible action gives its trail a box.
    await page.locator(".shell-rail").getByRole("button", { name: SECTION_LABELS.characters, exact: true }).click();
    await expect.poll(async () => (await boxOf(page.locator(TRAIL))).width).toBeGreaterThan(SUBPIXEL);
  });
});

test.describe("on a desktop", () => {
  test.use({ viewport: DESKTOP });

  test("the trail's visible actions sit at one even gap, with no hole where an entry renders nothing", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof AppShellStory>(STORY, {});
    const buttons = page.locator(TRAIL).getByRole("button");
    await expect(buttons.first()).toBeVisible();
    await expect
      .poll(async () => {
        const boxes = await buttons.evaluateAll((elements) =>
          elements
            .filter((element) => element.checkVisibility())
            .map((element) => element.getBoundingClientRect())
            .map((box) => ({ left: box.left, right: box.right }))
            .toSorted((a, b) => a.left - b.left),
        );
        const gaps = boxes.slice(1).map((box, index) => Math.round((box.left - (boxes[index]?.right ?? 0)) * 10) / 10);
        return gaps.length > 1 && Math.max(...gaps) - Math.min(...gaps) <= SUBPIXEL;
      })
      .toBe(true);
  });

  for (const entry of [
    { name: "Notifications", surface: { role: "dialog", name: "Notifications" } },
    { name: "Report a bug", surface: { role: "textbox", name: "What happened?" } },
    { name: "Jump to…", surface: { role: "dialog", name: undefined } },
  ] as const) {
    test(`Escape from ${entry.name}, opened from the More menu, returns focus to the trigger`, async ({ mount, page }) => {
      await seedShellState(page, { activeSection: "chats" });
      await mount<typeof AppShellStory>(STORY, {});
      await setRootFontScale(page, FONT_SCALE_PROPERTY, 3);
      const trigger = page.locator(TRAIL).locator(TRIGGER);
      // By keyboard, as a screen-reader user opens it: the item that held focus is gone when the surface closes.
      await trigger.focus();
      await page.keyboard.press("Enter");
      const item = page.getByRole("menuitem", { name: entry.name });
      await item.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole(entry.surface.role, entry.surface.name === undefined ? {} : { name: entry.surface.name, exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
    });
  }
});

test.describe("offline, where the first read of a pane waits for the network", () => {
  test.use({ viewport: DESKTOP });

  for (const family of [
    { name: "Presets", label: SECTION_LABELS.presets },
    { name: "Databank", label: SECTION_LABELS.databank },
    { name: "Plugin pages", label: SECTION_LABELS.extensions },
  ] as const) {
    test(`the ${family.name} pane settles and shows its own state instead of staying transparent`, async ({ mount, page }) => {
      await seedShellState(page, { activeSection: "home" });
      await mount<typeof AppShellStory>(STORY, {});
      await page.context().setOffline(true);
      await page.locator(".shell-rail").getByRole("button", { name: family.label, exact: true }).click();
      const pane = page.locator(".shell-content [data-ready]");
      await expect(pane).toHaveAttribute("data-ready", "true");
      await expect(pane).toHaveCSS("opacity", "1");
      await page.context().setOffline(false);
    });
  }
});
