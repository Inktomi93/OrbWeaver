// Verb test: stats.reconcile — the caller-scoped, awaited rebuild-from-canon (the direct twin of the
// `reconcile-stats` workload's singular arm). The rebuild MATH is pinned at persistence/rebuild-from-canon's
// mirror; what matters HERE is the SCOPE: the verb rebuilds exactly the caller's rollups and touches no
// other owner's — the router passes `principal.userId`, so this is the whole authorization surface. Second:
// the SINGLE-FLIGHT wiring (owner ruling 2026-08-02) — a caller with a rebuild in flight is refused, per
// owner. The gate's own mechanics (deferred hold, release-on-throw) are pinned at `../reconcile-in-flight`.

import type { Db } from "@orb/db";
import { messageVariants, ownerStats } from "@orb/db";
import { DomainConflictError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { createStatsService } from "../../../../../packages/server/src/domain/stats/service.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedCharacter, seedChat, seedMessage, seedPersona, seedUser, T0 } from "../_support.ts";

/** A fixed instant for the service's injected clock — the rebuild stamps `computedAt` with it. */
const STATS_NOW = 1_700_000_777_000;

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

/** One owner with one assistant turn of real canon — enough for a rollup row to exist after a rebuild. */
async function seedOwnerWithCanon(id: string, role: "owner" | "user", words: string): Promise<UserId> {
  const ownerId = await seedUser(db, id, role);
  const characterId = await seedCharacter(db, ownerId, { id: `character_${id}`, name: `Aria ${id}` });
  const personaId = await seedPersona(db, ownerId, { id: `persona_${id}` });
  const chatId = await seedChat(db, characterId, { id: `chat_${id}`, createdAt: T0, updatedAt: T0 });
  await seedMessage(db, { chatId, seq: 1, role: "user", personaId, createdAt: T0, variants: [{ content: words }] });
  return ownerId;
}

describe("stats.reconcile", () => {
  test("accounting provenance survives canon rebuild, including recorded zero and removal of accounting", async () => {
    const ownerId = await seedUser(db);
    const measured = await seedCharacter(db, ownerId, { id: "character_measured_zero" });
    const estimated = await seedCharacter(db, ownerId, { id: "character_estimated" });
    const unrecorded = await seedCharacter(db, ownerId, { id: "character_unrecorded" });
    const measuredChat = await seedChat(db, measured, { id: "chat_measured_zero" });
    const estimatedChat = await seedChat(db, estimated, { id: "chat_estimated" });
    const unrecordedChat = await seedChat(db, unrecorded, { id: "chat_unrecorded" });
    const measuredMessage = await seedMessage(db, {
      chatId: measuredChat,
      characterId: measured,
      seq: 1,
      role: "assistant",
      variants: [{ content: "Recorded reply", model: "model-zero", tokensIn: 0, tokensOut: 0, costUsd: 0, tokenProvenance: "measured" }],
    });
    await seedMessage(db, {
      chatId: estimatedChat,
      characterId: estimated,
      seq: 1,
      role: "assistant",
      variants: [{ content: "Estimated reply", model: "model-estimated", tokensIn: 20, tokensOut: 30, tokenProvenance: "estimated" }],
    });
    await seedMessage(db, {
      chatId: unrecordedChat,
      characterId: unrecorded,
      seq: 1,
      role: "assistant",
      variants: [{ content: "Imported reply", model: "model-imported" }],
    });
    const svc = createStatsService(db, () => STATS_NOW);
    await svc.reconcile(ownerId);
    expect(await svc.character(ownerId, measured)).toMatchObject({
      assistantTurns: 1,
      tokensIn: 0,
      tokensOut: 0,
      tokensInProvenance: "measured",
      tokensOutProvenance: "measured",
      costUsd: 0,
    });
    expect(await svc.character(ownerId, estimated)).toMatchObject({
      assistantTurns: 1,
      tokensIn: 20,
      tokensOut: 30,
      tokensInProvenance: "estimated",
      tokensOutProvenance: "estimated",
      costUsd: null,
    });
    expect(await svc.character(ownerId, unrecorded)).toMatchObject({
      assistantTurns: 1,
      tokensIn: null,
      tokensOut: null,
      tokensInProvenance: "unrecorded",
      tokensOutProvenance: "unrecorded",
      costUsd: null,
    });
    expect(await svc.overview(ownerId)).toMatchObject({
      assistantTurns: 3,
      tokensIn: 20,
      tokensOut: 30,
      tokensInProvenance: "estimated",
      tokensOutProvenance: "estimated",
      costUsd: 0,
    });
    await db
      .update(messageVariants)
      .set({ tokensIn: null, tokensOut: null, tokenProvenance: "unrecorded", costUsd: null })
      .where(eq(messageVariants.messageId, measuredMessage));
    await svc.reconcile(ownerId);
    expect(await svc.character(ownerId, measured)).toMatchObject({
      assistantTurns: 1,
      tokensIn: null,
      tokensOut: null,
      tokensInProvenance: "unrecorded",
      tokensOutProvenance: "unrecorded",
      costUsd: null,
    });
    expect(await svc.overview(ownerId)).toMatchObject({ assistantTurns: 3, tokensIn: 20, tokensOut: 30, costUsd: null });
  });
  test("rebuilds the CALLER's rollups from canon and stamps computedAt from the injected clock", async () => {
    const ownerId = await seedOwnerWithCanon("user_owner", "owner", "hello world");
    const svc = createStatsService(db, () => STATS_NOW);

    // No rollup exists until something computes one (the live write path never ran here).
    expect(await svc.freshness(ownerId)).toEqual({ computedAt: null, stale: false, hasData: false });

    const result = await svc.reconcile(ownerId);

    expect(result.owners).toBe(1);
    expect(result.computedAt).toBe(STATS_NOW);
    expect(await svc.freshness(ownerId)).toEqual({ computedAt: STATS_NOW, stale: false, hasData: true });
  });

  test("touches NO other owner's rollups — the scope is the caller, not the deployment", async () => {
    const alice = await seedOwnerWithCanon("user_alice", "owner", "alice speaks here");
    const bob = await seedOwnerWithCanon("user_bob", "user", "bob speaks here");
    const svc = createStatsService(db, () => STATS_NOW);

    await svc.reconcile(alice);

    const rows = await db.select({ ownerId: ownerStats.ownerId }).from(ownerStats);
    expect(rows.map((row) => row.ownerId)).toEqual([alice]);
    // Bob's dashboard is untouched — the bulk all-owners pass is the WORKLOAD, never this verb.
    expect(await svc.freshness(bob)).toEqual({ computedAt: null, stale: false, hasData: false });
    expect(await db.select().from(ownerStats).where(eq(ownerStats.ownerId, bob))).toEqual([]);
  });

  test("refuses a CONCURRENT second recompute for the same caller, and allows one after it settles", async () => {
    const ownerId = await seedOwnerWithCanon("user_owner", "owner", "hello world twice over");
    const svc = createStatsService(db, () => STATS_NOW);

    // Both calls are made in the SAME tick — the first is still awaiting its rebuild when the second enters,
    // which is exactly the raced double-click / second-tab case the single-flight gate exists for.
    const [first, second] = await Promise.allSettled([svc.reconcile(ownerId), svc.reconcile(ownerId)]);

    expect(first.status).toBe("fulfilled");
    expect(second.status).toBe("rejected");
    expect(second.status === "rejected" ? second.reason : null).toBeInstanceOf(DomainConflictError);
    expect(second.status === "rejected" ? String(second.reason) : "").toContain("a recompute is already running");

    // The slot released when the first settled — the user is not locked out of ever recomputing again.
    expect(await svc.reconcile(ownerId)).toEqual(first.status === "fulfilled" ? first.value : null);
  });

  test("one caller's in-flight recompute does not refuse ANOTHER caller's", async () => {
    const alice = await seedOwnerWithCanon("user_alice", "owner", "alice speaks here");
    const bob = await seedOwnerWithCanon("user_bob", "user", "bob speaks here");
    const svc = createStatsService(db, () => STATS_NOW);

    const [first, second] = await Promise.allSettled([svc.reconcile(alice), svc.reconcile(bob)]);

    expect(first.status).toBe("fulfilled");
    expect(second.status).toBe("fulfilled");
    expect(await svc.freshness(alice)).toEqual({ computedAt: STATS_NOW, stale: false, hasData: true });
    expect(await svc.freshness(bob)).toEqual({ computedAt: STATS_NOW, stale: false, hasData: true });
  });

  test("is idempotent — a second run replaces, never doubles", async () => {
    const ownerId = await seedOwnerWithCanon("user_owner", "owner", "hello world again");
    const svc = createStatsService(db, () => STATS_NOW);

    const first = await svc.reconcile(ownerId);
    const second = await svc.reconcile(ownerId);

    expect(second).toEqual(first);
    expect(await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId))).toHaveLength(1);
  });
});
