// Integration: PD-39 msgMidAt backfill — stamps `digest_theme_assignments.msgMidAt` with the position-median
// message createdAt of a tier-0 digest's seq-span. Proofs: exact median for tier-0 (via the segment span),
// idempotent, tier-k assignments left null (no 1:1 segment), owner-scoped.

import type { Db } from "@orb/db";
import { digestThemeAssignments, themeClusters } from "@orb/db";
import type { ChatId, ThemeClusterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { backfillMsgMidAt } from "../../../../../packages/server/src/domain/discovery/themes/backfill.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import {
  FROZEN_AT,
  makeDiscoveryHarness,
  seedChatDigest,
  seedChatSegment,
  seedHostedChat,
  seedMessage,
  seedUser,
  vec,
} from "../_support.ts";

// Seed a theme cluster + assign a digest to it (msgMidAt starts null) — the row the backfill stamps.
async function seedAssignedCluster(
  db: Db,
  args: { clusterId: string; ownerId: UserId; digestId: string; level?: string },
): Promise<void> {
  const id = castId<ThemeClusterId>(args.clusterId);
  await db.insert(themeClusters).values({
    id,
    ownerId: args.ownerId,
    level: args.level ?? "scene",
    clusterIdx: 0,
    name: "Adventures",
    centroid: vec(1),
    size: 1,
    model: "test-embed-model-1024",
    computedAt: FROZEN_AT,
  });
  await db.insert(digestThemeAssignments).values({
    digestId: castId(args.digestId),
    themeClusterId: id,
    msgMidAt: null,
    computedAt: FROZEN_AT,
  });
}

// A tier-0 digest + its verbatim segment (same chatId/blockIdx) covering seq [seqStart, seqEnd].
async function seedTier0Digest(
  db: Db,
  args: { id: string; chatId: ChatId; blockIdx: number; seqStart: number; seqEnd: number },
): Promise<void> {
  await seedChatDigest(db, {
    id: args.id,
    chatId: args.chatId,
    embedding: vec(1),
    tier: 0,
    blockIdx: args.blockIdx,
    contentHash: `h_${args.id}`,
  });
  await seedChatSegment(db, {
    id: `segment_${args.id}`,
    chatId: args.chatId,
    embedding: vec(1),
    blockIdx: args.blockIdx,
    seqStart: args.seqStart,
    seqEnd: args.seqEnd,
    contentHash: `seg_${args.id}`,
  });
}

async function msgMidAtOf(db: Db, digestId: string): Promise<number | null> {
  const rows = await db
    .select({ msgMidAt: digestThemeAssignments.msgMidAt })
    .from(digestThemeAssignments)
    .where(eq(digestThemeAssignments.digestId, castId(digestId)));
  return rows[0]?.msgMidAt ?? null;
}

// biome-ignore lint/security/noSecrets: the verb name under test, not a secret (high-entropy false positive).
describe("backfillMsgMidAt", () => {
  test("stamps the position-median message createdAt of the digest's seq-span", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedHostedChat(db, "chat_1", owner);
    await seedTier0Digest(db, {
      id: "digest_1",
      chatId: chat,
      blockIdx: 0,
      seqStart: 0,
      seqEnd: 4,
    });
    await seedAssignedCluster(db, { clusterId: "cluster_1", ownerId: owner, digestId: "digest_1" });
    // 5 messages seq 0..4 with ascending createdAt; the position-median (index 2) is seq 2 @ 2000.
    await seedMessage(db, { id: "m0", chatId: chat, seq: 0, createdAt: 1000 });
    await seedMessage(db, { id: "m1", chatId: chat, seq: 1, createdAt: 1500 });
    await seedMessage(db, { id: "m2", chatId: chat, seq: 2, createdAt: 2000 });
    await seedMessage(db, { id: "m3", chatId: chat, seq: 3, createdAt: 2500 });
    await seedMessage(db, { id: "m4", chatId: chat, seq: 4, createdAt: 3000 });

    const stats = await backfillMsgMidAt(db);
    expect(stats.stamped).toBe(1);
    expect(await msgMidAtOf(db, "digest_1")).toBe(2000);

    // Idempotent — a re-run yields the same stamp.
    await backfillMsgMidAt(db);
    expect(await msgMidAtOf(db, "digest_1")).toBe(2000);
  });

  test("leaves a tier-k (arc) assignment null (no 1:1 verbatim segment)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedHostedChat(db, "chat_1", owner);
    // A tier-1 digest with NO matching segment at its blockIdx.
    await seedChatDigest(db, {
      id: "arc_1",
      chatId: chat,
      embedding: vec(1),
      tier: 1,
      blockIdx: 0,
      contentHash: "h_arc",
    });
    await seedAssignedCluster(db, {
      clusterId: "cluster_arc",
      ownerId: owner,
      digestId: "arc_1",
      level: "arc",
    });
    await seedMessage(db, { id: "m0", chatId: chat, seq: 0, createdAt: 1000 });

    const stats = await backfillMsgMidAt(db);
    expect(stats.stamped).toBe(0);
    expect(await msgMidAtOf(db, "arc_1")).toBeNull();
  });

  test("the service verb backfillDigestStoryTime drives the same stamp", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedHostedChat(db, "chat_1", owner);
    await seedTier0Digest(db, {
      id: "digest_1",
      chatId: chat,
      blockIdx: 0,
      seqStart: 0,
      seqEnd: 2,
    });
    await seedAssignedCluster(db, { clusterId: "cluster_1", ownerId: owner, digestId: "digest_1" });
    await seedMessage(db, { id: "m0", chatId: chat, seq: 0, createdAt: 1000 });
    await seedMessage(db, { id: "m1", chatId: chat, seq: 1, createdAt: 2000 });
    await seedMessage(db, { id: "m2", chatId: chat, seq: 2, createdAt: 3000 });

    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    const stats = await svc.backfillDigestStoryTime();
    expect(stats.stamped).toBe(1);
    expect(await msgMidAtOf(db, "digest_1")).toBe(2000);
  });

  test("owner scope stamps only the target owner's assignments", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    const chatA = await seedHostedChat(db, "chat_a", owner);
    const chatB = await seedHostedChat(db, "chat_b", other);
    await seedTier0Digest(db, { id: "d_a", chatId: chatA, blockIdx: 0, seqStart: 0, seqEnd: 2 });
    await seedTier0Digest(db, { id: "d_b", chatId: chatB, blockIdx: 0, seqStart: 0, seqEnd: 2 });
    await seedAssignedCluster(db, { clusterId: "c_a", ownerId: owner, digestId: "d_a" });
    await seedAssignedCluster(db, { clusterId: "c_b", ownerId: other, digestId: "d_b" });
    await seedMessage(db, { id: "ma", chatId: chatA, seq: 0, createdAt: 5000 });
    await seedMessage(db, { id: "mb", chatId: chatB, seq: 0, createdAt: 9000 });

    await backfillMsgMidAt(db, owner);
    expect(await msgMidAtOf(db, "d_a")).toBe(5000);
    expect(await msgMidAtOf(db, "d_b")).toBeNull(); // other owner untouched
  });
});
