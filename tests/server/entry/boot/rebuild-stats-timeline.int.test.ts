// entry/boot/rebuild-stats-timeline — the boot heal behind the `daily_stats` re-grain, over the REAL migration
// chain: an install upgraded from the day-keyed timeline boots with an empty quarter-hour table, and this step
// rebuilds it from canon before anything reads Insights.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb, dailyStats, runMigrations } from "@orb/db";
import type { DailyStatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { STATS_BUCKET_MS, statsBucketStart } from "@orb/kit/stats-tally";
import { rebuildStatsTimelineOnBoot } from "@orb/server/entry/boot";
import { eq, sql } from "drizzle-orm";
import { freshDb, SHIPPED_MIGRATIONS, shippedChainThrough } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { seedCharacter, seedChat, seedMessage, seedOwnerStats, seedUser, T0 } from "../../domain/stats/_support.ts";

const PRE_REGRAIN_TAG = "0004_character-import-text-hash";
const BOOT_NOW = (): number => T0 + 60_000;

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
    await seedMessage(db, { chatId, seq: 2, role: "assistant", characterId, createdAt: T0 + STATS_BUCKET_MS, variants: [{ content: "hello" }] });
    // The pre-upgrade rollups: an owner row with activity and its day-keyed timeline row.
    await seedOwnerStats(db, ownerId, { chats: 1, userTurns: 1, assistantTurns: 1 });
    await db.run(sql`INSERT INTO daily_stats (id, owner_id, day, user_turns, assistant_turns, computed_at)
      VALUES ('daily_stat_pre_regrain', ${ownerId}, '2026-06-26', 1, 1, ${T0})`);

    await runMigrations(db, SHIPPED_MIGRATIONS);
    expect(await db.select().from(dailyStats)).toEqual([]);

    expect(await rebuildStatsTimelineOnBoot({ db, now: BOOT_NOW })).toBe(1);
    const rows = await db.select().from(dailyStats).where(eq(dailyStats.ownerId, ownerId)).orderBy(dailyStats.bucketStart);
    expect(rows.map((r) => [r.bucketStart, r.userTurns, r.assistantTurns])).toEqual([
      [statsBucketStart(T0), 1, 0],
      [statsBucketStart(T0 + STATS_BUCKET_MS), 0, 1],
    ]);
    expect(rows.reduce((sum, r) => sum + r.chatsCreated, 0)).toBe(1);

    // The predicate, not a marker, is what makes it idempotent: a rebuilt owner has a timeline.
    expect(await rebuildStatsTimelineOnBoot({ db, now: BOOT_NOW })).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
