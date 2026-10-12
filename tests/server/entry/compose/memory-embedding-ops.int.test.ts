// The memory vector ops compose wires, over the real embeddings write path: a store whose planned owner is no
// longer the room's present host refuses and writes nothing, so a room that changed hands mid-sweep never gets
// the old host's vectors.

import type { Db } from "@orb/db";
import { chatDigests, chatSegments } from "@orb/db";
import type { ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { describe } from "vitest";
import { loadPresentHostUserId } from "#server/domain/chat/persistence/reactions.ts";
import { createMemoryEmbeddingOps } from "#server/entry/compose/memory-embedding-ops.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { makeStoreHarness, seedCharacter, seedChat, seedUser } from "../../domain/embeddings/_support.ts";

interface Room {
  readonly db: Db;
  readonly host: UserId;
  readonly former: UserId;
  readonly chatId: ChatId;
  readonly ops: ReturnType<typeof createMemoryEmbeddingOps>;
}

async function room(): Promise<Room> {
  const db = await freshDb();
  const host = await seedUser(db, { handle: castId<Handle>("host") });
  const former = await seedUser(db, { handle: castId<Handle>("former") });
  const chatId = await seedChat(db, "chat_room", host);
  const ops = createMemoryEmbeddingOps({
    embeddings: createEmbeddingsService(makeStoreHarness(db).ctx),
    resolveChatHostUserId: async (id) => (await loadPresentHostUserId(db, id)) ?? null,
  });
  return { db, host, former, chatId, ops };
}

async function digestFor(r: Room, ownerId: UserId): Promise<unknown> {
  const scopedCharacterId = await seedCharacter(r.db, r.host, { id: `character_${ownerId}` });
  const space = await r.ops.resolveMemoryEmbedSpace(r.host);
  return await r.ops.embeddingsStore({
    lens: "digest",
    ownerId,
    model: space.model,
    key: { chatId: r.chatId, scopedCharacterId, tier: 0, blockIdx: 0 },
    text: "a digest",
    contentHash: "h0",
    topicAnchor: "[anchor]",
    keywords: [],
    isGroup: false,
    speakerCharacterIds: [],
  });
}

async function segmentFor(r: Room, ownerId: UserId): Promise<unknown> {
  const space = await r.ops.resolveMemoryEmbedSpace(r.host);
  return await r.ops.embeddingsStoreSegments([
    {
      lens: "segment",
      ownerId,
      model: space.model,
      generationId: space.generationId,
      generationEpoch: space.generationEpoch,
      chatId: r.chatId,
      blockIdx: 0,
      chunkIdx: 0,
      seqStart: 0,
      seqEnd: 1,
      text: "a segment",
      contentHash: "s0",
    },
  ]);
}

describe("createMemoryEmbeddingOps — the owner-coherence guard", () => {
  test("the present host's digest and segment land, each with its generation receipt", async () => {
    const r = await room();

    await expect(digestFor(r, r.host)).resolves.toMatchObject({ ownerId: r.host });
    await expect(segmentFor(r, r.host)).resolves.toMatchObject([{ ownerId: r.host }]);
    expect(await r.db.select().from(chatDigests)).toHaveLength(1);
    expect(await r.db.select().from(chatSegments)).toHaveLength(1);
  });

  test("a digest planned for an owner who is no longer the host refuses and writes nothing", async () => {
    const r = await room();

    await expect(digestFor(r, r.former)).rejects.toThrow(/memory digest owner changed during sweep/u);
    expect(await r.db.select().from(chatDigests)).toHaveLength(0);
  });

  test("a segment flood planned for an owner who is no longer the host refuses and writes nothing", async () => {
    const r = await room();

    await expect(segmentFor(r, r.former)).rejects.toThrow(/memory segment owner changed during sweep/u);
    expect(await r.db.select().from(chatSegments)).toHaveLength(0);
  });
});
