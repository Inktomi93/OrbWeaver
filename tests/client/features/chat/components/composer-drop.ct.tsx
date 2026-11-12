// An image dropped on the composer is claimed and staged as an attachment, and a text drag is left to the browser, so dropping
// text into the field still works. The composer and its drop gesture are the production ones; nothing is sent.
// @subject packages/client/src/features/chat/hooks/use-composer-media-drop.ts
import { dropOn, seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const SETTINGS_READS = [
  "chat.getGroupConfig",
  "chat.listChatInjections",
  "databank.listActiveForChat",
  "worldInfo.listForChat",
  "chat.listEffectiveRegex",
  "regex.listForChat",
  "automation.listRules",
] as const;
const COMPOSER = '[data-slot="composer"]';
const ATTACHMENT = '[data-slot="composer-attachment"]';

test("an image dropped on the composer is claimed and staged, and a dragged text is not", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const room = corpus.reads["chat.getChat"][0]?.output;
  if (room === undefined) {
    throw new Error("The committed corpus omitted a room");
  }
  await seedShellState(page, { activeSection: "chats" });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, ...SETTINGS_READS, "rpg.getGame", "rpg.listTurnToolCalls"]),
  });
  const chatId = (await caller.chat.getChat({ chatId: room.id })).id;
  await mount<typeof ChatRoomShellStory>(STORY, { chatId });
  const composer = page.locator(COMPOSER);
  await expect(composer).toBeVisible();

  expect(await dropOn(composer, { text: "some dragged prose" })).toBe(false);
  await expect(page.locator(ATTACHMENT)).toHaveCount(0);

  expect(await dropOn(composer, { file: "lantern.png", type: "image/png" })).toBe(true);
  await expect(page.locator(ATTACHMENT)).toHaveCount(1);
});
