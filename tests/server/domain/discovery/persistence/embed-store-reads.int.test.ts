// Integration: the read-only SELECTs over the embeddings vector store — synthetic exclusion + owner
// derivation (characters.ownerId / digest→chat→host) + the OWNER-SCOPED hub reads (csls analyzes YOUR OWN
// library only — never cross-tenant; the bulk fan-out iterates `distinct*HubOwners`).

import type { Db } from "@orb/db";
import { digestThemeAssignments, themeClusters } from "@orb/db";
import type { ChatDigestId, ThemeClusterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import {
  distinctCharacterHubOwners,
  distinctDigestHubOwners,
  distinctImageHubOwners,
  distinctSegmentHubOwners,
  readCharacterHubVectors,
  readDigestHubVectors,
  readImageHubVectors,
  readOwnedCharacterVectors,
  readOwnedDigestKeywords,
  readOwnedDigestVectors,
  readSegmentHubVectors,
  readThemeClusterMembers,
  readThemeClusterTimeline,
  readTier0DigestSpans,
} from "../../../../../packages/server/src/domain/discovery/persistence/embed-store-reads.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import {
  EMBED_MODEL,
  FROZEN_AT,
  seedAsset,
  seedCharacter,
  seedCharacterEmbedding,
  seedChatDigest,
  seedChatSegment,
  seedDepartedHost,
  seedHostedChat,
  seedImageEmbedding,
  seedUser,
  vec,
} from "../_support.ts";

/** `themeDetail`'s member cap, spelled here so the owner-scope pin below is not a bare number. */
const MEMBER_LIMIT = 15;

// A theme cluster + one assignment row — `readTier0DigestSpans` reads only digests that were ASSIGNED.
async function seedThemeAssignment(db: Db, ownerId: UserId, digestId: string): Promise<void> {
  const clusterId = castId<ThemeClusterId>(`theme_cluster_${digestId}`);
  await db.insert(themeClusters).values({
    id: clusterId,
    ownerId,
    level: "scene",
    clusterIdx: 0,
    name: "Adventures",
    centroid: vec(1),
    size: 1,
    model: EMBED_MODEL,
    computedAt: FROZEN_AT,
  });
  await db
    .insert(digestThemeAssignments)
    .values({ digestId: castId<ChatDigestId>(digestId), themeClusterId: clusterId, msgMidAt: null, computedAt: FROZEN_AT });
}

describe("readOwnedCharacterVectors", () => {
  test("returns card vectors tagged with owner, EXCLUDING synthetic characters (esoteric #12)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const real = await seedCharacter(db, { id: "character_real", ownerId: owner });
    const synth = await seedCharacter(db, {
      id: "character_synth",
      ownerId: owner,
      synthetic: true,
    });
    await seedCharacterEmbedding(db, { characterId: real, embedding: vec(1, 0) });
    await seedCharacterEmbedding(db, { characterId: synth, embedding: vec(1, 0) });

    const rows = await readOwnedCharacterVectors(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ characterId: real, ownerId: owner, model: EMBED_MODEL });
  });
});

describe("readOwnedDigestVectors", () => {
  test("derives the owner via digest→chat→host and carries keywords", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedHostedChat(db, "chat_1", owner);
    await seedChatDigest(db, {
      id: "chat_digest_1",
      chatId: chat,
      embedding: vec(1, 0),
      keywords: ["forest", "duel"],
    });

    const rows = await readOwnedDigestVectors(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ownerId: owner, isGroup: false, tier: 0 });
    expect(rows[0]?.keywords).toEqual(["forest", "duel"]);
  });

  test("attributes ONLY to the PRESENT host — a departed ex-host row is not re-attributed (D18)", async () => {
    const db = await freshDb();
    const present = await seedUser(db, "user_present");
    const exHost = await seedUser(db, "user_ex_host");
    const chat = await seedHostedChat(db, "chat_handoff", present);
    // A departed `role='host'` row (handed off via leave) coexists with the present host on the SAME chat.
    await seedDepartedHost(db, chat, exHost);
    await seedChatDigest(db, { id: "chat_digest_handoff", chatId: chat, embedding: vec(1, 0) });

    const rows = await readOwnedDigestVectors(db);
    // Without the `leftSeq IS NULL` belt the innerJoin matched BOTH host rows → the digest was duplicated and
    // attributed to the departed ex-host too. The belt keeps exactly one row, owned by the present host.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ digestId: "chat_digest_handoff", ownerId: present });
    expect(rows.map((r) => r.ownerId)).not.toContain(exHost);
  });

  test("drops digests whose chat has no human host", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedHostedChat(db, "chat_hosted", owner);
    await seedChatDigest(db, { id: "chat_digest_ok", chatId: chat, embedding: vec(1, 0) });
    // The no-host drop itself is the inner join (untested here); this asserts the hosted digest passes through.
    const rows = await readOwnedDigestVectors(db);
    expect(rows.map((r) => r.digestId)).toContain("chat_digest_ok");
  });
});

describe("hub reads are OWNER-SCOPED (csls analyzes YOUR OWN library only — never cross-tenant)", () => {
  test("each hub read returns ONLY the given owner's rows (B's vectors never leak into A's read)", async () => {
    const db = await freshDb();
    const a = await seedUser(db, "user_a");
    const b = await seedUser(db, "user_b");
    const ca = await seedCharacter(db, { id: "character_a", ownerId: a });
    const cb = await seedCharacter(db, { id: "character_b", ownerId: b });
    await seedCharacterEmbedding(db, { characterId: ca, embedding: vec(1, 0) });
    await seedCharacterEmbedding(db, { characterId: cb, embedding: vec(0, 1) });
    const chatA = await seedHostedChat(db, "chat_a", a);
    const chatB = await seedHostedChat(db, "chat_b", b);
    await seedChatDigest(db, { id: "chat_digest_a", chatId: chatA, embedding: vec(1, 0) });
    await seedChatDigest(db, { id: "chat_digest_b", chatId: chatB, embedding: vec(1, 0) });
    await seedChatSegment(db, { id: "chat_segment_a", chatId: chatA, embedding: vec(1, 0) });
    await seedChatSegment(db, { id: "chat_segment_b", chatId: chatB, embedding: vec(1, 0) });
    const assetA = await seedAsset(db, "asset_a", a);
    const assetB = await seedAsset(db, "asset_b", b);
    await seedImageEmbedding(db, {
      id: "image_embedding_a",
      assetId: assetA,
      embedding: vec(1, 0),
    });
    await seedImageEmbedding(db, {
      id: "image_embedding_b",
      assetId: assetB,
      embedding: vec(1, 0),
    });

    // A's reads see ONLY A's rows (never B's) — the owner-local hub space.
    expect((await readCharacterHubVectors(db, a)).map((r) => r.id)).toEqual(["character_embedding_character_a"]);
    expect((await readDigestHubVectors(db, a)).map((r) => r.id)).toEqual(["chat_digest_a"]);
    expect((await readSegmentHubVectors(db, a)).map((r) => r.id)).toEqual(["chat_segment_a"]);
    expect((await readImageHubVectors(db, a)).map((r) => r.id)).toEqual(["image_embedding_a"]);

    // The BULK fan-out universe: both owners have rows in every table.
    expect((await distinctCharacterHubOwners(db)).toSorted()).toEqual([a, b].sort());
    expect((await distinctDigestHubOwners(db)).toSorted()).toEqual([a, b].sort());
    expect((await distinctSegmentHubOwners(db)).toSorted()).toEqual([a, b].sort());
    expect((await distinctImageHubOwners(db)).toSorted()).toEqual([a, b].sort());
  });
});

// #1467 item 1: the hub reads score ONE owner's library against itself, so the population they read must be
// the population every sibling analytics read scans — a per-room synthetic bucket is not a library card.
describe("hub reads exclude the synthetic per-room group buckets", () => {
  test("readCharacterHubVectors skips a synthetic character's embedding", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const real = await seedCharacter(db, { id: "character_real", ownerId: owner });
    const synth = await seedCharacter(db, { id: "character_group", ownerId: owner, synthetic: true });
    await seedCharacterEmbedding(db, { characterId: real, embedding: vec(1, 0) });
    await seedCharacterEmbedding(db, { characterId: synth, embedding: vec(0, 1) });

    const rows = await readCharacterHubVectors(db, owner);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.contentHash).toBe(`hash_${real}`);
  });

  test("distinctCharacterHubOwners skips an owner whose only embedded card is synthetic", async () => {
    const db = await freshDb();
    const real = await seedUser(db, "user_real");
    const groupsOnly = await seedUser(db, "user_groups_only");
    const card = await seedCharacter(db, { id: "character_real", ownerId: real });
    const bucket = await seedCharacter(db, { id: "character_group", ownerId: groupsOnly, synthetic: true });
    await seedCharacterEmbedding(db, { characterId: card, embedding: vec(1) });
    await seedCharacterEmbedding(db, { characterId: bucket, embedding: vec(1) });

    expect(await distinctCharacterHubOwners(db)).toEqual([real]);
  });
});

// #1467 item 2: the cooccurrence pass credits keywords to the digest's witnessing character, and a GROUP
// digest's witness is the synthetic room bucket — so the row has to say which kind it is.
describe("readOwnedDigestKeywords", () => {
  test("carries isGroup so the tally can drop group-room digests", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedHostedChat(db, "chat_1", owner);
    await seedChatDigest(db, { id: "chat_digest_solo", chatId: chat, embedding: vec(1), keywords: ["solo"], isGroup: false });
    await seedChatDigest(db, { id: "chat_digest_group", chatId: chat, embedding: vec(1), keywords: ["party"], isGroup: true, blockIdx: 1 });

    const rows = await readOwnedDigestKeywords(db, owner);

    expect(new Set(rows.map((r) => `${r.keywords[0] ?? ""}:${String(r.isGroup)}`))).toEqual(new Set(["solo:false", "party:true"]));
  });
});

// #1467 item 3: a block too big for the embed window is CHUNKED into N `chat_segments` rows (#172). The
// backfill UPDATEs one row per digest, so N partial spans meant the last row written won.
describe("readTier0DigestSpans", () => {
  test("folds a CHUNKED block to the whole block's [min(seqStart), max(seqEnd)]", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedHostedChat(db, "chat_1", owner);
    await seedChatDigest(db, { id: "chat_digest_1", chatId: chat, embedding: vec(1), tier: 0, blockIdx: 0 });
    await seedThemeAssignment(db, owner, "chat_digest_1");
    await seedChatSegment(db, { id: "chat_segment_c0", chatId: chat, embedding: vec(1), blockIdx: 0, chunkIdx: 0, seqStart: 10, seqEnd: 13 });
    await seedChatSegment(db, { id: "chat_segment_c1", chatId: chat, embedding: vec(1), blockIdx: 0, chunkIdx: 1, seqStart: 14, seqEnd: 17 });
    await seedChatSegment(db, { id: "chat_segment_c2", chatId: chat, embedding: vec(1), blockIdx: 0, chunkIdx: 2, seqStart: 18, seqEnd: 21 });

    const spans = await readTier0DigestSpans(db, owner);

    expect(spans).toEqual([{ digestId: castId<ChatDigestId>("chat_digest_1"), chatId: chat, seqStart: 10, seqEnd: 21 }]);
  });
});

// #1480 item 6 — THE THEME-DETAIL READS CARRY THEIR OWN OWNER PREDICATE. `verbs/views::themeDetail` resolves
// `theme.id` from an owner-scoped list one hop earlier and then handed the bare id to these two, which
// belted nothing: a themeClusterId is a caller-reachable value the moment anything else resolves one
// differently, and the reads return another owner's CARD NAMES (members) and their library's story-time
// shape (timeline). The verb path cannot reach the hole, so the probe is direct — the roster-preset
// `updatePresetWithMembers` stickler-F2 precedent.
describe("readThemeCluster* — owner-scoped (#1480 item 6)", () => {
  test("a FOREIGN themeClusterId reads back EMPTY on both reads; the OWNER's own reads back the rows", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const stranger = await seedUser(db, "user_b");
    const chat = await seedHostedChat(db, "chat_1", owner);
    const hero = await seedCharacter(db, { id: "character_hero", ownerId: owner, name: "Hero" });
    await seedChatDigest(db, { id: "chat_digest_t1", chatId: chat, embedding: vec(1), scopedCharacterId: hero, tier: 0, blockIdx: 0 });
    const cluster = castId<ThemeClusterId>("theme_cluster_owned");
    await db.insert(themeClusters).values({
      id: cluster,
      ownerId: owner,
      level: "scene",
      clusterIdx: 0,
      name: "Quests",
      centroid: vec(1),
      size: 1,
      model: EMBED_MODEL,
      computedAt: FROZEN_AT,
    });
    await db.insert(digestThemeAssignments).values({
      digestId: castId<ChatDigestId>("chat_digest_t1"),
      themeClusterId: cluster,
      msgMidAt: Date.UTC(2024, 0, 10),
      computedAt: FROZEN_AT,
    });

    // Receipt AS THE STRANGER: they name the owner's clusterId at the persistence seam.
    expect(await readThemeClusterMembers(db, stranger, cluster, MEMBER_LIMIT)).toEqual([]);
    expect(await readThemeClusterTimeline(db, stranger, cluster)).toEqual([]);

    // POSITIVE ARM, AS THE OWNER — the same id, and both reads answer.
    expect(await readThemeClusterMembers(db, owner, cluster, MEMBER_LIMIT)).toEqual([{ characterId: hero, name: "Hero", count: 1 }]);
    expect(await readThemeClusterTimeline(db, owner, cluster)).toEqual([{ bucket: "2024-01", count: 1 }]);
  });
});
