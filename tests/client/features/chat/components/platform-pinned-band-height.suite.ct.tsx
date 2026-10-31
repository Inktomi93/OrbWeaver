// The pinned header band of every speaker-naming chat style, at a coarse phone portrait: the action rail ends one
// row step above the band's bottom edge, never flush with the prose below it. A style that stacks the timestamp under the
// name has an identity cluster taller than the rail, and the centred rail sits half that excess higher; a header rule adds
// its own width. Both are read off the rendered band, so the band's height follows the production anatomy.

import type { ThemeChatStyle } from "@orb/contracts/theme";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import { resolvedLength, scrollIntoReadingMessage as scrollIntoMessage, seedShellState } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import { MEDIA_QUERIES, TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import { MESSAGE_ROW_SKINS } from "#client/features/chat/lib/message-row-variants.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";
import type { ReadingRoom } from "./chat-style-reading.fixtures.ts";
import { createReadingRoom, openReadingStyle, roomStoryProps } from "./chat-style-reading.fixtures.ts";

const ROOM_STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const PHONE = { width: 390, height: 844 } as const;

// Styles whose bar names the speaker: the actions-only bar of the document style has no identity to measure under.
const NAMED_STYLES = THEME_CHAT_STYLES.filter((style) => MESSAGE_ROW_SKINS[style].actionsRow.identity);

let root: ReadingRoom["root"];
let longReplyId: string;

test.use({ viewport: PHONE, hasTouch: true });

test.beforeAll(async () => {
  ({ root, longReplyId } = await createReadingRoom());
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

/** The fill under the pinned action rail's lowest edge, and what the band's own anatomy adds to a bare row step. */
async function fillBelowRail(page: Page, chatStyle: ThemeChatStyle): Promise<{ readonly fill: number; readonly excess: number }> {
  const row = page.locator(`[data-slot="message-row"][data-message-id="${longReplyId}"]`);
  const header = row.locator('[data-slot="message-name-row"]');
  // Mobile WebKit has no wheel input: take the reader's axis by keyboard and start from the transcript's top.
  const scroller = page.locator('[data-slot="message-list-scroll"]');
  await scroller.locator('[data-slot="message-list-row"]').last().press("Home");
  await scroller.evaluate((element) => element.scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(0);
  await scrollIntoMessage(row);
  await expect(header, chatStyle).toHaveAttribute("data-pinned", "");
  const rail = header.locator('[data-slot="message-actions-slot"]');
  const bottom = (locator: Locator): Promise<number> => locator.evaluate((element) => element.getBoundingClientRect().bottom);
  const height = (locator: Locator): Promise<number> => locator.evaluate((element) => element.getBoundingClientRect().height);
  const identity = header.locator("> :first-child");
  const rule = await header.evaluate((element) => Number.parseFloat(getComputedStyle(element).borderBlockEndWidth));
  return {
    fill: (await bottom(header)) - (await bottom(rail)),
    excess: Math.max(0, ((await height(identity)) - (await height(rail))) / 2) + rule,
  };
}

for (const chatStyle of NAMED_STYLES) {
  test(`${chatStyle} keeps one row step of fill under its action rail while pinned on a coarse pointer`, async ({ corpus, mount, page }) => {
    await openReadingStyle(page, corpus, chatStyle);
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomStoryProps());
    expect(await page.evaluate((query) => matchMedia(query).matches, MEDIA_QUERIES["pointer-coarse"])).toBe(true);
    const { fill, excess } = await fillBelowRail(page, chatStyle);
    const step = await resolvedLength(page, `var(${TOKENS["spacing.row"].cssVar})`);
    expect(
      Math.abs(fill - (step + excess)),
      `${chatStyle}: ${String(fill)}px under the rail, ${String(step)}px step, ${String(excess)}px of identity and rule`,
    ).toBeLessThanOrEqual(0.5);
  });
}
