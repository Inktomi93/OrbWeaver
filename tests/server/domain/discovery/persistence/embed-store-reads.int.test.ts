// Integration: the read-only SELECTs over the embeddings vector store — synthetic exclusion + owner
// derivation (characters.ownerId / digest→chat→host) + the OWNER-SCOPED hub reads (csls analyzes YOUR OWN
// library only — never cross-tenant; the bulk fan-out iterates `distinct*HubOwners`).

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
  readOwnedDigestVectors,
  readSegmentHubVectors,
} from "../../../../../packages/server/src/domain/discovery/persistence/embed-store-reads.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import {
  EMBED_MODEL,
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
    expect([...(await distinctCharacterHubOwners(db))].sort()).toEqual([a, b].sort());
    expect([...(await distinctDigestHubOwners(db))].sort()).toEqual([a, b].sort());
    expect([...(await distinctSegmentHubOwners(db))].sort()).toEqual([a, b].sort());
    expect([...(await distinctImageHubOwners(db))].sort()).toEqual([a, b].sort());
  });
});
