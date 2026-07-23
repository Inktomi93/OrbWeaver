// PD-38 — the unified search() dispatch + the SearchScope by-character cross-chat OR-branch. The flagship
// assertion is the `chat_digest_speakers` recall-correctness capability: scoping digests by a character
// that only SPOKE in a co-star block (never the egocentric producer) must still return that block — the
// OR-branch is what catches it. Also pins the dispatch tagging, the owner-scope refusals, and the owner belt.

import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import {
  EMBED_MODEL,
  makeSearch,
  seedCharacter,
  seedCharacterEmbedding,
  seedChat,
  seedChatDigest,
  seedChatDigestSpeaker,
  seedChatSegment,
  seedDocument,
  seedDocumentChunk,
  seedUser,
  vec,
} from "../_support.ts";

describe("search (unified dispatch)", () => {
  test("digests · character scope: the OR-branch includes a co-star block the character only spoke in", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    // Alice is the egocentric producer of the digest; Bob merely SPOKE in it (a chat_digest_speakers row).
    const alice = await seedCharacter(db, { id: "character_alice", ownerId: owner, name: "Alice" });
    const bob = await seedCharacter(db, { id: "character_bob", ownerId: owner, name: "Bob" });
    const chat = await seedChat(db, "chat_group");

    const costarDigest = await seedChatDigest(db, {
      chatId: chat,
      scopedCharacterId: alice, // Alice is the scoped producer — Bob is NOT
      blockIdx: 0,
      text: "Bob and Alice argued in the war room.",
      embedding: vec(1),
    });
    await seedChatDigestSpeaker(db, costarDigest, bob); // Bob was present/spoke in this block

    // A second digest Bob has nothing to do with, and far from the query vector.
    await seedChatDigest(db, {
      chatId: chat,
      scopedCharacterId: alice,
      blockIdx: 1,
      text: "Alice meditated alone.",
      embedding: vec(0, 1),
    });

    const svc = makeSearch(db, { embedVector: () => vec(1), embedModel: EMBED_MODEL });
    const result = await svc.search({
      ownerId: owner,
      query: "the argument in the war room",
      topN: 5,
      over: "digests",
      scope: { kind: "character", characterId: bob },
    });

    if (result.over !== "digests") {
      throw new Error(`expected digests branch, got ${result.over}`);
    }
    // Without the OR-branch Bob would have ZERO digests (he produced none); the co-star block proves it.
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.blockKey.blockIdx).toBe(0);
    expect(result.hits[0]?.blockKey.scopedCharacterId).toBe(alice);
  });

  test("digests · character scope: a character present in NO block gets an empty result", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const alice = await seedCharacter(db, { id: "character_alice", ownerId: owner, name: "Alice" });
    const ghost = await seedCharacter(db, { id: "character_ghost", ownerId: owner, name: "Ghost" });
    const chat = await seedChat(db, "chat_solo");
    await seedChatDigest(db, {
      chatId: chat,
      scopedCharacterId: alice,
      blockIdx: 0,
      embedding: vec(1),
    });

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const result = await svc.search({
      ownerId: owner,
      query: "anything",
      topN: 5,
      over: "digests",
      scope: { kind: "character", characterId: ghost },
    });
    expect(result.hits).toHaveLength(0);
  });

  test("digests · character scope: a FOREIGN character id leaks nothing (owner belt)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const stranger = await seedUser(db, { handle: "stranger" });
    const alice = await seedCharacter(db, { id: "character_alice", ownerId: owner, name: "Alice" });
    const chat = await seedChat(db, "chat_solo");
    const dg = await seedChatDigest(db, {
      chatId: chat,
      scopedCharacterId: alice,
      blockIdx: 0,
      embedding: vec(1),
    });
    await seedChatDigestSpeaker(db, dg, alice);

    // The stranger principal scopes by the owner's character — the characters-join owner belt filters it out.
    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const result = await svc.search({
      ownerId: stranger,
      query: "the scene",
      topN: 5,
      over: "digests",
      scope: { kind: "character", characterId: alice },
    });
    expect(result.hits).toHaveLength(0);
  });

  test("characters target · owner scope: delegates to findCharacters and tags the branch", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const alice = await seedCharacter(db, { id: "character_alice", ownerId: owner, name: "Alice" });
    await seedCharacterEmbedding(db, { characterId: alice, embedding: vec(1) });

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const result = await svc.search({
      ownerId: owner,
      query: "brooding swordswoman",
      topN: 5,
      over: "characters",
      scope: { kind: "owner" },
    });
    if (result.over !== "characters") {
      throw new Error(`expected characters branch, got ${result.over}`);
    }
    expect(result.hits[0]?.characterId).toBe(alice);
  });

  test("an owner-wide target refuses a narrower scope (flag-don't-fake)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const svc = makeSearch(db, { embedVector: () => vec(1) });
    await expect(
      svc.search({
        ownerId: owner,
        query: "x",
        topN: 5,
        over: "characters",
        scope: { kind: "chat", chatId: await seedChat(db, "chat_x") },
      }),
    ).rejects.toMatchObject({ code: "scope_unsupported" });
  });

  test("the images target without a lens throws lens_required", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const svc = makeSearch(db, { embedVector: () => vec(1) });
    await expect(svc.search({ ownerId: owner, query: "x", topN: 5, over: "images", scope: { kind: "owner" } })).rejects.toMatchObject({
      code: "lens_required",
    });
  });

  test("digests · chat scope: a FOREIGN chat leaks nothing (characters-join owner belt)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const theirChar = await seedCharacter(db, {
      id: "character_them",
      ownerId: other,
      name: "Them",
    });
    const theirChat = await seedChat(db, "chat_theirs");
    await seedChatDigest(db, {
      chatId: theirChat,
      scopedCharacterId: theirChar,
      blockIdx: 0,
      text: "a secret scene",
      embedding: vec(1),
    });

    // The owner principal scopes by another tenant's chat — the ownerId belt (scoped-producer join) filters it.
    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const result = await svc.search({
      ownerId: owner,
      query: "the scene",
      topN: 5,
      over: "digests",
      scope: { kind: "chat", chatId: theirChat },
    });
    expect(result.hits).toHaveLength(0);
  });

  test("segments · chat scope: owned chat returns hits, an unowned chat returns [] (ownedChatIds gate)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const alice = await seedCharacter(db, { id: "character_alice", ownerId: owner, name: "Alice" });
    // The owner's chat: it must carry a digest so ownedChatIds materializes it, plus the verbatim segment.
    const myChat = await seedChat(db, "chat_mine");
    await seedChatDigest(db, {
      chatId: myChat,
      scopedCharacterId: alice,
      blockIdx: 0,
      embedding: vec(0, 1),
    });
    await seedChatSegment(db, {
      chatId: myChat,
      blockIdx: 0,
      text: "the verbatim line",
      embedding: vec(1),
    });
    // Another tenant's chat with a segment the owner must never reach.
    const theirChat = await seedChat(db, "chat_theirs");
    const theirChar = await seedCharacter(db, {
      id: "character_them",
      ownerId: other,
      name: "Them",
    });
    await seedChatDigest(db, {
      chatId: theirChat,
      scopedCharacterId: theirChar,
      blockIdx: 0,
      embedding: vec(0, 1),
    });
    await seedChatSegment(db, {
      chatId: theirChat,
      blockIdx: 0,
      text: "their verbatim secret",
      embedding: vec(1),
    });

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const owned = await svc.search({
      ownerId: owner,
      query: "the line",
      topN: 5,
      over: "segments",
      scope: { kind: "chat", chatId: myChat, scopedCharacterId: alice },
    });
    if (owned.over !== "segments") {
      throw new Error(`expected segments branch, got ${owned.over}`);
    }
    expect(owned.hits).toHaveLength(1);
    expect(owned.hits[0]?.blockKey.chatId).toBe(myChat);

    const foreign = await svc.search({
      ownerId: owner,
      query: "the line",
      topN: 5,
      over: "segments",
      scope: { kind: "chat", chatId: theirChat, scopedCharacterId: alice },
    });
    expect(foreign.hits).toHaveLength(0);
  });

  test("documents · owner scope reaches the caller's OWN bank only; chat scope is refused on the wire (DBK-C)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const stranger = await seedUser(db, { handle: "stranger" });
    const mine = await seedDocument(db, { id: "document_mine", ownerId: owner, name: "Mine" });
    const theirs = await seedDocument(db, { id: "document_theirs", ownerId: stranger, name: "Theirs" });
    await seedDocumentChunk(db, { documentId: mine, chunkIdx: 0, content: "my canon", embedding: vec(1) });
    await seedDocumentChunk(db, { documentId: theirs, chunkIdx: 0, content: "their canon", embedding: vec(1) });

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const result = await svc.search({ ownerId: owner, query: "canon", topN: 5, over: "documents", scope: { kind: "owner" } });
    if (result.over !== "documents") {
      throw new Error(`expected documents branch, got ${result.over}`);
    }
    // The omnibox is self-scoped: the caller's bank only — a stranger's equally-near chunk never surfaces.
    expect(result.hits.map((h) => h.documentId)).toEqual([mine]);

    // The chat/character scopes are compose-injection-only (chat's GATHER authorizes membership); the
    // un-authorized omnibox refuses them — a stranger can't pass a foreign chatId to pull a host's chunks.
    const chatId = await seedChat(db, "chat_scoped");
    await expect(svc.search({ ownerId: owner, query: "canon", topN: 5, over: "documents", scope: { kind: "chat", chatId } })).rejects.toMatchObject({
      code: "scope_unsupported",
    });
  });
});
