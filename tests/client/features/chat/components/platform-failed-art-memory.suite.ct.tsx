// A speaker's art that fails to load is remembered by URL outside the row, so a row that remounts (the transcript is
// windowed) paints its fallback from its first frame and never asks for the same broken image again, until the network
// returns or the app is brought back to the foreground.

import { seedShellState } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";
import { createReadingRoom, openReadingRoom } from "./chat-style-reading.fixtures.ts";

const ROOM_STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const PORTRAIT_REQUEST = /\/api\/blob\/[^?]+\?v=portrait/;
const LETTER = '[data-slot="text"][data-voice="monogram"]';
const TAIL = 10;

test("echo paints no chip and asks no more for a portrait that failed when its row remounts", async ({ corpus, mount, page }) => {
  const room = await createReadingRoom();
  try {
    const caller = await room.root.internalCallerFor(room.root.ownerId);
    const picture = corpus.reads["chat.getChat"].find(({ output }) =>
      output.participants.some((participant) => participant.kind === "character" && participant.avatarHash !== null),
    );
    const other = corpus.reads["chat.getChat"].find(({ output }) => output.id !== picture?.output.id);
    if (picture === undefined || other === undefined) {
      throw new Error("The corpus needs a room with a pictured character and a second room");
    }
    const pictured = await caller.chat.getChat({ chatId: picture.output.id });
    const elsewhere = await caller.chat.getChat({ chatId: other.output.id });
    await openReadingRoom(page, corpus, room.root, { chatStyle: "echo", art: false });
    await seedShellState(page, { activeSection: "chats" });
    await page.route(PORTRAIT_REQUEST, (route) => route.fulfill({ status: 404, body: "" }));
    const asked: string[] = [];
    page.on("request", (request) => {
      if (PORTRAIT_REQUEST.test(request.url())) {
        asked.push(request.url());
      }
    });

    const component = await mount<typeof ChatRoomShellStory>(ROOM_STORY, { chatId: pictured.id });
    await expect(page.locator(`[data-slot="message-row"][data-role="assistant"] ${LETTER}`).first()).toBeVisible();
    const firstMount = [...asked];
    expect(firstMount.length).toBeGreaterThan(0);

    await component.update({ chatId: elsewhere.id });
    await expect(page.locator(`[data-slot="message-row"]`).first()).toBeVisible();
    // Every animation frame from the remount on: the chip the fallback replaces must never be on screen in one.
    const { messages } = await caller.chat.listMessages({ chatId: pictured.id, limit: TAIL });
    const chip = messages
      .filter((message) => message.role === "assistant")
      .map((message) => `[data-message-id="${message.id}"] [data-slot="avatar-root"]`)
      .join(", ");
    const frames = await page.evaluateHandle((selector) => {
      const recorder = { chipFrames: 0, running: true };
      const sample = (): void => {
        if (recorder.running) {
          recorder.chipFrames += document.querySelector(selector) === null ? 0 : 1;
          requestAnimationFrame(sample);
        }
      };
      requestAnimationFrame(sample);
      return recorder;
    }, chip);
    await component.update({ chatId: pictured.id });
    await expect(page.locator(`[data-slot="message-row"][data-role="assistant"] ${LETTER}`).first()).toBeVisible();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await frames.evaluate((recorder) => recorder.chipFrames)).toBe(0);
    await frames.evaluate((recorder) => {
      recorder.running = false;
    });
    // The other room asks for its own portraits; only the first room's own URLs must not be asked for again.
    expect(asked.filter((url) => firstMount.includes(url))).toHaveLength(firstMount.length);
  } finally {
    await room.root[Symbol.asyncDispose]();
  }
});

const RETRY_EVENTS = [
  { name: "the network returns", dispatch: (): boolean => globalThis.dispatchEvent(new Event("online")) },
  { name: "the app returns to the foreground", dispatch: (): boolean => document.dispatchEvent(new Event("visibilitychange")) },
] as const;

for (const retry of RETRY_EVENTS) {
  test(`echo asks again for a failed portrait and paints it when ${retry.name}`, async ({ corpus, corpusMedia, mount, page }) => {
    const room = await createReadingRoom();
    try {
      const caller = await room.root.internalCallerFor(room.root.ownerId);
      const picture = corpus.reads["chat.getChat"].find(({ output }) =>
        output.participants.some((participant) => participant.kind === "character" && participant.avatarHash !== null),
      );
      if (picture === undefined) {
        throw new Error("The corpus needs a room with a pictured character");
      }
      const pictured = await caller.chat.getChat({ chatId: picture.output.id });
      await openReadingRoom(page, corpus, room.root, { chatStyle: "echo", art: false });
      await seedShellState(page, { activeSection: "chats" });
      await page.route(PORTRAIT_REQUEST, (route) => route.fulfill({ status: 404, body: "" }));
      await mount<typeof ChatRoomShellStory>(ROOM_STORY, { chatId: pictured.id });
      const letter = page.locator(`[data-slot="message-row"][data-role="assistant"] ${LETTER}`).first();
      await expect(letter).toBeVisible();

      // The route recovers, but nothing asks again until the page is told the world changed.
      await page.unroute(PORTRAIT_REQUEST);
      await corpusMedia();
      const served = page.waitForResponse((response) => PORTRAIT_REQUEST.test(response.url()) && response.ok());
      await page.evaluate(retry.dispatch);
      await served;
      await expect(letter).toBeHidden();
    } finally {
      await room.root[Symbol.asyncDispose]();
    }
  });
}
