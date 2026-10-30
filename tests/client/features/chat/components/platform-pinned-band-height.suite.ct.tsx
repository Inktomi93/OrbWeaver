// The pinned header band of every speaker-naming chat style, at a coarse phone portrait: the action rail ends one
// row step above the band's bottom edge in every style, never flush with the prose below it.

import type { ThemeChatStyle } from "@orb/contracts/theme";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import type { ChatId } from "@orb/kit/ids";
import { resolvedLength, scrollIntoReadingMessage as scrollIntoMessage, seedShellState } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import type { Locator, Page } from "@playwright/test";
import { MESSAGE_ROW_SKINS } from "#client/features/chat/lib/message-row-variants.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";
import type { ReadingRoom } from "./chat-style-reading.fixtures.ts";
import { createReadingRoom, openReadingRoom } from "./chat-style-reading.fixtures.ts";

const ROOM_STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const PHONE = { width: 390, height: 844 } as const;
const COARSE = "(pointer: coarse)";

// Styles whose bar names the speaker: the actions-only bar of the document style has no identity to measure under.
const NAMED_STYLES = THEME_CHAT_STYLES.filter((style) => MESSAGE_ROW_SKINS[style].actionsRow.identity);

let root: ReadingRoom["root"];
let roomId: ChatId;
let longReplyId: string;

test.use({ viewport: PHONE, hasTouch: true });

test.beforeAll(async () => {
  ({ root, roomId, longReplyId } = await createReadingRoom());
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

/** Fill between the pinned action rail's lowest edge and the band's bottom edge. */
async function fillBelowRail(page: Page, chatStyle: ThemeChatStyle): Promise<number> {
  const row = page.locator(`[data-slot="message-row"][data-message-id="${longReplyId}"]`);
  const header = row.locator('[data-slot="message-name-row"]');
  // Mobile WebKit has no wheel input: take the reader's axis by keyboard and start from the transcript's top.
  const scroller = page.locator('[data-slot="message-list-scroll"]');
  await scroller.locator('[data-slot="message-list-row"]').last().press("Home");
  await scroller.evaluate((element) => element.scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(0);
  await scrollIntoMessage(row);
  await expect(header, chatStyle).toHaveAttribute("data-pinned", "");
  const bottom = (locator: Locator): Promise<number> => locator.evaluate((element) => element.getBoundingClientRect().bottom);
  return (await bottom(header)) - (await bottom(header.locator('[data-slot="message-actions-slot"]')));
}

async function openStyle(page: Page, corpus: CorpusPlayback, chatStyle: ThemeChatStyle): Promise<void> {
  await openReadingRoom(page, corpus, root, { chatStyle, art: false });
  await seedShellState(page, { activeSection: "chats" });
}

function roomStoryProps(): { readonly chatId: ChatId } {
  return { chatId: roomId };
}

for (const chatStyle of NAMED_STYLES) {
  test(`${chatStyle} keeps one row step of fill under its action rail while pinned on a coarse pointer`, async ({ corpus, mount, page }) => {
    await openStyle(page, corpus, chatStyle);
    await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomStoryProps());
    expect(await page.evaluate((query) => matchMedia(query).matches, COARSE)).toBe(true);
    const fill = await fillBelowRail(page, chatStyle);
    const step = await resolvedLength(page, "var(--spacing-row)");
    expect(fill).toBe(step);
  });
}
