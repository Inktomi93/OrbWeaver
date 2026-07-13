// domain/discovery/verbs/insights — pure-semantics insights (owner-scoped reads; live SQL): themeDrift
// (per-month theme prevalence over story time) + unusedCharacters (collected but never played). The
// economics-composed insights (forgottenGems, modelRouting) live in the sibling economics-insights.ts,
// composing the injected stats economics op — this file stays the pure-semantics half.

import type { Db } from "@orb/db";
import {
  assets,
  characters,
  chatParticipants,
  digestThemeAssignments,
  themeClusters,
} from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { and, asc, desc, eq, isNotNull, notExists, sql } from "drizzle-orm";
import type { ThemeLevel } from "../contract/params";
import type { ThemeDriftBucket, ThemeDriftTheme, UnusedCharacter } from "../contract/results";
import type { DiscoveryContext, DiscoveryService } from "../contract/service";

const THEME_DRIFT_TOP = 6;

export function createInsights(
  ctx: DiscoveryContext,
): Pick<DiscoveryService, "themeDrift" | "unusedCharacters"> {
  return {
    themeDrift: (userId, level) => themeDrift(ctx.db, userId, level),
    unusedCharacters: (userId) => unusedCharacters(ctx.db, userId),
  };
}

/** Month bucket derives from the digest's msgMidAt; assignments without a stamp are skipped. */
export async function themeDrift(
  db: Db,
  ownerId: UserId,
  level: ThemeLevel = "scene",
): Promise<ThemeDriftBucket[]> {
  const bucket = sql<string>`strftime('%Y-%m', ${digestThemeAssignments.msgMidAt} / 1000, 'unixepoch')`;
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
    .where(
      and(
        eq(themeClusters.ownerId, ownerId),
        eq(themeClusters.level, level),
        isNotNull(digestThemeAssignments.msgMidAt),
      ),
    )
    .groupBy(bucket, themeClusters.clusterIdx)
    .orderBy(asc(bucket), desc(count));

  const byBucket = new Map<string, ThemeDriftTheme[]>();
  for (const r of rows) {
    const list = byBucket.get(r.bucket);
    const theme = { clusterIdx: r.clusterIdx, themeName: r.themeName, count: r.count };
    if (list === undefined) {
      byBucket.set(r.bucket, [theme]);
    } else {
      list.push(theme);
    }
  }
  return [...byBucket.entries()].map(([b, themes]) => ({
    bucket: b,
    themes: themes.slice(0, THEME_DRIFT_TOP),
  }));
}

export async function unusedCharacters(db: Db, ownerId: UserId): Promise<UnusedCharacter[]> {
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
            .where(
              and(
                eq(chatParticipants.characterId, characters.id),
                eq(chatParticipants.kind, "character"),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(characters.name));
  return rows;
}
