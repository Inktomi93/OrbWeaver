import { chatDigests, chatParticipants, chatSegments, embedGenerationTargets, embedSpaceState } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { seedUser as seedUserRow } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeSearch, seedCharacter, seedChat, seedChatDigest, seedChatParticipant, seedChatSegment, vec } from "../_support.ts";

describe("room-derived search authority", () => {
  test("retained eligible rows require current host authority through every retrieval scope", async () => {
    const db = await freshDb();
    const host = (await seedUserRow(db)).id;
    const member = (await seedUserRow(db)).id;
    const departed = (await seedUserRow(db)).id;
    const foreign = (await seedUserRow(db)).id;
    const chatId = await seedChat(db, mintTypeId(ID_PREFIX.chat));
    await seedChatParticipant(db, chatId, host);
    await seedChatParticipant(db, chatId, member, "member");
    await seedChatParticipant(db, chatId, departed, "member");
    await db.update(chatParticipants).set({ leftSeq: 1 }).where(eq(chatParticipants.userId, departed));
    const character = await seedCharacter(db, { id: mintTypeId(ID_PREFIX.character), ownerId: member });
    const formerCharacter = await seedCharacter(db, { id: mintTypeId(ID_PREFIX.character), ownerId: departed });
    for (const [blockIdx, scopedCharacterId] of [character, formerCharacter].entries()) {
      const digestId = await seedChatDigest(db, {
        id: mintTypeId(ID_PREFIX.chatDigest),
        chatId,
        scopedCharacterId,
        blockIdx,
        text: "HOST SECRET",
        embedding: vec(1),
      });
      const segmentId = await seedChatSegment(db, { id: mintTypeId(ID_PREFIX.chatSegment), chatId, blockIdx, text: "RAW HOST SECRET", embedding: vec(1) });
      const [digest] = await db.select({ generationId: chatDigests.generationId }).from(chatDigests).where(eq(chatDigests.id, digestId));
      if (digest === undefined) {
        throw new Error("missing retained digest");
      }
      // Retain rows in each character owner's active generation so generation filtering cannot conceal the abuse path.
      await db.update(chatSegments).set({ generationId: digest.generationId }).where(eq(chatSegments.id, segmentId));
    }
    await db.delete(embedSpaceState).where(eq(embedSpaceState.ownerId, host));
    await db.delete(embedGenerationTargets).where(eq(embedGenerationTargets.ownerId, host));
    const svc = makeSearch(db);
    const base = { query: "secret", topN: 20 };
    for (const ownerId of [member, departed, foreign, host]) {
      const memory = {
        ownerId,
        scope: { chat: chatId },
        scopedCharacterId: ownerId === departed ? formerCharacter : character,
        queryText: "secret",
        mode: "mixB",
        keywordMatch: false,
        minScore: 0,
        retrieveK: 20,
        rerankTo: 20,
      } as const;
      const discovery = await svc.discover({ ownerId, queryText: "secret", topN: 20 });
      const results = [
        await svc.digests(memory),
        await svc.segments(memory),
        await svc.corpus({ ownerId, queryText: "secret", mode: "mixB", minScore: 0 }),
        [...discovery.hits, ...discovery.standaloneSegments],
        ...(
          await Promise.all([
            svc.search({ ...base, ownerId, over: "digests", scope: { kind: "owner" } }),
            svc.search({ ...base, ownerId, over: "digests", scope: { kind: "chat", chatId } }),
            svc.search({ ...base, ownerId, over: "digests", scope: { kind: "character", characterId: character } }),
            svc.search({ ...base, ownerId, over: "segments", scope: { kind: "chat", chatId, scopedCharacterId: character } }),
            svc.search({ ...base, ownerId, over: "corpus", scope: { kind: "owner" } }),
          ])
        ).map((result) => result.hits),
      ];
      for (const hits of results) {
        expect(hits.length > 0).toBe(ownerId === host);
      }
    }
    await db.update(chatParticipants).set({ role: "member" }).where(eq(chatParticipants.userId, host));
    await db.update(chatParticipants).set({ role: "host" }).where(eq(chatParticipants.userId, member));
    expect(await svc.corpus({ ownerId: host, queryText: "secret", mode: "mixB", minScore: 0 })).toEqual([]);
    expect((await svc.corpus({ ownerId: member, queryText: "secret", mode: "mixB", minScore: 0 })).length).toBeGreaterThan(0);
  });
  test("Scenes shares its result limit between character groups and standalone passages", async () => {
    const db = await freshDb();
    const ownerId = (await seedUserRow(db)).id;
    const character = await seedCharacter(db, { id: mintTypeId(ID_PREFIX.character), ownerId });
    const chatId = await seedChat(db, mintTypeId(ID_PREFIX.chat));
    await seedChatDigest(db, { id: mintTypeId(ID_PREFIX.chatDigest), chatId, scopedCharacterId: character, blockIdx: 1, embedding: vec(0, 1) });
    await seedChatSegment(db, { id: mintTypeId(ID_PREFIX.chatSegment), chatId, blockIdx: 1, embedding: vec(1, 0.1), text: "CREDITED" });
    await seedChatSegment(db, { id: mintTypeId(ID_PREFIX.chatSegment), chatId, blockIdx: 0, embedding: vec(1), text: "STANDALONE" });
    const result = await makeSearch(db).discover({ ownerId, queryText: "q", topN: 1 });
    expect(result.hits).toEqual([]);
    expect(result.standaloneSegments.map((hit) => hit.snippet)).toEqual(["STANDALONE"]);
  });
  test("host scope precedes same-content collapse within one retained generation", async () => {
    const db = await freshDb();
    const ownerId = (await seedUserRow(db)).id;
    const other = (await seedUserRow(db)).id;
    const character = await seedCharacter(db, { id: mintTypeId(ID_PREFIX.character), ownerId });
    const mine = await seedChat(db, mintTypeId(ID_PREFIX.chat));
    const theirs = await seedChat(db, mintTypeId(ID_PREFIX.chat));
    await seedChatParticipant(db, mine, ownerId);
    await seedChatParticipant(db, theirs, other);
    await seedChatDigest(db, {
      id: mintTypeId(ID_PREFIX.chatDigest),
      chatId: mine,
      scopedCharacterId: character,
      blockIdx: 0,
      text: "AUTHORIZED",
      contentHash: "same",
      embedding: vec(1, 0.1),
    });
    await seedChatDigest(db, {
      id: mintTypeId(ID_PREFIX.chatDigest),
      chatId: theirs,
      scopedCharacterId: character,
      blockIdx: 0,
      text: "FOREIGN",
      contentHash: "same",
      embedding: vec(1),
    });
    expect((await makeSearch(db).corpus({ ownerId, queryText: "q", mode: "mixB", minScore: 0 })).map((hit) => hit.text)).toEqual(["AUTHORIZED"]);
  });
  test("standalone indexed segments survive an empty or unrelated digest pool", async () => {
    const db = await freshDb();
    const ownerId = (await seedUserRow(db)).id;
    const chatId = await seedChat(db, mintTypeId(ID_PREFIX.chat));
    await seedChatParticipant(db, chatId, ownerId);
    await seedChatSegment(db, { id: mintTypeId(ID_PREFIX.chatSegment), chatId, blockIdx: 0, text: "STANDALONE", embedding: vec(1) });
    const svc = makeSearch(db);
    const query = { ownerId, queryText: "q", mode: "mixB", minScore: 0.9 } as const;
    const standalone = await svc.corpus(query);
    expect(standalone.map((hit) => hit.text)).toEqual(["STANDALONE"]);
    expect(standalone[0]?.source).toMatchObject({ kind: "segment", chatId, blockIdx: 0, chunkIdx: 0 });
    expect(standalone[0]?.blockKeys).toEqual([]);
    const scenes = await svc.search({ ownerId, query: "q", topN: 20, over: "discover", scope: { kind: "owner" } });
    if (scenes.over !== "discover") {
      throw new Error("expected scenes");
    }
    expect(scenes.hits).toEqual([]);
    expect(scenes.standaloneSegments.map((segment) => segment.snippet)).toEqual(["STANDALONE"]);
    const character = await seedCharacter(db, { id: mintTypeId(ID_PREFIX.character), ownerId });
    await seedChatDigest(db, {
      id: mintTypeId(ID_PREFIX.chatDigest),
      chatId,
      scopedCharacterId: character,
      blockIdx: 0,
      text: "UNRELATED",
      embedding: vec(0, 1),
    });
    const outsidePool = await svc.corpus(query);
    expect(outsidePool.map((hit) => hit.text)).toEqual(["STANDALONE"]);
    expect(outsidePool[0]?.source.kind).toBe("segment");
    expect(outsidePool[0]?.blockKeys).toEqual([{ chatId, tier: 0, blockIdx: 0, scopedCharacterId: character }]);
    expect((await svc.discover({ ownerId, queryText: "q", topN: 20 })).hits[0]?.segments[0]?.snippet).toBe("STANDALONE");
  });
});
