// Integration: the CSLS hub passes — values written THROUGH the injected writeHubScores seam (never a direct
// vector-table write, invariant #2), the hub-vs-outlier ordering, collapse inheritance (esoteric #3), the
// per-(tier,model) digest grouping (esoteric #5), and the segment/image passes.

import { createDiscoveryService } from "@orb/server/domain/discovery";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import type { HubScoreRecorder } from "../_support.ts";
import {
  makeDiscoveryHarness,
  makeHubScoreRecorder,
  seedAsset,
  seedCharacter,
  seedCharacterEmbedding,
  seedChatDigest,
  seedChatSegment,
  seedHostedChat,
  seedImageEmbedding,
  seedUser,
  vec,
} from "../_support.ts";

function hubById(recorder: HubScoreRecorder): Map<string, number> {
  const m = new Map<string, number>();
  for (const call of recorder.calls) {
    for (const u of call.updates) {
      m.set(u.id, u.hubScore);
    }
  }
  return m;
}

describe("computeCharacterHubScores", () => {
  test("writes hubs through the seam; a vector near everything outscores an outlier", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const a = await seedCharacter(db, { id: "character_a", ownerId: owner });
    const b = await seedCharacter(db, { id: "character_b", ownerId: owner });
    const c = await seedCharacter(db, { id: "character_c", ownerId: owner });
    await seedCharacterEmbedding(db, { characterId: a, embedding: vec(1, 0), contentHash: "h1" });
    await seedCharacterEmbedding(db, { characterId: b, embedding: vec(1, 0), contentHash: "h2" });
    await seedCharacterEmbedding(db, { characterId: c, embedding: vec(0, 1), contentHash: "h3" });

    const hubScores = makeHubScoreRecorder();
    const svc = createDiscoveryService(makeDiscoveryHarness(db, { hubScores }).ctx);
    const stats = await svc.computeCharacterHubScores();

    expect(stats).toMatchObject({ rowsScored: 3, groupsProcessed: 1 });
    expect(hubScores.calls[0]?.table).toBe("character_embeddings");
    const byId = hubById(hubScores);
    const aligned = byId.get("character_embedding_character_a") ?? 0;
    const outlier = byId.get("character_embedding_character_c") ?? 1;
    expect(aligned).toBeGreaterThan(outlier);
  });

  test("collapsed identical-hash rows inherit the rep's hub (esoteric #3)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const a = await seedCharacter(db, { id: "character_a", ownerId: owner });
    const b = await seedCharacter(db, { id: "character_b", ownerId: owner });
    const c = await seedCharacter(db, { id: "character_c", ownerId: owner });
    // a & b byte-identical (same hash) → collapse to one rep → identical hub.
    await seedCharacterEmbedding(db, { characterId: a, embedding: vec(1, 0), contentHash: "same" });
    await seedCharacterEmbedding(db, { characterId: b, embedding: vec(1, 0), contentHash: "same" });
    await seedCharacterEmbedding(db, {
      characterId: c,
      embedding: vec(1, 0.05),
      contentHash: "other",
    });

    const hubScores = makeHubScoreRecorder();
    const svc = createDiscoveryService(makeDiscoveryHarness(db, { hubScores }).ctx);
    await svc.computeCharacterHubScores();

    const byId = hubById(hubScores);
    expect(byId.get("character_embedding_character_a")).toBe(byId.get("character_embedding_character_b"));
  });

  // The owner ruling: csls analyzes YOUR OWN library only — owner B's vectors NEVER enter owner A's hubness.
  test("SINGULAR csls scores ONLY the caller's own library (B's vectors never touched)", async () => {
    const db = await freshDb();
    const a = await seedUser(db, "user_a");
    const b = await seedUser(db, "user_b");
    const ca = await seedCharacter(db, { id: "character_a", ownerId: a });
    const cb = await seedCharacter(db, { id: "character_b", ownerId: b });
    // Same space (default model), near-identical vectors — a cross-tenant read would mingle them.
    await seedCharacterEmbedding(db, { characterId: ca, embedding: vec(1, 0), contentHash: "ha" });
    await seedCharacterEmbedding(db, { characterId: cb, embedding: vec(1, 0), contentHash: "hb" });

    const hubScores = makeHubScoreRecorder();
    const svc = createDiscoveryService(makeDiscoveryHarness(db, { hubScores }).ctx);
    const stats = await svc.computeCharacterHubScores({ ownerId: a });

    // Only A's ONE row is scored — B's is never written (B's vectors never entered A's hub space).
    expect(stats.rowsScored).toBe(1);
    const scoredIds = [...hubById(hubScores).keys()];
    expect(scoredIds).toEqual(["character_embedding_character_a"]);
    expect(scoredIds).not.toContain("character_embedding_character_b");
  });

  // BULK csls is a per-owner FAN-OUT — every owner's hubness computed SEPARATELY, never one cross-tenant read.
  test("BULK csls fans out per owner (each owner's library scored in its own pass)", async () => {
    const db = await freshDb();
    const a = await seedUser(db, "user_a");
    const b = await seedUser(db, "user_b");
    const ca = await seedCharacter(db, { id: "character_a", ownerId: a });
    const cb = await seedCharacter(db, { id: "character_b", ownerId: b });
    await seedCharacterEmbedding(db, { characterId: ca, embedding: vec(1, 0), contentHash: "ha" });
    await seedCharacterEmbedding(db, { characterId: cb, embedding: vec(1, 0), contentHash: "hb" });

    const hubScores = makeHubScoreRecorder();
    const svc = createDiscoveryService(makeDiscoveryHarness(db, { hubScores }).ctx);
    const stats = await svc.computeCharacterHubScores(); // no ownerId → fan-out

    // Both owners scored, but in SEPARATE per-owner passes (one writeHubScores call each — never a single
    // cross-tenant read/write).
    expect(stats.rowsScored).toBe(2);
    expect(hubScores.calls).toHaveLength(2);
    const scoredIds = [...hubById(hubScores).keys()].sort();
    expect(scoredIds).toEqual(["character_embedding_character_a", "character_embedding_character_b"]);
  });
});

describe("computeDigestHubScores", () => {
  test("groups per (tier, model) and scores every digest row (esoteric #5)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedHostedChat(db, "chat_1", owner);
    await seedChatDigest(db, {
      id: "d0",
      chatId: chat,
      embedding: vec(1, 0),
      tier: 0,
      blockIdx: 0,
    });
    await seedChatDigest(db, {
      id: "d1",
      chatId: chat,
      embedding: vec(1, 0),
      tier: 0,
      blockIdx: 1,
    });
    await seedChatDigest(db, {
      id: "d2",
      chatId: chat,
      embedding: vec(0, 1),
      tier: 1,
      blockIdx: 2,
    });

    const hubScores = makeHubScoreRecorder();
    const svc = createDiscoveryService(makeDiscoveryHarness(db, { hubScores }).ctx);
    const rows = await svc.computeDigestHubScores();
    expect(rows).toBe(3);
    expect(hubScores.calls[0]?.table).toBe("chat_digests");
  });
});

describe("computeSegmentHubScores / computeImageHubScores", () => {
  test("score their tables through the seam", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedHostedChat(db, "chat_1", owner);
    await seedChatSegment(db, { id: "s0", chatId: chat, embedding: vec(1, 0), blockIdx: 0 });
    await seedChatSegment(db, { id: "s1", chatId: chat, embedding: vec(1, 0), blockIdx: 1 });
    const asset = await seedAsset(db, "asset_1", owner);
    await seedImageEmbedding(db, { id: "image_embedding_1", assetId: asset, embedding: vec(1, 0) });

    const segRec = makeHubScoreRecorder();
    const imgRec = makeHubScoreRecorder();
    const segSvc = createDiscoveryService(makeDiscoveryHarness(db, { hubScores: segRec }).ctx);
    expect(await segSvc.computeSegmentHubScores()).toBe(2);
    expect(segRec.calls[0]?.table).toBe("chat_segments");

    const imgSvc = createDiscoveryService(makeDiscoveryHarness(db, { hubScores: imgRec }).ctx);
    expect(await imgSvc.computeImageHubScores()).toBe(1);
    expect(imgRec.calls[0]?.table).toBe("image_embeddings");
  });
});
