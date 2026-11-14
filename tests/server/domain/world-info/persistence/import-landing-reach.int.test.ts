// A book edit refreshes every room the book reaches through a persona anchor, and leaves out a room an import is still
// landing: the anchor is a room-row pointer with no seat, so only the landing marker keeps that room out.
// @subject packages/server/src/domain/world-info/persistence/room-reach.ts
import { createCharacterSchema } from "@orb/contracts/character";
import type { RoomEntityKind } from "@orb/contracts/chat";
import { createPersonaSchema } from "@orb/contracts/persona";
import type { ChatId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { TranscriptLine } from "@orb/testkit/node/composed";
import { createServerHarness, seedTranscript, transcriptFile } from "@orb/testkit/node/composed";
import { duringChatLanding } from "@orb/testkit/node/rows";
import { LANDING_STAGE_ROWS } from "#server/domain/chat/persistence/import-landing.ts";

const HANDLE = "atlas-keeper";
const PERSONA = "Lantern Wanderer";
const BOOK_ENTITY = "world-info" satisfies RoomEntityKind;
// A one-line message is two rows, so this is several landing stages.
const ROOM_MESSAGES = 4 * (LANDING_STAGE_ROWS / 2) + 1;

function transcriptLines(messageCount: number): TranscriptLine[] {
  return Array.from({ length: messageCount }, (_, turn) => ({ role: turn % 2 === 0 ? "user" : "assistant", content: `line ${String(turn)}` }));
}

test("a book edit refreshes the rooms its persona anchors, and skips one still landing", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  await root.services.character.create({ principal, input: createCharacterSchema.parse({ handle: HANDLE, name: HANDLE, description: "Keeps the atlas." }) });
  const persona = await root.services.persona.create({ principal, input: createPersonaSchema.parse({ name: PERSONA, description: "Walks the stair." }) });
  const book = await caller.worldInfo.createBook({ input: { name: "Atlas" } });
  await caller.worldInfo.attachToPersona({ personaId: persona.id, bookId: book.id });
  const anchored = { anchorPersonaName: PERSONA };
  const landed = await seedTranscript(root, { ownerId: root.ownerId, characterHandles: [HANDLE], lines: transcriptLines(2), chat: anchored });
  const descriptor = root.app.portability.find((entity) => entity.kind === "chat");
  if (descriptor === undefined) {
    throw new Error("the production chat import descriptor is missing");
  }

  const refreshed: ChatId[] = [];
  const waiters = new Map<ChatId, () => void>();
  const unsubscribe = root.app.liveBuses.chat.subscribeAllChatEvents((frame) => {
    if (frame.event.type === "roomEntityChanged" && frame.event.entity === BOOK_ENTITY) {
      refreshed.push(frame.event.chatId);
      waiters.get(frame.event.chatId)?.();
    }
  });
  const renamed = async (name: string, waitFor: ChatId): Promise<readonly ChatId[]> => {
    refreshed.length = 0;
    const arrived = Promise.withResolvers<void>();
    waiters.set(waitFor, arrived.resolve);
    await caller.worldInfo.updateBook({ bookId: book.id, input: { name } });
    await arrived.promise;
    return [...refreshed];
  };

  try {
    const file = transcriptFile({ characterHandles: [HANDLE], lines: transcriptLines(ROOM_MESSAGES), chat: { ...anchored, title: "long" } });
    const landing = descriptor.importFile(root.ownerId, file);
    const seen = await duringChatLanding(root.db, landing, async () => await renamed("Atlas of the stair", landed.chatId));
    expect(await landing).toMatchObject({ ok: true, created: true });

    expect(seen.stillLanding).toBe(true);
    expect(seen.result).toEqual([landed.chatId]);
    // The control: once landed, the same edit refreshes the room it skipped.
    expect(new Set(await renamed("Atlas", seen.chatId))).toEqual(new Set([landed.chatId, seen.chatId]));
  } finally {
    unsubscribe();
  }
});
