import { resolvedLength, scrollIntoReadingMessage, seedShellState, tokenColor } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { Locator } from "@playwright/test";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";
import type { ReadingRoom } from "./chat-style-reading.fixtures.ts";
import { createReadingRoom, openReadingRoom } from "./chat-style-reading.fixtures.ts";

const ROOM_STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const ROW = '[data-slot="message-row"]';
let fixture: ReadingRoom;

test.beforeAll(async () => {
  fixture = await createReadingRoom();
});
test.afterAll(async () => {
  await fixture.root[Symbol.asyncDispose]();
});

async function restTideHeader(row: Locator): Promise<void> {
  const inset = await resolvedLength(row.page(), "var(--spacing-block)");
  await row.evaluate((element, offset) => {
    const scroller = element.closest('[data-slot="message-list-scroll"]');
    if (scroller === null) {
      throw new Error("The message has no transcript scrollport");
    }
    scroller.scrollTop += element.getBoundingClientRect().top - scroller.getBoundingClientRect().top - offset;
  }, inset);
}

function registerTideBackingCase(width: number, height: number): void {
  test(`Tide ${width}x${height}: pinned headers cover both speakers' reading width without widening the resting identity`, async ({ corpus, mount, page }) => {
    await page.setViewportSize({ width, height });
    await openReadingRoom(page, corpus, fixture.root, { chatStyle: "tide", art: true });
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof ChatRoomShellStory>(ROOM_STORY, { chatId: fixture.roomId });
    for (const messageId of [fixture.longReplyId, fixture.longUserId]) {
      const row = page.locator(`${ROW}[data-message-id="${messageId}"]`);
      const header = row.locator('[data-slot="message-name-row"]');
      const column = row.locator('[data-slot="message-content-column"]');
      await restTideHeader(row);
      await expect(header).not.toHaveAttribute("data-pinned", "");
      await expect(row.locator('[data-slot="message-attribution"]')).toBeVisible();
      const resting = await header.boundingBox();
      await scrollIntoReadingMessage(row);
      await expect(header).toHaveAttribute("data-pinned", "");
      await expect
        .poll(async () => {
          const band = await header.boundingBox();
          const reading = await column.boundingBox();
          return band !== null && reading !== null && band.x <= reading.x + 1 && band.x + band.width >= reading.x + reading.width - 1;
        })
        .toBe(true);
      await expect(header).toHaveCSS(
        "background-color",
        await tokenColor(header, (await row.getAttribute("data-role")) === "user" ? "--color-user-bubble" : "--color-ai-bubble", "background-color"),
      );
      await restTideHeader(row);
      await expect(header).not.toHaveAttribute("data-pinned", "");
      expect(await header.boundingBox()).toMatchObject({ width: resting?.width });
    }
  });
}

registerTideBackingCase(844, 390);
registerTideBackingCase(390, 844);
