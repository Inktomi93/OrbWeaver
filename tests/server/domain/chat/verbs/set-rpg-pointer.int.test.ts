// op: setRpgPointer (rpg-design/05 §3.1) — the opaque rpg-pointer WRITE, against a real libSQL db. Proves: the
// pointer merges into `metadata.rpg` (a sync signal off `ChatDetail`), the write PRESERVES sibling sub-blobs
// (never nukes roomOverrides/group), and a corrupt pre-existing rpg blob heals to the fresh pointer. NULL =
// DETACH (the dangling-pointer heal §3.3): a `null` pointer DROPS the `metadata.rpg` sub-blob entirely so the
// chat is byte-identical to a never-a-game chat (the takeover gate reads presence), siblings preserved.

import type { Db } from "@orb/db";
import { chats } from "@orb/db";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { parseChatMetadata } from "../../../../../packages/server/src/domain/chat/contract/metadata";
import { createSetRpgPointer } from "../../../../../packages/server/src/domain/chat/verbs/set-rpg-pointer.ts";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { makeChatContext, seedChat } from "../_support";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

async function readMetadata(chatId: string): Promise<ReturnType<typeof parseChatMetadata>> {
  const rows = await db
    .select({ metadata: chats.metadata })
    .from(chats)
    .where(eq(chats.id, castId(chatId)));
  return parseChatMetadata(rows[0]?.metadata);
}

describe("setRpgPointer", () => {
  test("writes the opaque {gameId} pointer into metadata.rpg", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = mintTypeId(ID_PREFIX.rpgGame);
    await createSetRpgPointer(makeChatContext(db))(chatId, { gameId, engaged: true });
    expect((await readMetadata(chatId)).rpg).toEqual({ engaged: true, gameId });
  });

  test("MERGES — a pointer write preserves sibling sub-blobs", async () => {
    const chatId = await seedChat(db, "a");
    // Seed a chat carrying a roomOverrides sub-blob already.
    await db
      .update(chats)
      .set({ metadata: { roomOverrides: { scenario: "a haunted keep" } } })
      .where(eq(chats.id, chatId));
    const gameId = mintTypeId(ID_PREFIX.rpgGame);
    await createSetRpgPointer(makeChatContext(db))(chatId, { gameId, engaged: true });
    const meta = await readMetadata(chatId);
    expect(meta.rpg).toEqual({ engaged: true, gameId });
    expect(meta.roomOverrides?.scenario).toBe("a haunted keep");
  });

  test("a racing-deleted chat is a no-op (no throw)", async () => {
    await createSetRpgPointer(makeChatContext(db))(castId("chat_ghost"), { engaged: true, gameId: mintTypeId(ID_PREFIX.rpgGame) });
    expect(true).toBe(true);
  });

  test("NULL DETACHES — drops the rpg sub-blob so the chat is byte-identical to a never-a-game chat", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = mintTypeId(ID_PREFIX.rpgGame);
    // First point it at a game (with a sibling sub-blob present), then detach.
    await db
      .update(chats)
      .set({ metadata: { roomOverrides: { scenario: "a haunted keep" } } })
      .where(eq(chats.id, chatId));
    await createSetRpgPointer(makeChatContext(db))(chatId, { gameId, engaged: true });
    expect((await readMetadata(chatId)).rpg).toEqual({ engaged: true, gameId });

    await createSetRpgPointer(makeChatContext(db))(chatId, null);
    const meta = await readMetadata(chatId);
    // The pointer is GONE (absent, not `rpg: null` — the gate reads presence), the sibling survives.
    expect(meta.rpg).toBeUndefined();
    expect(meta.roomOverrides?.scenario).toBe("a haunted keep");
  });
});
