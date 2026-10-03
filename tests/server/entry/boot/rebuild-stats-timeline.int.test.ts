// entry/boot/rebuild-stats-timeline — the boot heal behind the `daily_stats` re-grain, over the REAL migration
// chain: an install upgraded from the day-keyed timeline boots with an empty quarter-hour table, and this step
// rebuilds it from canon before anything reads Insights.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assets, characterStats, createDb, dailyStats, imageryGenerations, modelStats, ownerStats, runMigrations, userConnections } from "@orb/db";
import type { AssetId, DailyStatId, ImageryCallId, ImageryGenerationId, UserConnectionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { statsBucketStart } from "@orb/kit/stats-tally";
import { CALENDAR_BUCKET_MS } from "@orb/kit/time";
import { rebuildStatsTimelineOnBoot } from "@orb/server/entry/boot";
import { eq, sql } from "drizzle-orm";
import { freshDb, SHIPPED_MIGRATIONS, shippedChainThrough } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { testModelId, testProviderId } from "../../../support/inference-identities.ts";
import { seedCharacter, seedCharacterStats, seedChat, seedMessage, seedModelStats, seedOwnerStats, seedUser, T0 } from "../../domain/stats/_support.ts";

const PRE_REGRAIN_TAG = "0004_character-import-text-hash";
const BOOT_NOW = (): number => T0 + 60_000;
const IMAGE_COST = 0.25;

test("an upgraded install's dropped timeline is rebuilt from canon at boot, once", async () => {
  const dir = mkdtempSync(join(tmpdir(), "orb-stats-timeline-boot-"));
  try {
    const db = await createDb(":memory:");
    await runMigrations(db, shippedChainThrough(dir, PRE_REGRAIN_TAG));
    const ownerId = await seedUser(db);
    const characterId = await seedCharacter(db, ownerId);
    const chatId = await seedChat(db, characterId);
    // Two turns a quarter-hour apart: the rebuilt timeline must keep them in separate buckets.
    await seedMessage(db, { chatId, seq: 1, role: "user", createdAt: T0, variants: [{ content: "hi" }] });
    await seedMessage(db, { chatId, seq: 2, role: "assistant", characterId, createdAt: T0 + CALENDAR_BUCKET_MS, variants: [{ content: "hello" }] });
    // The pre-upgrade rollups: an owner row with activity and its day-keyed timeline row. Its spend includes
    // imagery and compaction, which no canon row records, so a canon rebuild would erase it.
    await seedOwnerStats(db, ownerId, { chats: 1, userTurns: 1, assistantTurns: 1, costUsd: 2.5, costSamples: 3 });
    await seedModelStats(db, ownerId, { model: "image-model", provider: "openrouter", generations: 2, costUsd: 0.8, costSamples: 2 });
    await seedCharacterStats(db, characterId, { assistantTurns: 1, chats: 1 });
    await db.run(sql`INSERT INTO daily_stats (id, owner_id, day, user_turns, assistant_turns, computed_at)
      VALUES ('daily_stat_pre_regrain', ${ownerId}, '2026-06-26', 1, 1, ${T0})`);

    await runMigrations(db, SHIPPED_MIGRATIONS);
    expect(await db.select().from(dailyStats)).toEqual([]);
    const untouched = async (): Promise<unknown> => ({
      owner: await db.select().from(ownerStats),
      models: await db.select().from(modelStats),
      characters: await db.select().from(characterStats),
    });
    const before = await untouched();

    expect(await rebuildStatsTimelineOnBoot({ db, now: BOOT_NOW })).toBe(1);
    const rows = await db.select().from(dailyStats).where(eq(dailyStats.ownerId, ownerId)).orderBy(dailyStats.bucketStart);
    expect(rows.map((r) => [r.bucketStart, r.userTurns, r.assistantTurns])).toEqual([
      [statsBucketStart(T0), 1, 0],
      [statsBucketStart(T0 + CALENDAR_BUCKET_MS), 0, 1],
    ]);
    expect(rows.reduce((sum, r) => sum + r.chatsCreated, 0)).toBe(1);
    // Only the timeline was rebuilt: the owner, model and character rollups are byte-identical.
    expect(await untouched()).toEqual(before);

    // The predicate, not a marker, is what makes it idempotent: a rebuilt owner has a timeline.
    expect(await rebuildStatsTimelineOnBoot({ db, now: BOOT_NOW })).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rebuilds the timeline of an owner whose only activity is image spend", async () => {
  // No chat, no turn: the owner's rollups hold one priced image generation and nothing else.
  const db = await freshDb();
  const ownerId = await seedUser(db);
  await seedOwnerStats(db, ownerId, { costUsd: IMAGE_COST });
  await seedModelStats(db, ownerId, { model: "image-model", provider: "openrouter", generations: 1, genSamples: 1, costUsd: IMAGE_COST });
  const connectionId = castId<UserConnectionId>("user_connection_image");
  await db
    .insert(userConnections)
    .values({ id: connectionId, ownerId, label: "image", providerId: testProviderId("openrouter"), model: testModelId("image-model") });
  const assetId = castId<AssetId>("asset_image");
  await db.insert(assets).values({ id: assetId, ownerId, kind: "generated", mime: "image/png", size: 8, hash: "image-hash" });
  await db.insert(imageryGenerations).values({
    id: castId<ImageryGenerationId>("imagery_generation_only"),
    callId: castId<ImageryCallId>("imagery_call_only"),
    assetId,
    chatId: null,
    mode: "free",
    prompt: "a lighthouse",
    model: testModelId("image-model"),
    provider: testProviderId("openrouter"),
    connectionId,
    costUsd: IMAGE_COST,
    createdAt: T0,
  });

  expect(await rebuildStatsTimelineOnBoot({ db, now: BOOT_NOW })).toBe(1);
  expect((await db.select().from(dailyStats)).map((r) => [r.bucketStart, r.costUsd])).toEqual([[statsBucketStart(T0), IMAGE_COST]]);
});

test("leaves an owner with no recorded activity, and an owner whose timeline is intact, untouched", async () => {
  const db = await freshDb();
  const idle = await seedUser(db);
  await seedOwnerStats(db, idle);
  const active = await seedUser(db, "user_active", "user");
  await seedOwnerStats(db, active, { userTurns: 1 });
  await db
    .insert(dailyStats)
    .values({ id: castId<DailyStatId>("daily_stat_intact"), ownerId: active, bucketStart: statsBucketStart(T0), userTurns: 1, computedAt: T0 });

  expect(await rebuildStatsTimelineOnBoot({ db, now: BOOT_NOW })).toBe(0);
  expect((await db.select().from(dailyStats)).map((r) => r.id)).toEqual(["daily_stat_intact"]);
});
