// Every registered modal through the shell's one ModalHost: focus on open and on close, a locked document with the
// overflow inside the popup, Escape, and the theme, colorization and density the portal inherits from the shell.
import { BLANK_CHAT_NAME, START_NEW_CHAT_NAME } from "@orb/client/lib";
import type { ModalSlotId } from "@orb/client/state";
import { MODAL_SLOT_IDS } from "@orb/client/state";
import { createCharacterSchema } from "@orb/contracts/character";
import type { ThemeId } from "@orb/kit/ids";
import { seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, SECTION_LABELS } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { forEachNonEmpty } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import { CHAT_SAVED_ROSTER_DOOR_NAME as SAVED_ROSTER_DOOR } from "#client/features/chat/lib/chat-surface-names.ts";
import type { AppShellModalStory, AppShellStory } from "./_app-shell-stories.tsx";
import { routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const MODAL_STORY = `${SHELL_STORIES}/AppShellModalStory`;
const POPUP = '[data-slot="dialog-popup"], [data-slot="drawer-popup"]';
// Past Home: the Chats section, every modal body and the shell's theme reads.
const SERVED = [
  "sessions.me",
  "chat.listChats",
  "chat.countChats",
  "character.list",
  "rosterPreset.list",
  "databank.listGlobal",
  "worldInfo.listBooks",
  "settings.getUserSettings",
  "settings.listThemes",
  "settings.getTheme",
  "notifications.markAllRead",
  "plugin.list",
  "plugin.listSurfaces",
] as const;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

const WIDE_SHORT_VIEWPORTS = [
  { width: 844, height: 390 },
  { width: 1024, height: 420 },
] as const;
const STACKED_SHORT_VIEWPORT = { width: 568, height: 320 } as const;
const ENLARGED_LANDSCAPE_CELLS = [
  { width: 844, height: 390, factor: 2 },
  { width: 844, height: 390, factor: 3 },
  { width: 568, height: 320, factor: 2 },
] as const;
// The Jump to palette opens by its keyboard door on both landscape phone sizes at the default size and both enlarged ones.
const PALETTE_CELLS = [
  { width: 844, height: 390, factor: 1 },
  { width: 844, height: 390, factor: 2 },
  { width: 844, height: 390, factor: 3 },
  { width: 568, height: 320, factor: 1 },
  { width: 568, height: 320, factor: 2 },
  { width: 568, height: 320, factor: 3 },
] as const;
// At 300% the Chats list door is out of reach of a press on these screens, so New chat opens through the palette's own command, as a keyboard user opens it.
const PALETTE_NEW_CHAT_CELLS = [
  { width: 844, height: 390, factor: 3 },
  { width: 568, height: 320, factor: 3 },
] as const;

/** A saved roster for the owner, so New chat shows its saved-roster door. */
async function seedRosterPreset(root: Root): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  if ((await caller.rosterPreset.list()).length > 0) {
    return;
  }
  const [character] = (await caller.character.list({})).items;
  if (character === undefined) {
    throw new Error("The corpus has no character to save in a roster");
  }
  await caller.rosterPreset.create({ input: { name: "Landscape roster", members: [{ kind: "character", characterId: character.id, position: 0 }] } });
}

/** Where New chat's first row stands at open: its list and popup scroll positions, and whether it is whole and uncovered. */
function firstRowAtOpen(option: Element): {
  readonly listScrollTop: number | undefined;
  readonly popupScrollTop: number | undefined;
  readonly wholeInList: boolean;
  readonly footClear: boolean;
} {
  const list = option.closest('[data-slot="command-list"]');
  const popup = option.closest('[data-slot="dialog-popup"]');
  const box = option.getBoundingClientRect();
  const hit = document.elementFromPoint(box.left + box.width / 2, box.bottom - 2);
  return {
    listScrollTop: list?.scrollTop,
    popupScrollTop: popup?.scrollTop,
    wholeInList: list !== null && box.top >= list.getBoundingClientRect().top && box.bottom <= list.getBoundingClientRect().bottom,
    footClear: hit !== null && option.contains(hit),
  };
}

/** How far, in px, the popup's body box reaches past the popup's padding box on either inline side. */
function bodyReachPastPopup(popup: Element): number {
  const body = popup.querySelector(":scope > div");
  if (body === null) {
    return Number.NaN;
  }
  const edge = popup.getBoundingClientRect();
  const left = edge.left + popup.clientLeft;
  const right = left + popup.clientWidth;
  const box = body.getBoundingClientRect();
  return Math.max(left - box.left, box.right - right, 0);
}

/** How many of the list's options sit whole inside the list's own box. */
function wholeRowCount(list: Element): number {
  const frame = list.getBoundingClientRect();
  return [...list.querySelectorAll('[role="option"]')].filter((option) => {
    const box = option.getBoundingClientRect();
    return box.top >= frame.top - 0.5 && box.bottom <= frame.bottom + 0.5;
  }).length;
}

const FIELD_IN_VIEW_RATIO = 0.98;

/** A short dialog's top: its title whole on one truncating line (the full text stays its name), Close pressable, and the search field in view. */
async function expectTitleCloseAndFieldOnScreen(dialog: Locator, title: string): Promise<void> {
  const heading = dialog.getByRole("heading", { name: title, exact: true });
  await expect(heading).toBeInViewport({ ratio: 1 });
  await expect(heading).toHaveCSS("white-space", "nowrap");
  await expect(heading).toHaveCSS("text-overflow", "ellipsis");
  await expect.poll(() => dialog.getByRole("button", { name: "Close", exact: true }).evaluate(takesPressAtCentre)).toBe(true);
  // A centred popup lands on a half pixel, which the viewport test rounds against the field.
  await expect(dialog.getByRole("combobox")).toBeInViewport({ ratio: FIELD_IN_VIEW_RATIO });
}
const BROWSER_DEFAULT_FONT_PX = 16;
const LIST_BAND_MENU = '[data-slot="list-pane-action"] [data-slot="overflow-actions-trigger"]';
const DOOR_TIMEOUT_MS = 2000;

/** Opens New chat through whichever door the Chats section shows: the list band's New button, the band menu's item when
 *  the button moved there, or the landing's own New chat when the shell keeps the list off screen. */
async function openNewChatFromList(page: Page): Promise<void> {
  const list = page.locator('.shell-panel[data-panel-side="list"]');
  const inline = list.getByRole("button", { name: "New", exact: true });
  const bandMenu = list.locator(LIST_BAND_MENU);
  const landing = page.getByRole("button", { name: START_NEW_CHAT_NAME, exact: true });
  await expect(async () => {
    if (await inline.isVisible()) {
      // eslint-disable-next-line playwright/no-action-timeout -- a door that moved must fail fast so `toPass` can retry the other one.
      await inline.click({ timeout: DOOR_TIMEOUT_MS });
    } else if (await bandMenu.isVisible()) {
      // eslint-disable-next-line playwright/no-action-timeout -- a door that moved must fail fast so `toPass` can retry the other one.
      await bandMenu.click({ timeout: DOOR_TIMEOUT_MS });
      // eslint-disable-next-line playwright/no-action-timeout -- a door that moved must fail fast so `toPass` can retry the other one.
      await page.getByRole("menuitem", { name: "New chat", exact: true }).click({ timeout: DOOR_TIMEOUT_MS });
    } else {
      // eslint-disable-next-line playwright/no-action-timeout -- a door that moved must fail fast so `toPass` can retry the other one.
      await landing.click({ timeout: DOOR_TIMEOUT_MS });
    }
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: DOOR_TIMEOUT_MS });
  }).toPass();
}

function rootFontPx(): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
}

/** Whether a press at the control's centre lands on the control, not on something painted over it. A disabled control
 *  takes no press itself, so its own row answering is the row leaving it uncovered. */
function takesPressAtCentre(control: Element): boolean {
  const box = control.getBoundingClientRect();
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  const inert = getComputedStyle(control).pointerEvents === "none" && hit === control.parentElement;
  return (hit !== null && control.contains(hit)) || inert;
}

const COLORIZATION_ATTRIBUTE = channelName("enableThemeColorization");

/** Drive the root effect's own stamp directly, so one popup node is observed in both arms. */
function stampColorization(page: Page, value: "false" | "true"): Promise<void> {
  return page.evaluate(([name, stamped]) => document.documentElement.setAttribute(name, stamped), [COLORIZATION_ATTRIBUTE, value] as const);
}

function cssValue(locator: Locator, property: string): Promise<string> {
  return locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name).trim(), property);
}

/** Whether any box between the popup and the document scrolls, which would carry the title and close away with it. */
function outsideScroller(page: Page): Promise<string | null> {
  return page.evaluate((selector) => {
    const popup = document.querySelector(selector);
    if (popup === null) {
      return "no popup";
    }
    for (let node = popup.parentElement; node !== null; node = node.parentElement) {
      const style = getComputedStyle(node);
      if ((style.overflowY === "auto" || style.overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1) {
        return node.tagName.toLowerCase() + (node.className === "" ? "" : `.${node.className.split(" ").join(".")}`);
      }
    }
    return null;
  }, POPUP);
}

/** What a scroll to the popup's end did: its region moved, or the popup has nothing to scroll. Any other answer
 *  means a header that stayed put proves nothing. */
const POPUP_SCROLLS = ["scrolled", "fits", "no popup", "overflow without a scroll region", "region did not move"] as const;
type PopupScroll = (typeof POPUP_SCROLLS)[number];

/** Scroll the popup's own scroll region to its end; the header must not travel with it. */
function scrollPopupToEnd(page: Page): Promise<PopupScroll> {
  return page.evaluate((selector): PopupScroll => {
    const popup = document.querySelector(selector);
    if (popup === null) {
      return "no popup";
    }
    const region = [...popup.querySelectorAll("*")].find((node) => {
      const style = getComputedStyle(node);
      return (style.overflowY === "auto" || style.overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1;
    });
    if (region === undefined) {
      return popup.scrollHeight <= popup.clientHeight + 1 ? "fits" : "overflow without a scroll region";
    }
    region.scrollTop = region.scrollHeight;
    return region.scrollTop > 0 ? "scrolled" : "region did not move";
  }, POPUP);
}

test.describe("on the corpus owner's own settings", () => {
  let root: Root;

  test.beforeAll(async () => {
    root = await createCorpusHarness();
  });

  test.beforeEach(async ({ corpus, page }) => {
    await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SERVED);
  });

  test.afterAll(async () => {
    await root[Symbol.asyncDispose]();
  });

  test("closing New chat returns focus to the Chats list's New button that opened it", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    await page.locator(".shell-rail").getByRole("button", { name: SECTION_LABELS.chats, exact: true }).click();
    const opener = page.locator('.shell-panel[data-panel-side="list"]').getByRole("button", { name: "New", exact: true });
    await opener.focus();
    await opener.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  // The second open is warm: the picker's rows are cached, so its body mounts in the same commit as the popup.
  test("New chat lands the caret in its search on every open, so typing searches", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "docked" } } });
    await mount<typeof AppShellStory>(STORY, {});
    for (const letter of ["a", "b"]) {
      await openNewChatFromList(page);
      const search = page.getByRole("dialog").getByRole("combobox");
      await expect(search).toBeFocused();
      await page.keyboard.type(letter);
      await expect(search).toHaveValue(letter);
      // A first Escape may only clear the search; the next one closes the dialog.
      await expect(async () => {
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: DOOR_TIMEOUT_MS });
      }).toPass();
    }
  });

  test("switching Add document's mode moves neither its mode strip nor its footer, every arm offers Cancel, and its teaching line reads at least label size", async ({
    mount,
    page,
  }) => {
    await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "addDocument" });
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // The mode strip is the row of pressable modes directly above the region the arms swap through.
    const modes = await dialog.locator("button[aria-pressed]").evaluateAll((buttons) => {
      const strip = buttons.at(-1)?.parentElement;
      return buttons.filter((button) => button.parentElement === strip).map((button) => button.textContent);
    });
    expect(modes).toHaveLength(3);
    const arms: { strip: number; footerGap: number; regionShort: number; cancels: number }[] = [];
    for (const label of modes) {
      await dialog.getByRole("button", { name: label, exact: true }).click();
      await expect(dialog.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
      arms.push(
        await dialog
          .locator("button[aria-pressed]")
          .last()
          .evaluate((button) => {
            const strip = button.parentElement;
            const region = strip?.nextElementSibling;
            const footer = region?.querySelector('[data-slot="dialog-footer"]');
            const regionBox = region?.getBoundingClientRect();
            const floor = region === null || region === undefined ? 0 : Number.parseFloat(getComputedStyle(region).minHeight);
            return {
              strip: strip?.getBoundingClientRect().y ?? Number.NaN,
              footerGap: (regionBox?.bottom ?? Number.NaN) - (footer?.getBoundingClientRect().bottom ?? Number.NaN),
              regionShort: floor - (regionBox?.height ?? Number.NaN),
              cancels: [...(region?.querySelectorAll("button") ?? [])].filter((candidate) => candidate.textContent === "Cancel").length,
            };
          }),
      );
    }
    const ys = arms.map((arm) => arm.strip);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(1);
    // Every arm hangs its footer at the same distance from the reserved floor, so a short arm leaves no void under Cancel.
    const gaps = arms.map((arm) => arm.footerGap);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
    expect(arms.map((arm) => ({ floorKept: arm.regionShort <= 1, cancels: arm.cancels }))).toStrictEqual(arms.map(() => ({ floorKept: true, cancels: 1 })));
    const teaching = dialog.locator('[data-slot="text"][data-voice="reading"]');
    const label = dialog.locator('[data-slot="field-label"]').first();
    await expect(teaching).toHaveCount(1);
    await expect(label).toBeVisible();
    const fontPx = (locator: Locator): Promise<number> => locator.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(await fontPx(teaching)).toBeGreaterThanOrEqual(await fontPx(label));
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });

  // Add document's body does not focus a control of its own, so the host's initial focus is what decides.
  test("a modal opens with focus in its body, never on Close, so the first Enter keeps it open", async ({ mount, page }) => {
    await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "addDocument" });
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close", exact: true })).not.toBeFocused();
    // The host's body anchor: inside the popup, not its frame, and out of the tab order so Tab still starts at the first control.
    await expect
      .poll(() =>
        page.evaluate((selector) => {
          const active = document.activeElement;
          const popup = document.querySelector(selector);
          if (!(active instanceof HTMLElement) || popup === null || !popup.contains(active) || active === popup) {
            return "outside";
          }
          return active.tabIndex;
        }, POPUP),
      )
      .toBe(-1);
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
  });

  test("at a short viewport the New chat body overflows inside its own popup", async ({ mount, page }) => {
    await page.setViewportSize({ width: 1024, height: 320 });
    await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "newChat" });
    await expect(page.getByRole("dialog")).toBeVisible();
    // The positive control for the loop below: a real body does overflow here, and only inside the popup.
    await expect.poll(() => scrollPopupToEnd(page)).toBe("scrolled");
  });

  // A short dialog wide enough for one footer row: a landscape phone and a short desktop window.
  forEachNonEmpty(WIDE_SHORT_VIEWPORTS, "WIDE_SHORT_VIEWPORTS", (viewport) => {
    test.describe(`at ${String(viewport.width)}x${String(viewport.height)}`, () => {
      test.use({ viewport, hasTouch: true, isMobile: true });

      test("New chat opens on its list's first row with Blank chat, the saved-roster door and Start pressable", async ({ mount, page }) => {
        await seedRosterPreset(root);
        await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "newChat" });
        const dialog = page.getByRole("dialog");
        const row = dialog.getByRole("option").first();
        await expect(row).toBeVisible();
        await expect(dialog.getByRole("combobox")).toBeFocused();
        await expect.poll(() => row.evaluate(firstRowAtOpen)).toEqual({ listScrollTop: 0, popupScrollTop: 0, wholeInList: true, footClear: true });
        // Every door is on screen at open, with no scroll: nothing hides under the footer or past the body's clip.
        const actions = dialog.locator('[data-slot="new-chat-actions"]');
        for (const door of [
          actions.getByRole("button", { name: BLANK_CHAT_NAME, exact: true }),
          dialog.getByRole("button", { name: SAVED_ROSTER_DOOR, exact: true }),
          actions.getByRole("button").last(),
        ]) {
          await expect(door).toBeInViewport({ ratio: 1 });
          await expect.poll(() => door.evaluate(takesPressAtCentre)).toBe(true);
        }
      });
    });
  });

  // The smallest landscape phone: a dialog under the short step and narrow enough to stack, with touch-sized controls.
  test.describe(`at ${String(STACKED_SHORT_VIEWPORT.width)}x${String(STACKED_SHORT_VIEWPORT.height)}`, () => {
    test.use({ viewport: STACKED_SHORT_VIEWPORT, hasTouch: true, isMobile: true });

    test("New chat opens on its list's first row, whole and clear of the pinned Start, with nothing scrolled", async ({ mount, page }) => {
      await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "newChat" });
      const dialog = page.getByRole("dialog");
      const row = dialog.getByRole("option").first();
      await expect(row).toBeVisible();
      await expect(dialog.getByRole("combobox")).toBeFocused();
      await expect.poll(() => row.evaluate(firstRowAtOpen)).toEqual({ listScrollTop: 0, popupScrollTop: 0, wholeInList: true, footClear: true });
      await expect(dialog.getByRole("heading", { name: "New chat", exact: true })).toBeInViewport({ ratio: 1 });
    });
  });

  // Opened at an enlarged root, the way a reader with a large browser text size opens it.
  forEachNonEmpty(ENLARGED_LANDSCAPE_CELLS, "ENLARGED_LANDSCAPE_CELLS", (cell) => {
    test.describe(`opened at ${String(cell.factor * 100)}% text on ${String(cell.width)}x${String(cell.height)}`, () => {
      test.use({ viewport: { width: cell.width, height: cell.height }, hasTouch: true, isMobile: true });

      test("New chat keeps its title and Close on screen", async ({ mount, page }) => {
        // The Chats list docked, so its New door is on screen; the root scales first, so the dialog opens enlarged.
        await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "docked" } } });
        await mount<typeof AppShellStory>(STORY, {});
        await expect(page.locator(".shell-topbar")).toBeVisible();
        await setRootFontScale(page, channelName("fontScale"), cell.factor);
        await expect.poll(() => page.evaluate(rootFontPx)).toBe(BROWSER_DEFAULT_FONT_PX * cell.factor);
        await openNewChatFromList(page);
        const dialog = page.getByRole("dialog");
        await expect(dialog.getByRole("option").first()).toBeAttached();
        await expect(dialog.getByRole("combobox")).toBeFocused();
        // At 300% on a 390px screen the close control's touch box is taller than its row: it must take a press, whole or not.
        await expectTitleCloseAndFieldOnScreen(dialog, "New chat");
      });
    });
  });

  forEachNonEmpty(PALETTE_NEW_CHAT_CELLS, "PALETTE_NEW_CHAT_CELLS", (cell) => {
    test.describe(`opened from the palette at ${String(cell.factor * 100)}% text on ${String(cell.width)}x${String(cell.height)}`, () => {
      test.use({ viewport: { width: cell.width, height: cell.height }, hasTouch: true, isMobile: true });

      test("New chat keeps its title, Close and search field on screen", async ({ mount, page }) => {
        await mount<typeof AppShellStory>(STORY, {});
        await expect(page.locator(".shell-topbar")).toBeVisible();
        await setRootFontScale(page, channelName("fontScale"), cell.factor);
        await expect.poll(() => page.evaluate(rootFontPx)).toBe(BROWSER_DEFAULT_FONT_PX * cell.factor);
        await page.keyboard.press("Control+k");
        await expect(page.getByRole("combobox", { name: "Command palette", exact: true })).toBeFocused();
        await page.keyboard.type("New chat");
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog");
        await expect(dialog.getByRole("heading", { name: "New chat", exact: true })).toBeVisible();
        await expect(dialog.getByRole("combobox")).toBeFocused();
        await expectTitleCloseAndFieldOnScreen(dialog, "New chat");
      });
    });
  });

  // The search field is where the user types, so it opens in view with the title above it and the first group below it.
  forEachNonEmpty(PALETTE_CELLS, "PALETTE_CELLS", (cell) => {
    test.describe(`the palette opened at ${String(cell.factor * 100)}% text on ${String(cell.width)}x${String(cell.height)}`, () => {
      test.use({ viewport: { width: cell.width, height: cell.height }, hasTouch: true, isMobile: true });

      test("opens with its search field on screen and focused, under a header that stays put while the list scrolls", async ({ mount, page }) => {
        await mount<typeof AppShellStory>(STORY, {});
        await expect(page.locator(".shell-topbar")).toBeVisible();
        await setRootFontScale(page, channelName("fontScale"), cell.factor);
        await expect.poll(() => page.evaluate(rootFontPx)).toBe(BROWSER_DEFAULT_FONT_PX * cell.factor);
        await page.keyboard.press("Control+k");
        const dialog = page.getByRole("dialog");
        const search = dialog.getByRole("combobox");
        await expect(search).toBeFocused();
        await expect(dialog.getByRole("option").first()).toBeAttached();
        await expectTitleCloseAndFieldOnScreen(dialog, "Jump to…");
        // The command box carries the focus ring, so a box that stands whole in the dialog draws the whole ring.
        await expect(dialog.locator('[data-slot="command-root"]')).toBeInViewport({ ratio: FIELD_IN_VIEW_RATIO });
        await expect.poll(() => search.evaluate(takesPressAtCentre)).toBe(true);
        await expect(dialog.getByRole("option").first()).toBeAttached();
        // The body's glyph bleed never reaches past the popup's own inset, so nothing of it is clipped.
        expect(await dialog.evaluate(bodyReachPastPopup)).toBeLessThanOrEqual(0);
        // The positive control: whatever scrolls here carries rows past the header and leaves the header and the field where they were.
        const header = dialog.locator('[data-slot="dialog-header"]');
        const before = await Promise.all([header.boundingBox(), search.boundingBox()]);
        expect(await scrollPopupToEnd(page)).toBe("scrolled");
        const after = await Promise.all([header.boundingBox(), search.boundingBox()]);
        expect(after[0]?.y).toBeCloseTo(before[0]?.y ?? Number.NaN, 0);
        expect(after[1]?.y).toBeCloseTo(before[1]?.y ?? Number.NaN, 0);
      });
    });
  });

  // The control for the truncating short title: a dialog with room keeps the wrapping title it always had.
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 430, height: 740 },
  ] as const) {
    test(`the palette's title wraps outside a short dialog at ${String(viewport.width)}x${String(viewport.height)}`, async ({ mount, page }) => {
      await page.setViewportSize(viewport);
      await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "command" });
      const heading = page.getByRole("dialog").getByRole("heading", { name: "Jump to…", exact: true });
      await expect(heading).toBeVisible();
      await expect(heading).toHaveCSS("white-space", "normal");
      await expect(heading).toHaveCSS("text-overflow", "clip");
    });
  }

  for (const modalId of MODAL_SLOT_IDS) {
    test(`the ${modalId} modal keeps the document still and its header put, whatever its body's height`, async ({ mount, page }) => {
      await page.setViewportSize({ width: 1024, height: 320 });
      await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId });
      const popup = page.locator(POPUP);
      await expect(popup).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(() => {
            const html = document.documentElement;
            return ["clip", "hidden"].includes(getComputedStyle(html).overflowY) && html.scrollHeight <= html.clientHeight + 1;
          }),
        )
        .toBe(true);
      await expect.poll(() => outsideScroller(page)).toBeNull();
      const header = page.locator('[data-slot="dialog-header"]');
      const before = await header.boundingBox();
      expect(["scrolled", "fits"]).toContain(await scrollPopupToEnd(page));
      await expect.poll(async () => Math.abs(((await header.boundingBox())?.y ?? Number.NaN) - (before?.y ?? Number.NaN))).toBeLessThan(1.5);
    });

    test(`Escape closes the ${modalId} modal`, async ({ mount, page }) => {
      await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId });
      const popup = page.locator(POPUP);
      await expect(popup).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(popup).toHaveCount(0);
    });
  }

  test("the You drawer keeps the More doors above the inbox, however long the inbox runs", async ({ mount, page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "you" });
    const more = page.getByRole("group", { name: "More", exact: true });
    const inbox = page.locator('[data-slot="drawer-popup"] [role="group"][aria-labelledby="notifications-inbox-heading"]');
    await expect(more).toBeVisible();
    await expect(inbox).toBeAttached();
    const moreBox = await more.boundingBox();
    const inboxBox = await inbox.boundingBox();
    expect(moreBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(inboxBox?.y ?? Number.NEGATIVE_INFINITY);
  });

  test("scrolled rows never show above the You drawer's header", async ({ mount, page }) => {
    await page.setViewportSize({ width: 1024, height: 320 });
    await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "you" });
    const popup = page.locator('[data-slot="drawer-popup"]');
    const header = popup.locator('[data-slot="dialog-header"]');
    await expect(header).toBeVisible();
    expect(await scrollPopupToEnd(page)).toBe("scrolled");
    await expect
      .poll(async () => {
        const top = (await popup.boundingBox())?.y ?? Number.NaN;
        return header.evaluate((element, edge) => {
          const box = element.getBoundingClientRect();
          const winner = document.elementFromPoint(box.left + box.width / 2, edge);
          return winner !== null && element.contains(winner);
        }, top + 1);
      })
      .toBe(true);
  });

  test("the You drawer's sticky header sits on the raised stratum and paints above its scrolled content", async ({ mount, page }) => {
    await page.setViewportSize({ width: 1024, height: 320 });
    await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "you" });
    const header = page.locator('[data-slot="drawer-popup"] [data-slot="dialog-header"]');
    await expect(header).toBeVisible();
    await expect(header).toHaveCSS("position", "sticky");
    await expect(header).toHaveCSS("z-index", TOKENS["z.raised"].value);
    expect(await scrollPopupToEnd(page)).toBe("scrolled");
    await expect
      .poll(() =>
        header.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const winner = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return winner !== null && element.contains(winner);
        }),
      )
      .toBe(true);
  });
});

// More characters than the picker's one page, so its census line ("Showing 100 of N") stands inside the box with the rows.
const CHARACTERS_PAST_ONE_PAGE = 110;

test.describe("New chat over a library longer than one page, at 844x390", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test("keeps three whole rows beside its census line", async ({ corpus, mount, page }) => {
    await using library = await createCorpusHarness();
    const caller = await library.internalCallerFor(library.ownerId);
    for (let index = 0; index < CHARACTERS_PAST_ONE_PAGE; index += 1) {
      await caller.character.create({
        input: createCharacterSchema.parse({
          handle: `census-${String(index)}`,
          name: `Census ${String(index)}`,
          description: "One more card past the first page.",
        }),
      });
    }
    await seedRosterPreset(library);
    await routeShell(page, corpus, caller, SERVED);
    await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "newChat" });
    const dialog = page.getByRole("dialog");
    // The positive control: the census line is on screen, so the rows below are counted beside it.
    await expect(dialog.getByText(/^Showing \d+ of \d+$/u)).toBeVisible();
    await expect.poll(() => dialog.locator('[data-slot="command-list"]').evaluate(wholeRowCount)).toBeGreaterThanOrEqual(3);
  });
});

/** A corpus root whose owner has a custom theme selected, with the appearance patch applied over the owner's own. */
async function themedRoot(override: Record<string, string>, appearance: Record<string, unknown> = {}): Promise<{ root: Root; themeId: ThemeId }> {
  await using construction = new AsyncDisposableStack();
  const root = construction.use(await createCorpusHarness());
  const caller = await root.internalCallerFor(root.ownerId);
  const theme = await caller.settings.createTheme({
    name: "Shell CT theme",
    override,
    css: `[data-slot="dialog-header"] { outline: var(${TOKENS["border-width.rule"].cssVar}) solid var(${TOKENS["color.border"].cssVar}); }`,
  });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: theme.id } });
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
  construction.move();
  return { root, themeId: theme.id };
}

const CUSTOM_DARK = { accent: "oklch(0.72 0.19 152)", background: "oklch(0.24 0.06 272)" };
const CUSTOM_LIGHT = { accent: "oklch(0.72 0.19 152)", background: "oklch(0.94 0.02 92)" };

for (const modalId of MODAL_SLOT_IDS) {
  test(`the ${modalId} modal paints the selected custom theme's background through the portal`, async ({ corpus, mount, page }) => {
    const { root } = await themedRoot(CUSTOM_DARK);
    await using _root = root;
    await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SERVED);
    await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId });
    const popup = page.locator(POPUP);
    await expect(popup).toBeVisible();
    await expect.poll(() => cssValue(popup, TOKENS["color.background"].cssVar)).toBe(CUSTOM_DARK.background);
  });
}

test("a custom light theme carries its palette and light polarity through the shell, the portal root and the popup", async ({ corpus, mount, page }) => {
  const { root } = await themedRoot(CUSTOM_LIGHT);
  await using _root = root;
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SERVED);
  await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "command" });
  const scope = page.locator('[data-slot="theme-scope"]:has(.shell-grid)');
  const portal = page.locator('[data-slot="portal-root"]');
  const popup = page.locator('[data-slot="dialog-popup"]');
  await expect(popup).toBeVisible();
  // A custom theme has no seed selector: what the live scope paints is the proof of what won.
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  for (const surface of [scope, portal, popup]) {
    await expect.poll(() => cssValue(surface, TOKENS["color.background"].cssVar)).toBe(CUSTOM_LIGHT.background);
    await expect.poll(() => cssValue(surface, "color-scheme")).toBe("light");
  }
  await expect(page.locator("style[data-orb-theme-css]")).toHaveCount(1);
});

for (const modalId of ["command", "you"] as const satisfies readonly ModalSlotId[]) {
  test(`colorization follows the shell into the ${modalId} portal without a remount, and a nested theme scope keeps its own`, async ({
    corpus,
    mount,
    page,
  }) => {
    const { root } = await themedRoot(CUSTOM_DARK, { enableThemeColorization: false });
    await using _root = root;
    await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SERVED);
    await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId });
    const grid = page.locator(".shell-grid");
    const portal = page.locator('[data-slot="portal-root"]');
    const popup = page.locator(POPUP);
    const header = page.locator('[data-slot="dialog-header"]');
    await expect(popup).toBeVisible();
    // The scope emits the primary pixel it judged (D336), which is the authored colour only when that pixel is the same;
    // the portal and the popup carry what the shell's scope emitted, whatever the clamp made of the authored accent.
    const scope = page.locator('[data-slot="theme-scope"]:has(.shell-grid)');
    await expect.poll(() => cssValue(scope, TOKENS["color.primary"].cssVar)).not.toBe("");
    const emittedPrimary = await cssValue(scope, TOKENS["color.primary"].cssVar);
    await expect.poll(() => cssValue(portal, TOKENS["color.primary"].cssVar)).toBe(emittedPrimary);
    await expect.poll(() => cssValue(popup, TOKENS["color.primary"].cssVar)).toBe(emittedPrimary);
    await popup.evaluate((element) => element.setAttribute("data-colorization-node", "same-node"));
    const borders = (): Promise<string[]> =>
      Promise.all([
        cssValue(grid, TOKENS["color.border"].cssVar),
        cssValue(portal, TOKENS["color.border"].cssVar),
        cssValue(popup, TOKENS["color.border"].cssVar),
      ]);

    // The root effect's own stamp, driven directly so the same popup node is observed in both arms.
    await stampColorization(page, "false");
    const off = await borders();
    expect(new Set(off).size).toBe(1);
    const offHeaderOutline = await header.evaluate((element) => getComputedStyle(element).outlineColor);

    await stampColorization(page, "true");
    await expect.poll(() => cssValue(grid, TOKENS["color.border"].cssVar)).not.toBe(off[0]);
    const on = await borders();
    expect(on[1]).toBe(on[0]);
    expect(on[2]).toBe(on[0]);
    await expect(popup).toHaveAttribute("data-colorization-node", "same-node");
    // The selected theme's own CSS consumes the inherited token, so it follows too.
    await expect.poll(() => header.evaluate((element) => getComputedStyle(element).outlineColor)).not.toBe(offHeaderOutline);

    await stampColorization(page, "false");
    await expect.poll(() => cssValue(popup, TOKENS["color.border"].cssVar)).toBe(off[0]);
  });
}

test("a seed theme keeps one border token across the root, the shell and the portal in both colorization arms", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SERVED);
  await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "command" });
  await expect(page.locator('[data-slot="dialog-popup"]')).toBeVisible();
  const surfaces = [page.locator("html"), page.locator(".shell-grid"), page.locator('[data-slot="portal-root"]'), page.locator('[data-slot="dialog-popup"]')];
  const borders = (): Promise<string[]> => Promise.all(surfaces.map((surface) => cssValue(surface, TOKENS["color.border"].cssVar)));
  await stampColorization(page, "false");
  const off = await borders();
  expect(new Set(off).size).toBe(1);
  await stampColorization(page, "true");
  await expect.poll(borders).not.toEqual(off);
  expect(new Set(await borders()).size).toBe(1);
});

const SPACING_INTENTS = [
  TOKENS["spacing.field"].cssVar,
  TOKENS["spacing.row"].cssVar,
  TOKENS["spacing.block"].cssVar,
  TOKENS["spacing.section"].cssVar,
] as const;

function spacingIntents(locator: Locator): Promise<readonly string[]> {
  return locator.evaluate((element, names) => names.map((name) => getComputedStyle(element).getPropertyValue(name).trim()), SPACING_INTENTS);
}

/** The spacing a bare element under `density` resolves to, read off the page's own sheet. */
function canonicalSpacing(page: Page, density: string): Promise<readonly string[]> {
  return page.evaluate(
    ({ value, names }) => {
      const probe = document.createElement("div");
      probe.setAttribute("data-density", value);
      document.body.append(probe);
      const values = names.map((name) => getComputedStyle(probe).getPropertyValue(name).trim());
      probe.remove();
      return values;
    },
    { value: density, names: SPACING_INTENTS },
  );
}

for (const density of ["comfortable", "compact"] as const) {
  test(`the ${density} density lives on the one scope above the shell and the portal, so a dialog spaces like the shell`, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: { density } });
    await routeShell(page, corpus, caller, SERVED);
    await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "newChat" });
    const scope = page.locator('[data-slot="theme-scope"]:has(.shell-grid)');
    const popup = page.locator('[data-slot="dialog-popup"]');
    await expect(scope).toHaveAttribute("data-density", density);
    await expect(popup).toBeVisible();
    expect(await spacingIntents(popup)).toEqual(await spacingIntents(page.locator(".shell-grid")));
    expect(await spacingIntents(popup)).toEqual(await canonicalSpacing(page, density));
    await expect(page.locator(".shell-grid")).not.toHaveAttribute("data-density");
    await expect(page.locator('[data-slot="portal-root"] [data-slot="dialog-popup"]')).toHaveCount(1);
  });
}

test("a custom theme's own density wins over the viewer's appearance density, in the shell and its portal alike", async ({ corpus, mount, page }) => {
  const { root } = await themedRoot({ density: "compact" }, { density: "comfortable" });
  await using _root = root;
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SERVED);
  await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "newChat" });
  await expect(page.locator('[data-slot="theme-scope"]:has(.shell-grid)')).toHaveAttribute("data-density", "compact");
  const popup = page.locator('[data-slot="dialog-popup"]');
  await expect(popup).toBeVisible();
  await expect.poll(() => spacingIntents(popup)).toEqual(await canonicalSpacing(page, "compact"));
});
