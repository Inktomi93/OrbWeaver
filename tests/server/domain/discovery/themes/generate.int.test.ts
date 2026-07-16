// Integration: the emergent-theme pass — clustering, full-coverage assignment, LLM naming via the injected
// summarize, owner derivation via host, solo-only filtering (esoteric #13), and the content-collapse +
// full-space-size invariant (esoteric #3).

import { digestThemeAssignments, themeClusters } from "@orb/db";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeDiscoveryHarness, makeSummarizeRecorder, seedChatDigest, seedHostedChat, seedUser, vec } from "../_support.ts";

describe("computeThemes", () => {
  test("clusters solo digests, assigns every digest (full coverage), and names via summarize", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedHostedChat(db, "chat_1", owner);
    // Two clusters: {vec(1,0)×2} and {vec(0,1)×2}, all tier-0 (scene), distinct blockIdx + content hashes.
    await seedChatDigest(db, {
      id: "d1",
      chatId: chat,
      embedding: vec(1, 0),
      blockIdx: 0,
      keywords: ["love"],
    });
    await seedChatDigest(db, {
      id: "d2",
      chatId: chat,
      embedding: vec(1, 0.02),
      blockIdx: 1,
      keywords: ["love"],
    });
    await seedChatDigest(db, {
      id: "d3",
      chatId: chat,
      embedding: vec(0, 1),
      blockIdx: 2,
      keywords: ["war"],
    });
    await seedChatDigest(db, {
      id: "d4",
      chatId: chat,
      embedding: vec(0.02, 1),
      blockIdx: 3,
      keywords: ["war"],
    });

    const summarize = makeSummarizeRecorder(["Romance", "Warfare"]);
    const svc = createDiscoveryService(makeDiscoveryHarness(db, { summarize }).ctx);
    const stats = await svc.computeThemes({ k: 2 });

    expect(stats).toMatchObject({ ownersProcessed: 1, clustersWritten: 2, digestsAssigned: 4 });
    const clusters = await db.select().from(themeClusters).where(eq(themeClusters.ownerId, owner));
    expect(clusters).toHaveLength(2);
    expect(clusters.every((c) => c.level === "scene")).toBe(true);
    expect(clusters.every((c) => c.size === 2)).toBe(true);
    expect(clusters.every((c) => c.name !== null)).toBe(true); // size ≥ MIN_NAME_SIZE ⇒ named
    expect(summarize.calls).toHaveLength(1);

    const assigns = await db.select().from(digestThemeAssignments);
    expect(assigns).toHaveLength(4);
    // The post-replace backfill left these null: the seeded digests have no verbatim segment rows, so no
    // seq-span resolves (the stamp itself is pinned by backfill.int.test.ts).
    expect(assigns.every((a) => a.msgMidAt === null)).toBe(true);
  });

  test("excludes group-room digests from solo clustering (esoteric #13)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedHostedChat(db, "chat_1", owner);
    await seedChatDigest(db, {
      id: "d1",
      chatId: chat,
      embedding: vec(1, 0),
      blockIdx: 0,
      isGroup: true,
    });
    await seedChatDigest(db, {
      id: "d2",
      chatId: chat,
      embedding: vec(1, 0),
      blockIdx: 1,
      isGroup: true,
    });

    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    const stats = await svc.computeThemes({ k: 1 });
    expect(stats.clustersWritten).toBe(0);
  });

  test("content-collapse: identical-hash digests cluster as one rep but size + assignment count ALL (esoteric #3)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedHostedChat(db, "chat_1", owner);
    // Three digests, two byte-identical (same contentHash) — collapse to one rep for the centroid.
    await seedChatDigest(db, {
      id: "d1",
      chatId: chat,
      embedding: vec(1, 0),
      blockIdx: 0,
      contentHash: "same",
    });
    await seedChatDigest(db, {
      id: "d2",
      chatId: chat,
      embedding: vec(1, 0),
      blockIdx: 1,
      contentHash: "same",
    });
    await seedChatDigest(db, {
      id: "d3",
      chatId: chat,
      embedding: vec(1, 0),
      blockIdx: 2,
      contentHash: "other",
    });

    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    const stats = await svc.computeThemes({ k: 1 });
    expect(stats.clustersWritten).toBe(1);
    expect(stats.digestsAssigned).toBe(3); // full coverage — every digest assigned
    const clusters = await db.select().from(themeClusters).where(eq(themeClusters.ownerId, owner));
    expect(clusters[0]?.size).toBe(3); // FULL-space member count, not the collapsed rep count
  });

  test("a recompute is an atomic replace (no stale clusters)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedHostedChat(db, "chat_1", owner);
    await seedChatDigest(db, { id: "d1", chatId: chat, embedding: vec(1, 0), blockIdx: 0 });
    await seedChatDigest(db, { id: "d2", chatId: chat, embedding: vec(1, 0), blockIdx: 1 });
    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    await svc.computeThemes({ k: 1 });
    await svc.computeThemes({ k: 1 });
    const clusters = await db.select().from(themeClusters);
    expect(clusters).toHaveLength(1); // not doubled
  });

  // The SINGULAR-mode security invariant: a per-owner recompute reads + REPLACES only that owner's clusters —
  // it must NEVER wipe another owner's themes (the delete is scoped by `themeClusters.ownerId`).
  test("a SINGULAR (owner-scoped) recompute leaves ANOTHER owner's clusters untouched", async () => {
    const db = await freshDb();
    const a = await seedUser(db, "user_a");
    const b = await seedUser(db, "user_b");
    const chatA = await seedHostedChat(db, "chat_a", a);
    const chatB = await seedHostedChat(db, "chat_b", b);
    await seedChatDigest(db, { id: "da1", chatId: chatA, embedding: vec(1, 0), blockIdx: 0 });
    await seedChatDigest(db, { id: "da2", chatId: chatA, embedding: vec(1, 0), blockIdx: 1 });
    await seedChatDigest(db, { id: "db1", chatId: chatB, embedding: vec(0, 1), blockIdx: 0 });
    await seedChatDigest(db, { id: "db2", chatId: chatB, embedding: vec(0, 1), blockIdx: 1 });
    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);

    // Seed both owners' clusters via a global (bulk) recompute first.
    await svc.computeThemes({ k: 1 });
    expect(await db.select().from(themeClusters).where(eq(themeClusters.ownerId, b))).toHaveLength(1);

    // Now recompute ONLY owner A (singular) — B's clusters must survive untouched.
    const stats = await svc.computeThemes({ k: 1, ownerId: a });
    expect(stats.ownersProcessed).toBe(1);
    expect(await db.select().from(themeClusters).where(eq(themeClusters.ownerId, a))).toHaveLength(1);
    expect(await db.select().from(themeClusters).where(eq(themeClusters.ownerId, b))).toHaveLength(1); // NOT wiped by A's singular run
  });
});
