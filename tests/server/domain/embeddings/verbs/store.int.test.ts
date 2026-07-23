// verb: store — the single vector write path. Load-bearing assertions:
//   • the `(model, dim)` SPACE TAG lands on every row (the embedding-space invariant);
//   • the content_hash STALENESS GATE: identical content ⇒ `noop` (NO re-embed, NO second row); changed
//     content ⇒ `written` (re-embed, one row updated in place);
//   • the SPACE TRIPWIRE: an embedder returning a wrong-dim vector throws `SpaceMismatchError` (no row lands);
//   • `EmbedFailedError` on a filtered/null vector;
//   • `hub_score` is NEVER touched by a store (a re-embed preserves a discovery-written score — §invariant 2);
//   • both image lenses (`image-raw` pure-visual + `image-captioned` joint-VL) coexist per asset, caption
//     persisted only on the captioned lens.

import { characterEmbeddings, chatDigestSpeakers, chatDigests, chatSegments, documentChunks, imageEmbeddings } from "@orb/db";
import type { ChatDigestId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createEmbeddingsService, EmbedFailedError, SpaceMismatchError } from "@orb/server/domain/embeddings";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import {
  EMBED_DIM,
  EMBED_MODEL,
  fakeVector,
  IMAGE_EMBED_MODEL,
  makeStoreHarness,
  seedAsset,
  seedCharacter,
  seedChat,
  seedDocument,
  seedUser,
  TEST_CAPTION,
} from "../_support.ts";

const CARD_TEXT = "Alice — a curious traveler who maps forgotten roads.";
const IMG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

describe("store — card-text (character_embeddings)", () => {
  test("writes a row tagged with the declared (model, dim) space", async () => {
    const db = await freshDb();
    const h = makeStoreHarness(db);
    const svc = createEmbeddingsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const characterId = await seedCharacter(db, owner);

    const result = await svc.store({
      kind: "card",
      lens: "card-text",
      characterId,
      content: CARD_TEXT,
      model: EMBED_MODEL,
      dim: EMBED_DIM,
    });

    expect(result.outcome).toBe("written");
    expect(h.roleClients.embed).toHaveBeenCalledTimes(1);

    const rows = await db.select().from(characterEmbeddings).where(eq(characterEmbeddings.characterId, characterId));
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.model).toBe(EMBED_MODEL);
    expect(row?.dim).toBe(EMBED_DIM);
    expect(row?.embedding).toHaveLength(EMBED_DIM);
    expect(row?.contentHash).toBe(result.contentHash);
    // The advisory-stale hub_score is never written by a store — it is null until discovery writes it.
    expect(row?.hubScore).toBeNull();
  });

  test("identical content is a noop — no re-embed, no second row", async () => {
    const db = await freshDb();
    const h = makeStoreHarness(db);
    const svc = createEmbeddingsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const characterId = await seedCharacter(db, owner);
    const params = {
      kind: "card",
      lens: "card-text",
      characterId,
      content: CARD_TEXT,
      model: EMBED_MODEL,
      dim: EMBED_DIM,
    } as const;

    const first = await svc.store(params);
    const second = await svc.store(params);

    expect(first.outcome).toBe("written");
    expect(second.outcome).toBe("noop");
    expect(second.contentHash).toBe(first.contentHash);
    // The staleness gate short-circuits BEFORE the embed — still exactly one embed call.
    expect(h.roleClients.embed).toHaveBeenCalledTimes(1);
    const rows = await db.select().from(characterEmbeddings).where(eq(characterEmbeddings.characterId, characterId));
    expect(rows).toHaveLength(1);
  });

  test("changed content re-embeds and updates the one row in place", async () => {
    const db = await freshDb();
    const h = makeStoreHarness(db);
    const svc = createEmbeddingsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const characterId = await seedCharacter(db, owner);

    const first = await svc.store({
      kind: "card",
      lens: "card-text",
      characterId,
      content: CARD_TEXT,
      model: EMBED_MODEL,
      dim: EMBED_DIM,
    });
    const second = await svc.store({
      kind: "card",
      lens: "card-text",
      characterId,
      content: `${CARD_TEXT} (edited)`,
      model: EMBED_MODEL,
      dim: EMBED_DIM,
    });

    expect(second.outcome).toBe("written");
    expect(second.contentHash).not.toBe(first.contentHash);
    expect(h.roleClients.embed).toHaveBeenCalledTimes(2);
    const rows = await db.select().from(characterEmbeddings).where(eq(characterEmbeddings.characterId, characterId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.contentHash).toBe(second.contentHash);
  });

  test("a wrong-dim vector trips the space tripwire (SpaceMismatchError; no row lands)", async () => {
    const db = await freshDb();
    const h = makeStoreHarness(db);
    const svc = createEmbeddingsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const characterId = await seedCharacter(db, owner);
    h.roleClients.embed.mockResolvedValueOnce({
      vectors: [fakeVector(EMBED_DIM + 1)],
      model: EMBED_MODEL,
      usage: { promptTokens: null, totalTokens: null },
    });

    await expect(
      svc.store({
        kind: "card",
        lens: "card-text",
        characterId,
        content: CARD_TEXT,
        model: EMBED_MODEL,
        dim: EMBED_DIM,
      }),
    ).rejects.toBeInstanceOf(SpaceMismatchError);

    const rows = await db.select().from(characterEmbeddings);
    expect(rows).toHaveLength(0);
  });

  test("a filtered/null vector throws EmbedFailedError (no row lands)", async () => {
    const db = await freshDb();
    const h = makeStoreHarness(db);
    const svc = createEmbeddingsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const characterId = await seedCharacter(db, owner);
    h.roleClients.embed.mockResolvedValueOnce({
      vectors: [null],
      model: EMBED_MODEL,
      usage: { promptTokens: null, totalTokens: null },
    });

    await expect(
      svc.store({
        kind: "card",
        lens: "card-text",
        characterId,
        content: CARD_TEXT,
        model: EMBED_MODEL,
        dim: EMBED_DIM,
      }),
    ).rejects.toBeInstanceOf(EmbedFailedError);
    const rows = await db.select().from(characterEmbeddings);
    expect(rows).toHaveLength(0);
  });

  test("a re-embed never nulls a discovery-written hub_score (§invariant 2)", async () => {
    const db = await freshDb();
    const h = makeStoreHarness(db);
    const svc = createEmbeddingsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const characterId = await seedCharacter(db, owner);
    await svc.store({
      kind: "card",
      lens: "card-text",
      characterId,
      content: CARD_TEXT,
      model: EMBED_MODEL,
      dim: EMBED_DIM,
    });
    const written = (await db.select().from(characterEmbeddings).where(eq(characterEmbeddings.characterId, characterId)))[0];
    // discovery writes a hub score through the only permitted seam…
    await svc.writeHubScores({
      table: "character_embeddings",
      updates: [{ id: written?.id ?? "", model: EMBED_MODEL, hubScore: 0.87 }],
    });
    // …then a content edit re-embeds — the hub score must survive.
    await svc.store({
      kind: "card",
      lens: "card-text",
      characterId,
      content: `${CARD_TEXT} (edited again)`,
      model: EMBED_MODEL,
      dim: EMBED_DIM,
    });
    const after = (await db.select().from(characterEmbeddings).where(eq(characterEmbeddings.characterId, characterId)))[0];
    expect(after?.hubScore).toBe(0.87);
  });
});

describe("store — image lenses (image_embeddings)", () => {
  test("image-raw stores a pure-visual row (no caption) in the imageEmbed model space", async () => {
    const db = await freshDb();
    const h = makeStoreHarness(db);
    const svc = createEmbeddingsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const assetId = await seedAsset(db, owner);

    const result = await svc.store({
      kind: "avatar",
      lens: "image-raw",
      assetId,
      content: IMG,
      model: IMAGE_EMBED_MODEL,
      dim: EMBED_DIM,
    });

    expect(result.outcome).toBe("written");
    expect(h.roleClients.imageEmbed).toHaveBeenCalledWith({ kind: "image", input: IMG });
    const rows = await db.select().from(imageEmbeddings).where(eq(imageEmbeddings.assetId, assetId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.lens).toBe("image-raw");
    expect(rows[0]?.caption).toBeNull();
    expect(rows[0]?.model).toBe(IMAGE_EMBED_MODEL);
  });

  test("image-captioned embeds image+caption jointly and persists the caption; both lenses coexist", async () => {
    const db = await freshDb();
    const h = makeStoreHarness(db);
    const svc = createEmbeddingsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const assetId = await seedAsset(db, owner);

    await svc.store({
      kind: "avatar",
      lens: "image-raw",
      assetId,
      content: IMG,
      model: IMAGE_EMBED_MODEL,
      dim: EMBED_DIM,
    });
    await svc.store({
      kind: "avatar",
      lens: "image-captioned",
      assetId,
      content: IMG,
      caption: TEST_CAPTION,
      model: IMAGE_EMBED_MODEL,
      dim: EMBED_DIM,
    });

    expect(h.roleClients.imageEmbed).toHaveBeenCalledWith({
      kind: "multimodal",
      input: { image: IMG, text: TEST_CAPTION },
    });
    const rows = await db.select().from(imageEmbeddings).where(eq(imageEmbeddings.assetId, assetId));
    // Both lenses coexist for one asset in one space (the unique key is (assetId, model, lens)).
    expect(rows).toHaveLength(2);
    const captioned = rows.find((r) => r.lens === "image-captioned");
    expect(captioned?.caption).toBe(TEST_CAPTION);
  });

  // F8 — an EMPTY caption (the summarizer returned no item) must NOT be written to the captioned lens:
  // `image_embeddings.content_hash` covers the BYTES only, so a `caption: ""` row would short-circuit to
  // `noop` on every future run and never regenerate without `force` (permanent degradation). Skip-don't-write
  // (mirrors the memory digest's skippedEmpty) — the row stays absent so the next indexer run retries it.
  test("empty caption → captioned lens NOT poisoned; retried (skip-don't-write)", async () => {
    const db = await freshDb();
    const h = makeStoreHarness(db);
    const svc = createEmbeddingsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const assetId = await seedAsset(db, owner);

    const skipped = await svc.store({
      kind: "avatar",
      lens: "image-captioned",
      assetId,
      content: IMG,
      caption: "   \n  ", // whitespace-only ≡ empty (the summarizer produced nothing usable)
      model: IMAGE_EMBED_MODEL,
      dim: EMBED_DIM,
    });

    expect(skipped.outcome).toBe("noop");
    // The expensive joint embed never ran, and NO poisoned captioned row landed.
    expect(h.roleClients.imageEmbed).not.toHaveBeenCalled();
    const empty = await db.select().from(imageEmbeddings).where(eq(imageEmbeddings.assetId, assetId));
    expect(empty.filter((r) => r.lens === "image-captioned")).toHaveLength(0);

    // A later run with a REAL caption is not short-circuited — it embeds + writes the captioned lens.
    const written = await svc.store({
      kind: "avatar",
      lens: "image-captioned",
      assetId,
      content: IMG,
      caption: TEST_CAPTION,
      model: IMAGE_EMBED_MODEL,
      dim: EMBED_DIM,
    });
    expect(written.outcome).toBe("written");
    expect(h.roleClients.imageEmbed).toHaveBeenCalledTimes(1);
    const after = await db.select().from(imageEmbeddings).where(eq(imageEmbeddings.assetId, assetId));
    expect(after.find((r) => r.lens === "image-captioned")?.caption).toBe(TEST_CAPTION);
  });
});

describe("store — chat-block lenses (segment / digest)", () => {
  const digestText = "[Alice, Bob — the docks] Alice agreed to smuggle the relic.\nkeywords: Alice, relic";
  const segmentText = "Alice: meet me at the docks.\nBob: I'll bring the relic.";

  test("segment persists the verbatim text + seq-span; the PRECOMPUTED contentHash gates (no recompute)", async () => {
    const db = await freshDb();
    const h = makeStoreHarness(db);
    const svc = createEmbeddingsService(h.ctx);
    const chatId = await seedChat(db);

    const result = await svc.store({
      kind: "chat-block",
      lens: "segment",
      chatId,
      blockIdx: 3,
      seqStart: 24,
      seqEnd: 31,
      text: segmentText,
      contentHash: "precomputed-seg-hash",
      model: EMBED_MODEL,
      dim: EMBED_DIM,
    });

    expect(result.outcome).toBe("written");
    // the store does NOT recompute — it returns memory's precomputed hash verbatim.
    expect(result.contentHash).toBe("precomputed-seg-hash");
    expect(h.roleClients.embed).toHaveBeenCalledWith(segmentText);
    const rows = await db.select().from(chatSegments).where(eq(chatSegments.chatId, chatId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text).toBe(segmentText);
    expect(rows[0]?.seqStart).toBe(24);
    expect(rows[0]?.seqEnd).toBe(31);
    expect(rows[0]?.contentHash).toBe("precomputed-seg-hash");
    expect(rows[0]?.hubScore).toBeNull();
  });

  test("an unchanged segment hash is a noop — no re-embed, no second row", async () => {
    const db = await freshDb();
    const h = makeStoreHarness(db);
    const svc = createEmbeddingsService(h.ctx);
    const chatId = await seedChat(db);
    const params = {
      kind: "chat-block",
      lens: "segment",
      chatId,
      blockIdx: 0,
      seqStart: 1,
      seqEnd: 8,
      text: segmentText,
      contentHash: "seg-h",
      model: EMBED_MODEL,
      dim: EMBED_DIM,
    } as const;

    expect((await svc.store(params)).outcome).toBe("written");
    expect((await svc.store(params)).outcome).toBe("noop");
    expect(h.roleClients.embed).toHaveBeenCalledTimes(1);
    expect(await db.select().from(chatSegments).where(eq(chatSegments.chatId, chatId))).toHaveLength(1);
  });

  test("digest persists text + the §2b facets keyed by the real-CharacterId scope; hub_score untouched", async () => {
    const db = await freshDb();
    const h = makeStoreHarness(db);
    const svc = createEmbeddingsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const scoped = await seedCharacter(db, owner, { id: "character_scope" });
    const chatId = await seedChat(db);

    const result = await svc.store({
      kind: "chat-block",
      lens: "digest",
      chatId,
      scopedCharacterId: scoped,
      isGroup: true,
      tier: 0,
      blockIdx: 3,
      text: digestText,
      topicAnchor: "[Alice, Bob — the docks]",
      keywords: ["Alice", "Bob", "relic"],
      speakerCharacterIds: [scoped],
      contentHash: "precomputed-digest-hash",
      model: EMBED_MODEL,
      dim: EMBED_DIM,
    });

    expect(result.outcome).toBe("written");
    expect(result.contentHash).toBe("precomputed-digest-hash");
    expect(h.roleClients.embed).toHaveBeenCalledWith(digestText);
    const rows = await db.select().from(chatDigests).where(eq(chatDigests.chatId, chatId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text).toBe(digestText);
    expect(rows[0]?.scopedCharacterId).toBe(scoped);
    expect(rows[0]?.isGroup).toBe(true);
    expect(rows[0]?.topicAnchor).toBe("[Alice, Bob — the docks]");
    expect(rows[0]?.keywords).toEqual(["Alice", "Bob", "relic"]);
    expect(rows[0]?.hubScore).toBeNull();
    // the §4 chat_digest_speakers join is written against the persisted digest id.
    const speakers = await db
      .select()
      .from(chatDigestSpeakers)
      .where(eq(chatDigestSpeakers.digestId, rows[0]?.id ?? castId<ChatDigestId>("missing")));
    expect(speakers.map((s) => s.characterId)).toEqual([scoped]);
  });

  test("the chat_digest_speakers join is REPLACED on a re-digest + cleared by an empty speaker set", async () => {
    const db = await freshDb();
    const h = makeStoreHarness(db);
    const svc = createEmbeddingsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const aria = await seedCharacter(db, owner, { id: "character_aria", name: "Aria" });
    const bram = await seedCharacter(db, owner, { id: "character_bram", name: "Bram" });
    const grp = await seedCharacter(db, owner, { id: "character_grp", name: "Group" });
    const chatId = await seedChat(db);
    const base = {
      kind: "chat-block",
      lens: "digest",
      chatId,
      scopedCharacterId: grp,
      isGroup: true,
      tier: 0,
      blockIdx: 0,
      text: digestText,
      topicAnchor: "[a]",
      keywords: ["k"],
      model: EMBED_MODEL,
      dim: EMBED_DIM,
    } as const;
    const digestId = async (): Promise<ChatDigestId> => {
      const r = await db.select().from(chatDigests).where(eq(chatDigests.chatId, chatId));
      return r[0]?.id ?? castId<ChatDigestId>("missing");
    };
    const speakerSet = async (): Promise<string[]> => {
      const s = await db
        .select()
        .from(chatDigestSpeakers)
        .where(eq(chatDigestSpeakers.digestId, await digestId()));
      return s.map((x) => x.characterId).sort();
    };

    await svc.store({ ...base, speakerCharacterIds: [aria, bram], contentHash: "h1" });
    expect(await speakerSet()).toEqual([aria, bram].sort());

    // re-digest (changed hash) with a different speaker set → REPLACED, not appended.
    await svc.store({ ...base, speakerCharacterIds: [aria], contentHash: "h2" });
    expect(await speakerSet()).toEqual([aria]);

    // re-digest with no speakers → join cleared.
    await svc.store({ ...base, speakerCharacterIds: [], contentHash: "h3" });
    expect(await speakerSet()).toEqual([]);
  });

  test("two scoped POVs for the same (chat, tier, block) coexist (the scope is part of the key)", async () => {
    const db = await freshDb();
    const h = makeStoreHarness(db);
    const svc = createEmbeddingsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const aria = await seedCharacter(db, owner, { id: "character_aria", name: "Aria" });
    const bram = await seedCharacter(db, owner, { id: "character_bram", name: "Bram" });
    const chatId = await seedChat(db);
    const base = {
      kind: "chat-block",
      lens: "digest",
      chatId,
      isGroup: true,
      tier: 0,
      blockIdx: 0,
      text: digestText,
      topicAnchor: "[anchor]",
      keywords: ["k"],
      speakerCharacterIds: [aria, bram],
      model: EMBED_MODEL,
      dim: EMBED_DIM,
    } as const;

    await svc.store({ ...base, scopedCharacterId: aria, contentHash: "h-aria" });
    await svc.store({ ...base, scopedCharacterId: bram, contentHash: "h-bram" });

    // distinct scopedCharacterId ⇒ no collision under the (chat, scope, tier, block) UNIQUE.
    const rows = await db.select().from(chatDigests).where(eq(chatDigests.chatId, chatId));
    expect(rows).toHaveLength(2);
  });
});

describe("store — chunk (document_chunks, the 5th arm — databank-design/05 §2)", () => {
  test("writes a row with the FK/idx/span/hash/(model,dim) tag; re-store same content ⇒ noop, no re-embed", async () => {
    const db = await freshDb();
    const h = makeStoreHarness(db);
    const svc = createEmbeddingsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const documentId = await seedDocument(db, owner);

    const params = {
      kind: "document",
      lens: "chunk",
      content: "the first chunk slice of the document canon",
      model: EMBED_MODEL,
      dim: EMBED_DIM,
      fkRefs: { documentId, chunkIdx: 0, charStart: 0, charEnd: 43 },
    } as const;

    const first = await svc.store(params);
    expect(first.outcome).toBe("written");
    expect(h.roleClients.embed).toHaveBeenCalledTimes(1);

    const rows = await db.select().from(documentChunks).where(eq(documentChunks.documentId, documentId));
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.chunkIdx).toBe(0);
    expect(row?.content).toBe(params.content);
    expect(row?.charStart).toBe(0);
    expect(row?.charEnd).toBe(43);
    expect(row?.model).toBe(EMBED_MODEL);
    expect(row?.dim).toBe(EMBED_DIM);
    expect(row?.embedding).toHaveLength(EMBED_DIM);
    expect(row?.contentHash).toBe(first.contentHash);
    expect(row?.hubScore).toBeNull(); // never touched by a store (D20/discovery-only)

    // Idempotent re-run: identical content short-circuits BEFORE the embed (the no-op economy).
    const again = await svc.store(params);
    expect(again.outcome).toBe("noop");
    expect(h.roleClients.embed).toHaveBeenCalledTimes(1); // no second embed call
    expect(await db.select().from(documentChunks)).toHaveLength(1);
  });

  test("a changed slice at the same (documentId, chunkIdx, model) re-embeds and updates in place", async () => {
    const db = await freshDb();
    const h = makeStoreHarness(db);
    const svc = createEmbeddingsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const documentId = await seedDocument(db, owner);
    const base = {
      kind: "document",
      lens: "chunk",
      model: EMBED_MODEL,
      dim: EMBED_DIM,
      fkRefs: { documentId, chunkIdx: 0, charStart: 0, charEnd: 5 },
    } as const;

    await svc.store({ ...base, content: "alpha" });
    const changed = await svc.store({ ...base, content: "bravo" });
    expect(changed.outcome).toBe("written");

    const rows = await db.select().from(documentChunks).where(eq(documentChunks.documentId, documentId));
    expect(rows).toHaveLength(1); // in-place update, not a second row
    expect(rows[0]?.content).toBe("bravo");
  });

  test("a wrong-dim embed vector throws SpaceMismatchError and lands no row", async () => {
    const db = await freshDb();
    const h = makeStoreHarness(db);
    const svc = createEmbeddingsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const documentId = await seedDocument(db, owner);
    h.roleClients.embed.mockResolvedValueOnce({
      vectors: [fakeVector(EMBED_DIM + 1, 1)],
      model: EMBED_MODEL,
      usage: { promptTokens: null, totalTokens: null },
    });

    await expect(
      svc.store({
        kind: "document",
        lens: "chunk",
        content: "x",
        model: EMBED_MODEL,
        dim: EMBED_DIM,
        fkRefs: { documentId, chunkIdx: 0, charStart: 0, charEnd: 1 },
      }),
    ).rejects.toBeInstanceOf(SpaceMismatchError);
    expect(await db.select().from(documentChunks)).toHaveLength(0);
  });
});
