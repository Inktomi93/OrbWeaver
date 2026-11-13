// The overflow rows' room, focus and offline behaviour on the production shell, at the widths and text scales where they were
// measured to fail: a row claims only what it shows and keeps its trigger on screen; a surface opened from the More menu
// returns focus to the trigger; arrival focus skips an action that moved into the menu; a pane whose first read cannot proceed
// offline paints its own copy; hidden entries leave no box and no gap.
import { enlargeUntilVisible, resolvedLength, seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, createShellAmbientReads, routeTrpc, SECTION_LABELS, SECTION_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import { QUERY_WAITING_LINE, queryFailedLabel } from "#client/data/query-state-copy.ts";
import { BUG_REPORT_NAME, BUG_REPORT_NOTE_NAME } from "#client/features/app-shell/lib/app-shell-names.ts";
import { CHARACTER_NEW_NAME } from "#client/features/character/lib/character-names.ts";
import { DATABANK_LANDING_NAME } from "#client/features/databank/lib/databank-names.ts";
import { NOTIFICATIONS_BELL_NAME } from "#client/features/notifications/lib/notifications-copy.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
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
// The client retries a failed read twice on its backoff before the pane can say so.
const READ_RETRIES_MS = 10_000;

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

const ownerCaller = (): ReturnType<Root["internalCallerFor"]> => root.internalCallerFor(root.ownerId);

function boxOf(
  locator: Locator,
): Promise<{ readonly left: number; readonly right: number; readonly top: number; readonly bottom: number; readonly width: number }> {
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width };
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
      elements
        .filter((element) => element.checkVisibility())
        .map((element) => ({ left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right })),
    );
  return { shown: boxes.length, off: boxes.filter((box) => box.left < -SUBPIXEL || box.right > width + SUBPIXEL) };
}

const SCALES = [5, 6, 7, 8] as const;
const POPOVER_SCALES = [1.5, 2, 2.5, 3] as const;

test.describe("on a phone", () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test("Escape from the chat import dialog, opened from the band's menu, returns focus to the trigger", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof AppShellStory>(STORY, {});
    const trigger = page.locator(BAND_ACTION).locator(TRIGGER);
    await enlargeUntilVisible(page, trigger, FONT_SCALE_PROPERTY, SCALES);
    // By keyboard, as a screen-reader user opens it: the item that held focus is gone when the dialog closes.
    await trigger.focus();
    await page.keyboard.press("Enter");
    // The band folds its other actions and keeps New, so its menu holds only the import door.
    const item = page.getByRole("menuitem");
    await expect(item).toHaveCount(1);
    await item.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
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

  test("keyboard arrival skips the band's first action once it has moved into the menu, and lands on the primary", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "home" });
    await mount<typeof AppShellStory>(STORY, {});
    await setRootFontScale(page, FONT_SCALE_PROPERTY, 4);
    const entry = page.locator(".shell-rail").getByRole("button", { name: SECTION_LABELS.chats, exact: true });
    await entry.focus();
    await entry.press("Enter");
    const action = page.locator(BAND_ACTION);
    await expect(action.locator(TRIGGER)).toBeVisible();
    await expect(action.getByRole("button", { name: /^New/u })).toBeFocused();
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

  test("the topbar title keeps the room the moved doors left, and the trail claims only New and its trigger", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "characters" });
    await mount<typeof AppShellStory>(STORY, {});
    const trail = page.locator(TRAIL);
    const trigger = trail.locator(TRIGGER);
    await expect(trigger).toBeVisible();
    const claim = (await boxOf(trail)).width;
    // The trail spans New to its trigger: Import and the rest of the trail have folded into the menu.
    const create = await boxOf(trail.getByRole("button", { name: CHARACTER_NEW_NAME, exact: true }));
    expect(claim).toBeLessThanOrEqual((await boxOf(trigger)).right - create.left + SUBPIXEL);
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

  test("the Notifications popover, opened from the trail's menu, opens whole on the screen from a folded bell and Escape returns focus to the trigger", async ({
    mount,
    page,
  }) => {
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof AppShellStory>(STORY, {});
    const trigger = page.locator(TRAIL).locator(TRIGGER);
    // The smallest step that folds the bell.
    await enlargeUntilVisible(page, trigger, FONT_SCALE_PROPERTY, POPOVER_SCALES);
    // By keyboard, as a screen-reader user opens it: the item that held focus is gone when the popover closes.
    await trigger.focus();
    await page.keyboard.press("Enter");
    const item = page.getByRole("menuitem", { name: NOTIFICATIONS_BELL_NAME, exact: true });
    await item.focus();
    await page.keyboard.press("Enter");
    const popup = page.locator('[data-slot="popover-popup"]');
    await expect(popup).toBeVisible();
    // The bell's own control is folded, inert and out of the row, which is the popover's anchor. The popup opens whole
    // on the screen, and its edge sits within a control's width of the trigger, so the anchor has not been displaced.
    const opened = await boxOf(popup);
    const anchor = await boxOf(trigger);
    const apart = Math.hypot(
      Math.max(anchor.left - opened.right, opened.left - anchor.right, 0),
      Math.max(anchor.top - opened.bottom, opened.top - anchor.bottom, 0),
    );
    expect(apart).toBeLessThanOrEqual(await resolvedLength(page, `var(${TOKENS["size.control-md"].cssVar})`));
    expect([
      opened.top >= -SUBPIXEL,
      opened.left >= -SUBPIXEL,
      opened.right <= DESKTOP.width + SUBPIXEL,
      opened.bottom <= DESKTOP.height + SUBPIXEL,
    ]).toStrictEqual([true, true, true, true]);
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  });

  for (const entry of [
    { name: NOTIFICATIONS_BELL_NAME, surface: { role: "dialog", name: NOTIFICATIONS_BELL_NAME } },
    { name: BUG_REPORT_NAME, surface: { role: "textbox", name: BUG_REPORT_NOTE_NAME } },
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

const PANE = ".shell-content [data-ready]";

const COLD_PANES = [
  {
    name: "Databank",
    section: "databank",
    label: SECTION_LABELS.databank,
    reads: ["databank.bankHealth"],
    failed: queryFailedLabel("your databank"),
    landing: (pane: Locator): Locator => pane.getByText(DATABANK_LANDING_NAME, { exact: true }),
  },
  {
    name: "Plugin pages",
    section: "extensions",
    label: SECTION_LABELS.extensions,
    reads: ["plugin.list", "plugin.listSurfaces"],
    failed: queryFailedLabel("your plugins"),
    landing: (pane: Locator): Locator => pane.getByRole("heading").first(),
  },
] as const;

/** The shell's reads, with `reads` failing until the returned `recover` runs: home warms some of them, so a failed read is what leaves the cache cold. */
async function routeColdReads(page: Page, corpus: CorpusPlayback, reads: (typeof COLD_PANES)[number]["reads"]): Promise<() => void> {
  const caller = await ownerCaller();
  let failing = true;
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, SECTION_PROCEDURES),
    ...serveCorpusProcedures(caller, reads, () => (failing ? trpcError() : undefined)),
  });
  return (): void => {
    failing = false;
  };
}

test.describe("offline, where the first read of a pane waits for the network", () => {
  test.use({ viewport: DESKTOP });

  for (const family of COLD_PANES) {
    test(`a cold ${family.name} pane says it is waiting while offline, and shows its landing when the connection returns`, async ({ corpus, mount, page }) => {
      const recover = await routeColdReads(page, corpus, family.reads);
      await seedShellState(page, { activeSection: "home" });
      await mount<typeof AppShellStory>(STORY, {});
      await page.context().setOffline(true);
      await page.locator(".shell-rail").getByRole("button", { name: family.label, exact: true }).click();
      const pane = page.locator(PANE);
      await expect(pane.getByText(QUERY_WAITING_LINE, { exact: true })).toBeVisible();
      recover();
      await page.context().setOffline(false);
      await expect(family.landing(pane)).toBeVisible();
      await expect(pane.getByText(QUERY_WAITING_LINE, { exact: true })).toHaveCount(0);
    });

    test(`a ${family.name} pane whose first read fails says so, and Retry shows its landing`, async ({ corpus, mount, page }) => {
      const recover = await routeColdReads(page, corpus, family.reads);
      await seedShellState(page, { activeSection: family.section });
      await mount<typeof AppShellStory>(STORY, {});
      const pane = page.locator(PANE);
      await expect(pane.getByText(family.failed, { exact: true })).toBeVisible({ timeout: READ_RETRIES_MS });
      recover();
      await pane.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
      await expect(family.landing(pane)).toBeVisible();
      await expect(pane.getByText(family.failed, { exact: true })).toHaveCount(0);
    });
  }

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
      const pane = page.locator(PANE);
      await expect(pane).toHaveAttribute("data-ready", "true");
      await expect(pane).toHaveCSS("opacity", "1");
      await page.context().setOffline(false);
    });
  }
});
