// The immersive styles (echo, whisper, hush, ripple) draw every row as one full-width card, so card widths do not
// jump between a short reply and a long one, and hush's card is filled and rounded as Moonlit Echoes draws it.

import type { ThemeChatStyle } from "@orb/contracts/theme";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import type { ChatId } from "@orb/kit/ids";
import { seedShellState } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import type { Page } from "@playwright/test";
import { MESSAGE_ROW_SKINS } from "#client/features/chat/lib/message-row-variants.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";
import type { ReadingRoom } from "./chat-style-reading.fixtures.ts";
import { createReadingRoom, openReadingRoom } from "./chat-style-reading.fixtures.ts";

const ROOM_STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const BUBBLE = '[data-slot="message-bubble"]';
const TRANSPARENT = "rgba(0, 0, 0, 0)";
const WIDTHS = [
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
  { width: 1920, height: 1080 },
] as const;

// The styles that draw identity as art or a stripe: the skin table's own decoration or its sticky portrait.
const IMMERSIVE_STYLES = THEME_CHAT_STYLES.filter((style) => {
  const skin = MESSAGE_ROW_SKINS[style];
  return skin.bubbleDecoration !== undefined || skin.avatarTreatment("character") === "sticky-portrait";
});

let root: ReadingRoom["root"];
let roomId: ChatId;

test.use({ hasTouch: true });

test.beforeAll(async () => {
  ({ root, roomId } = await createReadingRoom());
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

async function openStyle(page: Page, corpus: CorpusPlayback, chatStyle: ThemeChatStyle): Promise<void> {
  await openReadingRoom(page, corpus, root, { chatStyle, art: false });
  await seedShellState(page, { activeSection: "chats" });
}

function roomStoryProps(): { readonly chatId: ChatId } {
  return { chatId: roomId };
}

/** The width of every rendered message card, one per row: a short reply and a long one, both speakers. */
async function cardWidths(page: Page): Promise<readonly number[]> {
  const cards = page.locator(`[data-slot="message-row"] ${BUBBLE}`);
  await expect(cards.first()).toBeVisible();
  return cards.evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().width)));
}

for (const viewport of WIDTHS) {
  for (const chatStyle of IMMERSIVE_STYLES) {
    test(`${chatStyle} at ${viewport.width}px draws every row as one card width`, async ({ corpus, mount, page }) => {
      await page.setViewportSize(viewport);
      await openStyle(page, corpus, chatStyle);
      await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomStoryProps());
      const widths = await cardWidths(page);
      expect(widths.length).toBeGreaterThan(1);
      expect(new Set(widths).size, `card widths ${widths.join(", ")}`).toBe(1);
    });
  }
}

test("hush draws a filled, rounded card for each row", async ({ corpus, mount, page }) => {
  await page.setViewportSize(WIDTHS[1]);
  await openStyle(page, corpus, "hush");
  await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomStoryProps());
  const card = page.locator(`[data-slot="message-row"] ${BUBBLE}`).first();
  await expect(card).toBeVisible();
  const paint = await card.evaluate((element) => {
    const style = getComputedStyle(element);
    return { fill: style.backgroundColor, radius: Number.parseFloat(style.borderStartStartRadius) };
  });
  expect(paint.fill).not.toBe(TRANSPARENT);
  expect(paint.radius).toBeGreaterThan(0);
});
