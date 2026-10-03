// domain/discovery/verbs/insights — pure-semantics insights (owner-scoped reads; live SQL): themeDrift
// (theme prevalence per UTC calendar bucket of story time) + unusedCharacters (collected but never played). The
// economics-composed insights (forgottenGems, modelRouting) live in the sibling economics-insights.ts,
// composing the injected stats economics op — this file stays the pure-semantics half.

import type { Db } from "@orb/db";
import { assets, characters, chatParticipants, digestThemeAssignments, themeClusters } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { and, asc, desc, eq, isNotNull, notExists, sql } from "drizzle-orm";
import type { DiscoveryContext } from "../context.ts";
import type { ThemeLevel } from "../contract/params.ts";
import type { ThemeDriftBucket, ThemeDriftTheme, UnusedCharacter } from "../contract/results.ts";
import type { DiscoveryService } from "../contract/service.ts";
import { storyTimeBucketStart } from "../persistence/embed-store-reads.ts";

export function createInsights(ctx: DiscoveryContext): Pick<DiscoveryService, "themeDrift" | "unusedCharacters"> {
  return {
    themeDrift: (userId, level) => themeDrift(ctx.db, userId, level),
    unusedCharacters: (userId) => unusedCharacters(ctx.db, userId),
  };
}

/** The bucket derives from the digest's msgMidAt; assignments without a stamp are skipped. Every theme of a
 *  bucket ships: which themes lead a month is decided after the client folds buckets into the viewer's months. */
async function themeDrift(db: Db, ownerId: UserId, level: ThemeLevel = "scene"): Promise<ThemeDriftBucket[]> {
  const bucket = storyTimeBucketStart();
  const count = sql<number>`count(*)`;
  const rows = await db
    .select({
      bucket,
      clusterIdx: themeClusters.clusterIdx,
      themeName: themeClusters.name,
      count,
    })
    .from(digestThemeAssignments)
    .innerJoin(themeClusters, eq(themeClusters.id, digestThemeAssignments.themeClusterId))
    .where(and(eq(themeClusters.ownerId, ownerId), eq(themeClusters.level, level), isNotNull(digestThemeAssignments.msgMidAt)))
    .groupBy(bucket, themeClusters.clusterIdx)
    .orderBy(asc(bucket), desc(count), asc(themeClusters.clusterIdx));

  const byBucket = new Map<number, ThemeDriftTheme[]>();
  for (const r of rows) {
    const list = byBucket.get(r.bucket);
    const theme = { clusterIdx: r.clusterIdx, themeName: r.themeName, count: r.count };
    if (list === undefined) {
      byBucket.set(r.bucket, [theme]);
    } else {
      list.push(theme);
    }
  }
  return [...byBucket.entries()].map(([bucketStart, themes]) => ({ bucketStart, themes }));
}

async function unusedCharacters(db: Db, ownerId: UserId): Promise<UnusedCharacter[]> {
  const rows = await db
    .select({
      characterId: characters.id,
      name: characters.name,
      avatarHash: assets.hash,
    })
    .from(characters)
    .leftJoin(assets, eq(assets.id, characters.avatarAssetId))
    .where(
      and(
        eq(characters.ownerId, ownerId),
        eq(characters.synthetic, false),
        notExists(
          db
            .select({ one: sql`1` })
            .from(chatParticipants)
            .where(and(eq(chatParticipants.characterId, characters.id), eq(chatParticipants.kind, "character"))),
        ),
      ),
    )
    .orderBy(asc(characters.name));
  return rows;
}
