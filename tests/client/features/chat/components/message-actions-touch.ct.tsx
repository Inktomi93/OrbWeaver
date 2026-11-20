// @subject packages/client/src/features/chat/lib/message-actions-reveal.ts
// A touch reader, and a fine pointer that cannot hover, reach every message's actions on every chat style with the setting
// at its default; a pointer that can hover keeps hover and keyboard-focus reveal, and the actions hold while their own menu
// is open. Each case opens the room's production transcript; the rows are earlier ones, so the last row's own always-shown
// actions cannot stand in for them.
import type { ThemeChatStyle } from "@orb/contracts/theme";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import type { ChatId } from "@orb/kit/ids";
import { resolvedLength, seedShellState } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { MEDIA_QUERIES, TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import { MESSAGE_ACTIONS_MENU_NAME, MESSAGE_EDIT_NAME } from "#client/features/chat/lib/message-action-names.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";
import type { ReadingRoom } from "./chat-style-reading.fixtures.ts";
import { createReadingRoom, openReadingRoom } from "./chat-style-reading.fixtures.ts";

const ROOM_STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const ROW = '[data-slot="message-row"]';
const ACTIONS = '[data-slot="message-actions-row"]';
const NAME_ROW = '[data-slot="message-name-row"]';
const SCROLLPORT = '[data-slot="message-list-scroll"]';
const PHONE = { width: 390, height: 844 } as const;
const DESKTOP = { width: 1440, height: 900 } as const;
// Rows the transcript must mount before an "earlier row" case means anything: the last row and at least two before it.
const MINIMUM_ROWS = 3;

// A pen tablet's stylus: a fine primary pointer with no hover. CDP media emulation refuses `hover`, so Blink's own input
// settings carry it; the launch is a worker option, which a describe refuses, so these cases ride their own test type.
const STYLUS_INPUT = "--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=1,availableHoverTypes=1";
const stylusTest = test.extend({
  launchOptions: async ({ launchOptions }, provide) => {
    await provide({ ...launchOptions, args: [...(launchOptions.args ?? []), STYLUS_INPUT] });
  },
});

let readingRoom: ReadingRoom;

test.beforeAll(async () => {
  readingRoom = await createReadingRoom();
});

test.afterAll(async () => {
  await readingRoom.root[Symbol.asyncDispose]();
});

async function openRoom(page: Page, corpus: CorpusPlayback, chatStyle: ThemeChatStyle): Promise<void> {
  await openReadingRoom(page, corpus, readingRoom.root, { chatStyle, art: false });
  await seedShellState(page, { activeSection: "chats" });
}

function roomProps(): { readonly chatId: ChatId } {
  return { chatId: readingRoom.roomId };
}

async function rowsMounted(page: Page): Promise<void> {
  await expect.poll(() => page.locator(ROW).count()).toBeGreaterThanOrEqual(MINIMUM_ROWS);
}

/** Every mounted row but the transcript's last, which always shows its actions. */
async function earlierRows(page: Page): Promise<readonly Locator[]> {
  const rows = page.locator(ROW);
  const count = await rows.count();
  return Array.from({ length: count - 1 }, (_, index) => rows.nth(index));
}

function intersects(a: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }, b: typeof a): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function boxOf(locator: Locator): Promise<{ readonly x: number; readonly y: number; readonly width: number; readonly height: number }> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("The rendered element has no box");
  }
  return box;
}

test.describe("at a touch pointer", () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  for (const chatStyle of THEME_CHAT_STYLES) {
    test(`${chatStyle} shows every earlier row's actions, clear of its text, at the default setting`, async ({ corpus, mount, page }) => {
      await openRoom(page, corpus, chatStyle);
      await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomProps());
      await rowsMounted(page);
      const rows = await earlierRows(page);
      expect(rows.length).toBeGreaterThanOrEqual(MINIMUM_ROWS - 1);
      const floor = await resolvedLength(page, `var(${TOKENS["size.touch-target"].cssVar})`);
      for (const row of rows) {
        await row.scrollIntoViewIfNeeded();
        const actions = row.locator(ACTIONS);
        await expect(actions).toHaveCSS("opacity", "1");
        await expect(actions).toHaveCSS("pointer-events", "auto");
        await expect(row.locator(NAME_ROW)).toHaveCSS("opacity", "1");
        const edit = row.getByRole("button", { name: MESSAGE_EDIT_NAME, exact: true });
        const hit = await edit.evaluate((element) => {
          const reach = getComputedStyle(element, "::before");
          return { inline: Number.parseFloat(reach.width), block: Number.parseFloat(reach.height) };
        });
        expect(hit.inline).toBeGreaterThanOrEqual(floor);
        expect(hit.block).toBeGreaterThanOrEqual(floor);
        // The bar sits above the prose, never over its first line.
        expect(intersects(await boxOf(actions), await boxOf(row.locator("p").first()))).toBe(false);
      }
    });
  }

  test("document keeps every row's height when the transcript scrolls away and back", async ({ corpus, mount, page }) => {
    await openRoom(page, corpus, "document");
    await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomProps());
    await rowsMounted(page);
    const scrollport = page.locator(SCROLLPORT);
    const heights = async (): Promise<Map<string, number>> =>
      new Map(
        await page
          .locator(ROW)
          .evaluateAll((rows) => rows.map((row): [string, number] => [row.getAttribute("data-message-id") ?? "", row.getBoundingClientRect().height])),
      );
    const before = await heights();
    await scrollport.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await scrollport.evaluate((element) => {
      element.scrollTop = 0;
    });
    await expect
      .poll(async () => [...(await heights())].filter(([id, height]) => before.has(id) && Math.abs((before.get(id) ?? Number.NaN) - height) > 1))
      .toEqual([]);
    expect(before.size).toBeGreaterThanOrEqual(MINIMUM_ROWS);
  });
});

test.describe("at a fine pointer", () => {
  test.use({ viewport: DESKTOP, hasTouch: false, isMobile: false });

  for (const chatStyle of THEME_CHAT_STYLES) {
    test(`${chatStyle} keeps an earlier row's actions hidden at rest and reveals them on hover and keyboard focus`, async ({ corpus, mount, page }) => {
      await openRoom(page, corpus, chatStyle);
      await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomProps());
      await rowsMounted(page);
      const [row] = await earlierRows(page);
      if (row === undefined) {
        throw new Error("The transcript mounted no earlier row");
      }
      const actions = row.locator(ACTIONS);
      await page.mouse.move(0, 0);
      await expect(actions).toHaveCSS("opacity", "0");
      await expect(actions).toHaveCSS("pointer-events", "none");
      await row
        .locator('[data-slot="message-bubble"]')
        .first()
        .hover({ position: { x: 44, y: 4 } });
      await expect(actions).toHaveCSS("opacity", "1");
      await expect(actions).toHaveCSS("pointer-events", "auto");
      await page.mouse.move(0, 0);
      await expect(actions).toHaveCSS("opacity", "0");
      await row.getByRole("button", { name: MESSAGE_EDIT_NAME, exact: true }).focus();
      await expect(actions).toHaveCSS("opacity", "1");
      await expect(actions).toHaveCSS("pointer-events", "auto");
    });
  }
});

stylusTest.describe("at a fine pointer that cannot hover", () => {
  stylusTest.use({ viewport: DESKTOP, hasTouch: false, isMobile: false });

  for (const chatStyle of THEME_CHAT_STYLES) {
    stylusTest(`${chatStyle} shows every earlier row's actions at rest, clear of its text`, async ({ corpus, mount, page }) => {
      // The control: the launch took, so no hover reveal can stand in for the rest state.
      const input = await page.evaluate(([hover, fine]) => ({ hover: matchMedia(hover).matches, fine: matchMedia(fine).matches }), [
        MEDIA_QUERIES["hover-capable"],
        MEDIA_QUERIES["pointer-fine"],
      ] as const);
      expect(input).toEqual({ hover: false, fine: true });
      await openRoom(page, corpus, chatStyle);
      await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomProps());
      await rowsMounted(page);
      const rows = await earlierRows(page);
      expect(rows.length).toBeGreaterThanOrEqual(MINIMUM_ROWS - 1);
      for (const row of rows) {
        await row.scrollIntoViewIfNeeded();
        const actions = row.locator(ACTIONS);
        await expect(actions).toHaveCSS("opacity", "1");
        await expect(actions).toHaveCSS("pointer-events", "auto");
        await expect(row.getByRole("button", { name: MESSAGE_EDIT_NAME, exact: true })).toBeVisible();
        expect(intersects(await boxOf(actions), await boxOf(row.locator("p").first()))).toBe(false);
      }
    });
  }
});

test.describe("with a row's actions menu open", () => {
  test.use({ viewport: DESKTOP, hasTouch: false, isMobile: false });

  for (const chatStyle of THEME_CHAT_STYLES) {
    test(`${chatStyle} keeps the menu's trigger shown and live after the pointer leaves the row`, async ({ corpus, mount, page }) => {
      await openRoom(page, corpus, chatStyle);
      await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomProps());
      await rowsMounted(page);
      const [row] = await earlierRows(page);
      if (row === undefined) {
        throw new Error("The transcript mounted no earlier row");
      }
      const actions = row.locator(ACTIONS);
      await row
        .locator('[data-slot="message-bubble"]')
        .first()
        .hover({ position: { x: 44, y: 4 } });
      const trigger = row.getByRole("button", { name: MESSAGE_ACTIONS_MENU_NAME, exact: true });
      await trigger.click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      // On to the menu, which is portalled outside the row: the row loses hover, and focus is in the menu, not the row.
      await menu.hover();
      // The controls: neither the row's hover nor focus inside it is what holds the actions now.
      expect(await row.evaluate((element) => ({ hovered: element.matches(":hover"), focused: element.matches(":focus-within") }))).toEqual({
        hovered: false,
        focused: false,
      });
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await expect(actions).toHaveCSS("opacity", "1");
      await expect(actions).toHaveCSS("pointer-events", "auto");
    });
  }
});
