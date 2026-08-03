// .int tests for schema/embeddings — the vector substrate (D20 no ownerId / D28 no cv / D34 image lens).
// Real libSQL :memory: via freshDb (FK PRAGMA ON). Covers: the vector32 1024-dim Float32 round-trip,
// content_hash presence (NOT NULL), the image-lens test-mirror + CHECK + the (asset,model,lens) unique
// (both lenses coexist, a dup lens collides), the digest/segment `text` round-trip + NOT NULL, the
// scopedCharacterId real-`CharacterId` FK (→ characters CASCADE; no `''` sentinel — inv 8) + the digest
// scope UNIQUE, the ABSENCE of ownerId on every vector row (D20), chat-child CASCADE, and the
// chat_digest_speakers join.

import { IMAGE_LENSES } from "@orb/contracts/embeddings";
import type { Db } from "@orb/db";
import { assets, characterEmbeddings, characters, chatDigestSpeakers, chatDigests, chatSegments, chats, imageEmbeddings } from "@orb/db";
import { isConstraintViolation } from "@orb/db/kit";
import type { AssetId, CharacterEmbeddingId, CharacterHandle, CharacterId, ChatDigestId, ChatSegmentId, Handle, ImageEmbeddingId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import { freshDb } from "../../support/db.ts";
import { expect, test } from "../../support/fixtures.ts";
import { seedChat, seedUser } from "./_support.ts";

// The one space's dim (mirrors schema VECTOR_DIM). A deterministic ramp vector (no Math-random) — every
// value is exactly representable round-trippable through F32_BLOB.
const DIM = 1024;
const MODEL = "qwen3-vl";
function rampVector(): Float32Array {
  return Float32Array.from({ length: DIM }, (_unused, i) => i / DIM);
}

async function seedCharacter(db: Db, ownerId: UserId, id: string): Promise<CharacterId> {
  const characterId = castId<CharacterId>(id);
  await db.insert(characters).values({
    id: characterId,
    handle: castId<CharacterHandle>(`card-${id}`),
    ownerId,
    contentHash: "hash-card",
    name: "Card",
  });
  return characterId;
}

async function seedAsset(db: Db, ownerId: UserId, id: string): Promise<AssetId> {
  const assetId = castId<AssetId>(id);
  await db.insert(assets).values({
    id: assetId,
    ownerId,
    kind: "avatar",
    mime: "image/png",
    size: 1,
    hash: `hash-${id}`,
  });
  return assetId;
}

// ── Test-mirror (D34): the db column enum derives the ONE contracts tuple ──────────────────────────────
test("image_embeddings.lens enum mirrors IMAGE_LENSES (db derives the contracts tuple, never re-spells)", () => {
  expect(imageEmbeddings.lens.enumValues).toEqual([...IMAGE_LENSES]);
});

// ── vector32 round-trip + content_hash + the (model, dim) space tag ───────────────────────────────────
test("character_embeddings round-trips a 1024-dim Float32 blob + content_hash + branded id", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_ce", handle: castId<Handle>("h-user_ce") });
  const characterId = await seedCharacter(db, ownerId, "character_ce");
  const id = castId<CharacterEmbeddingId>("character_embedding_one");
  const vec = rampVector();

  await db.insert(characterEmbeddings).values({
    id,
    characterId,
    embedding: vec,
    contentHash: "hash-of-card-text",
    model: MODEL,
    dim: DIM,
  });

  const rows = await db.select().from(characterEmbeddings).where(eq(characterEmbeddings.id, id));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.id).toBe(id);
  expect(rows[0]?.characterId).toBe(characterId);
  // The F32_BLOB ⇄ Float32Array codec survives the driver round-trip (the slice() alignment idiom).
  expect(rows[0]?.embedding).toBeInstanceOf(Float32Array);
  expect(rows[0]?.embedding).toHaveLength(DIM);
  expect(Array.from(rows[0]?.embedding ?? [])).toEqual(Array.from(vec));
  expect(rows[0]?.contentHash).toBe("hash-of-card-text");
  expect(rows[0]?.model).toBe(MODEL);
  expect(rows[0]?.dim).toBe(DIM);
  // hub_score is advisory: a store-style write never sets it (discovery owns it). Born null.
  expect(rows[0]?.hubScore).toBeNull();
  // Timestamp is an epoch-MS NUMBER (not a Date).
  expect(rows[0]?.createdAt).toBeTypeOf("number");
});

test("content_hash is NOT NULL — a vector write missing it is rejected", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_ch", handle: castId<Handle>("h-user_ch") });
  const characterId = await seedCharacter(db, ownerId, "character_ch");
  let caught: unknown;
  try {
    await db.insert(characterEmbeddings).values({
      id: castId<CharacterEmbeddingId>("character_embedding_nohash"),
      characterId,
      embedding: rampVector(),
      // contentHash omitted on purpose.
      model: MODEL,
      dim: DIM,
    } as never);
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("not-null");
});

test("character_embeddings is UNIQUE per (characterId, model) — a duplicate collides (upsert target)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_cem", handle: castId<Handle>("h-user_cem") });
  const characterId = await seedCharacter(db, ownerId, "character_cem");

  await db.insert(characterEmbeddings).values({
    id: castId<CharacterEmbeddingId>("character_embedding_cem_a"),
    characterId,
    embedding: rampVector(),
    contentHash: "h",
    model: MODEL,
    dim: DIM,
  });

  // A second row for the same (characterId, model) collides on the unique index (the ON CONFLICT target).
  let caught: unknown;
  try {
    await db.insert(characterEmbeddings).values({
      id: castId<CharacterEmbeddingId>("character_embedding_cem_b"),
      characterId,
      embedding: rampVector(),
      contentHash: "h2",
      model: MODEL,
      dim: DIM,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});

test("character_embeddings.hubScore is a FLOAT — a fractional value round-trips as a number", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_hub", handle: castId<Handle>("h-user_hub") });
  const characterId = await seedCharacter(db, ownerId, "character_hub");
  const id = castId<CharacterEmbeddingId>("character_embedding_hub");
  // A CSLS mean-cosine FLOAT (the `real` column type) — discovery would write it; here we assert the type.
  const hubScore = 0.73;
  await db.insert(characterEmbeddings).values({
    id,
    characterId,
    embedding: rampVector(),
    contentHash: "h",
    hubScore,
    model: MODEL,
    dim: DIM,
  });

  const row = (await db.select().from(characterEmbeddings).where(eq(characterEmbeddings.id, id)))[0];
  expect(row?.hubScore).toBeTypeOf("number");
  expect(row?.hubScore).toBeCloseTo(hubScore);
});

// ── NO ownerId on ANY vector row (D20 — scope derives from the producer FK) ───────────────────────────
test("no vector table carries an ownerId column (D20 — owner-scope derives from the producer FK)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_no_owner", handle: castId<Handle>("h-user_no_owner") });
  const characterId = await seedCharacter(db, ownerId, "character_no_owner");
  const assetId = await seedAsset(db, ownerId, "asset_no_owner");
  const chatId = await seedChat(db, { id: "chat_no_owner" });

  await db.insert(characterEmbeddings).values({
    id: castId<CharacterEmbeddingId>("character_embedding_no_owner"),
    characterId,
    embedding: rampVector(),
    contentHash: "h",
    model: MODEL,
    dim: DIM,
  });
  await db.insert(imageEmbeddings).values({
    id: castId<ImageEmbeddingId>("image_embedding_no_owner"),
    assetId,
    embedding: rampVector(),
    lens: "image-raw",
    contentHash: "h",
    model: MODEL,
    dim: DIM,
  });
  await db.insert(chatDigests).values({
    id: castId<ChatDigestId>("chat_digest_no_owner"),
    chatId,
    scopedCharacterId: characterId,
    tier: 0,
    blockIdx: 0,
    text: "digest body",
    embedding: rampVector(),
    contentHash: "h",
    model: MODEL,
    dim: DIM,
  });
  await db.insert(chatSegments).values({
    id: castId<ChatSegmentId>("chat_segment_no_owner"),
    chatId,
    blockIdx: 0,
    seqStart: 0,
    seqEnd: 15,
    text: "verbatim transcript",
    embedding: rampVector(),
    contentHash: "h",
    model: MODEL,
    dim: DIM,
  });

  const ce = await db.select().from(characterEmbeddings);
  const ie = await db.select().from(imageEmbeddings);
  const cd = await db.select().from(chatDigests);
  const cs = await db.select().from(chatSegments);
  for (const row of [ce[0], ie[0], cd[0], cs[0]]) {
    expect(Object.keys(row ?? {})).not.toContain("ownerId");
  }
});

// ── The image lens: both lenses coexist per (asset, model); a duplicate lens collides on the unique ───
test("image_embeddings holds BOTH lenses per (asset, model) and rejects a duplicate lens", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_img", handle: castId<Handle>("h-user_img") });
  const assetId = await seedAsset(db, ownerId, "asset_img");

  await db.insert(imageEmbeddings).values({
    id: castId<ImageEmbeddingId>("image_embedding_raw"),
    assetId,
    embedding: rampVector(),
    lens: "image-raw",
    contentHash: "h",
    model: MODEL,
    dim: DIM,
  });
  await db.insert(imageEmbeddings).values({
    id: castId<ImageEmbeddingId>("image_embedding_cap"),
    assetId,
    embedding: rampVector(),
    lens: "image-captioned",
    caption: "a brooding knight",
    contentHash: "h",
    model: MODEL,
    dim: DIM,
  });

  const both = await db.select().from(imageEmbeddings).where(eq(imageEmbeddings.assetId, assetId));
  expect(both).toHaveLength(2);

  // A second `image-raw` for the same (asset, model) collides on (assetId, model, lens).
  let caught: unknown;
  try {
    await db.insert(imageEmbeddings).values({
      id: castId<ImageEmbeddingId>("image_embedding_raw_dup"),
      assetId,
      embedding: rampVector(),
      lens: "image-raw",
      contentHash: "h",
      model: MODEL,
      dim: DIM,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});

test("image_embeddings.lens CHECK rejects a non-member lens value", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_badlens", handle: castId<Handle>("h-user_badlens") });
  const assetId = await seedAsset(db, ownerId, "asset_badlens");
  let caught: unknown;
  try {
    await db.insert(imageEmbeddings).values({
      id: castId<ImageEmbeddingId>("image_embedding_bad"),
      assetId,
      embedding: rampVector(),
      lens: "nope" as never,
      contentHash: "h",
      model: MODEL,
      dim: DIM,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("check");
});

// ── chat_digests / chat_segments: the `text` body round-trips + is NOT NULL ───────────────────────────
test("chat_digests round-trips its distilled `text` body + topicAnchor + keywords (the {{memory}} fill)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_dtext", handle: castId<Handle>("h-user_dtext") });
  const characterId = await seedCharacter(db, ownerId, "character_dtext");
  const chatId = await seedChat(db, { id: "chat_dtext" });
  const id = castId<ChatDigestId>("chat_digest_text");
  await db.insert(chatDigests).values({
    id,
    chatId,
    scopedCharacterId: characterId,
    tier: 0,
    blockIdx: 0,
    text: "[Alice, Bob — the docks] Alice agreed to smuggle the relic.",
    topicAnchor: "[Alice, Bob — the docks]",
    keywords: ["Alice", "Bob", "relic", "docks"],
    embedding: rampVector(),
    contentHash: "h",
    model: MODEL,
    dim: DIM,
  });

  const rows = await db.select().from(chatDigests).where(eq(chatDigests.id, id));
  expect(rows[0]?.text).toBe("[Alice, Bob — the docks] Alice agreed to smuggle the relic.");
  expect(rows[0]?.topicAnchor).toBe("[Alice, Bob — the docks]");
  expect(rows[0]?.keywords).toEqual(["Alice", "Bob", "relic", "docks"]);
  expect(rows[0]?.scopedCharacterId).toBe(characterId);
  expect(rows[0]?.isGroup).toBe(false);
});

test("chat_segments round-trips its verbatim `text` transcript", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_stext" });
  const id = castId<ChatSegmentId>("chat_segment_text");
  await db.insert(chatSegments).values({
    id,
    chatId,
    blockIdx: 0,
    seqStart: 0,
    seqEnd: 7,
    text: "Alice: meet me at the docks.\nBob: I'll bring the relic.",
    embedding: rampVector(),
    contentHash: "h",
    model: MODEL,
    dim: DIM,
  });
  const rows = await db.select().from(chatSegments).where(eq(chatSegments.id, id));
  expect(rows[0]?.text).toBe("Alice: meet me at the docks.\nBob: I'll bring the relic.");
});

test("chat_digests.text is NOT NULL — a digest write missing its body is rejected", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_dnull", handle: castId<Handle>("h-user_dnull") });
  const characterId = await seedCharacter(db, ownerId, "character_dnull");
  const chatId = await seedChat(db, { id: "chat_dnull" });
  let caught: unknown;
  try {
    await db.insert(chatDigests).values({
      id: castId<ChatDigestId>("chat_digest_nulltext"),
      chatId,
      scopedCharacterId: characterId,
      tier: 0,
      blockIdx: 0,
      // text omitted on purpose.
      embedding: rampVector(),
      contentHash: "h",
      model: MODEL,
      dim: DIM,
    } as never);
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("not-null");
});

// ── chat_digests.scopedCharacterId: a REAL CharacterId FK (no '' sentinel — inv 8) + CASCADE + UNIQUE ──
test("chat_digests.scopedCharacterId FKs a real character — a dangling id is rejected (no '' sentinel)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_fk" });
  let caught: unknown;
  try {
    await db.insert(chatDigests).values({
      id: castId<ChatDigestId>("chat_digest_fk"),
      chatId,
      // A characterId that was never inserted — the FK must reject it (inv 8: always a real CharacterId).
      scopedCharacterId: castId<CharacterId>("character_ghost"),
      tier: 0,
      blockIdx: 0,
      text: "body",
      embedding: rampVector(),
      contentHash: "h",
      model: MODEL,
      dim: DIM,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("foreign-key");
});

test("deleting the scoped character CASCADEs its scoped digests (scopedCharacterId FK)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_scasc", handle: castId<Handle>("h-user_scasc") });
  const characterId = await seedCharacter(db, ownerId, "character_scasc");
  const chatId = await seedChat(db, { id: "chat_scasc" });
  const id = castId<ChatDigestId>("chat_digest_scasc");
  await db.insert(chatDigests).values({
    id,
    chatId,
    scopedCharacterId: characterId,
    tier: 0,
    blockIdx: 0,
    text: "body",
    embedding: rampVector(),
    contentHash: "h",
    model: MODEL,
    dim: DIM,
  });
  await db.delete(characters).where(eq(characters.id, characterId));
  expect(await db.select().from(chatDigests).where(eq(chatDigests.id, id))).toHaveLength(0);
});

test("two distinct scope buckets coexist at the same (chat, tier, block); a same-bucket duplicate collides", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_scope", handle: castId<Handle>("h-user_scope") });
  // The synthetic group-as-character (the shared/merged bucket) and a cast character (a scoped bucket) are
  // BOTH real CharacterIds (inv 8 — no '' sentinel); they key distinct buckets for the same block.
  const groupCharId = await seedCharacter(db, ownerId, "character_group");
  const castCharId = await seedCharacter(db, ownerId, "character_cast");
  const chatId = await seedChat(db, { id: "chat_scope" });

  await db.insert(chatDigests).values({
    id: castId<ChatDigestId>("chat_digest_group_b"),
    chatId,
    scopedCharacterId: groupCharId,
    tier: 0,
    blockIdx: 0,
    text: "shared body",
    embedding: rampVector(),
    contentHash: "h",
    model: MODEL,
    dim: DIM,
  });
  // Same (chat, tier, block) but a distinct scopedCharacterId ⇒ no collision.
  await db.insert(chatDigests).values({
    id: castId<ChatDigestId>("chat_digest_cast_b"),
    chatId,
    scopedCharacterId: castCharId,
    isGroup: true,
    tier: 0,
    blockIdx: 0,
    text: "egocentric body",
    embedding: rampVector(),
    contentHash: "h",
    model: MODEL,
    dim: DIM,
  });
  const all = await db.select().from(chatDigests).where(eq(chatDigests.chatId, chatId));
  expect(all).toHaveLength(2);

  // A second digest at the same (chat, groupCharId, tier, block) collides on the scope unique.
  let caught: unknown;
  try {
    await db.insert(chatDigests).values({
      id: castId<ChatDigestId>("chat_digest_group_dup"),
      chatId,
      scopedCharacterId: groupCharId,
      tier: 0,
      blockIdx: 0,
      text: "dup body",
      embedding: rampVector(),
      contentHash: "h2",
      model: MODEL,
      dim: DIM,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});

// ── chat children CASCADE on chat delete (digests + segments + speaker join all vanish) ───────────────
test("deleting a chat CASCADEs its digests, segments, and digest-speaker rows", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_casc", handle: castId<Handle>("h-user_casc") });
  const characterId = await seedCharacter(db, ownerId, "character_casc");
  const chatId = await seedChat(db, { id: "chat_casc" });
  const digestId = castId<ChatDigestId>("chat_digest_casc");

  await db.insert(chatDigests).values({
    id: digestId,
    chatId,
    scopedCharacterId: characterId,
    tier: 0,
    blockIdx: 0,
    text: "digest body",
    embedding: rampVector(),
    contentHash: "h",
    model: MODEL,
    dim: DIM,
  });
  await db.insert(chatSegments).values({
    id: castId<ChatSegmentId>("chat_segment_casc"),
    chatId,
    blockIdx: 0,
    seqStart: 0,
    seqEnd: 15,
    text: "verbatim transcript",
    embedding: rampVector(),
    contentHash: "h",
    model: MODEL,
    dim: DIM,
  });
  await db.insert(chatDigestSpeakers).values({ digestId, characterId });

  await db.delete(chats).where(eq(chats.id, chatId));

  expect(await db.select().from(chatDigests).where(eq(chatDigests.chatId, chatId))).toHaveLength(0);
  expect(await db.select().from(chatSegments).where(eq(chatSegments.chatId, chatId))).toHaveLength(0);
  expect(await db.select().from(chatDigestSpeakers).where(eq(chatDigestSpeakers.digestId, digestId))).toHaveLength(0);
});

// ── chat_digest_speakers — the identity-keyed join (composite PK; both FKs CASCADE) ───────────────────
test("chat_digest_speakers round-trips, dedupes on the composite PK, and CASCADEs on character delete", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_spk", handle: castId<Handle>("h-user_spk") });
  // The digest's SCOPE bucket is a distinct character (e.g. the synthetic group char) from the SPEAKER it
  // contains — so deleting the speaker exercises the speaker-join CASCADE in isolation (the digest, scoped
  // to a different character, survives; it does NOT also vanish via the scopedCharacterId FK).
  const scopeCharId = await seedCharacter(db, ownerId, "character_spk_scope");
  const characterId = await seedCharacter(db, ownerId, "character_spk");
  const chatId = await seedChat(db, { id: "chat_spk" });
  const digestId = castId<ChatDigestId>("chat_digest_spk");
  await db.insert(chatDigests).values({
    id: digestId,
    chatId,
    scopedCharacterId: scopeCharId,
    tier: 0,
    blockIdx: 0,
    text: "digest body",
    embedding: rampVector(),
    contentHash: "h",
    model: MODEL,
    dim: DIM,
  });

  await db.insert(chatDigestSpeakers).values({ digestId, characterId });
  const rows = await db
    .select()
    .from(chatDigestSpeakers)
    .where(and(eq(chatDigestSpeakers.digestId, digestId), eq(chatDigestSpeakers.characterId, characterId)));
  expect(rows).toHaveLength(1);

  // The composite PK rejects a duplicate (digest, character) pair (SQLite reports it as a UNIQUE failure).
  let caught: unknown;
  try {
    await db.insert(chatDigestSpeakers).values({ digestId, characterId });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");

  // Deleting the character CASCADEs the speaker row (the digest itself survives).
  await db.delete(characters).where(eq(characters.id, characterId));
  expect(await db.select().from(chatDigestSpeakers).where(eq(chatDigestSpeakers.digestId, digestId))).toHaveLength(0);
  expect(await db.select().from(chatDigests).where(eq(chatDigests.id, digestId))).toHaveLength(1);
});
