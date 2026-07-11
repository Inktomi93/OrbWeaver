// domain/discovery/verbs/insights — the PURE-SEMANTICS insights (owner-scoped reads; live SQL). `themeDrift`
// (how the owner's themes shift over STORY time — per-month prevalence, PD-39's `msgMidAt`) + `unusedCharacters`
// (collected but never played — no `chat_participants` character seat). Was neo-tavern `corpus/verbs/insights.ts`.
//
// The ECONOMICS-composed insights — `forgottenGems` (invested-but-quiet: real message volume + tokensOut +
// lastActive) + `modelRouting` (which model per genre) — are BUILT in the SIBLING `verbs/economics-insights.ts`
// (PD-22/PD-40 cleared). They compose the injected `stats` economics op (per-message tokens/cost live on
// `message_variants`, D26 — NOT a discovery read); the design is `../proposed/stats-discovery-seam.md` tier 3.
// This file stays the PURE-semantics half — discovery does semantics; economics is stats' fence.

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

// How many top themes are kept per story-time bucket (the long tail below is noise).
const THEME_DRIFT_TOP = 6;

/** Bind the pure-semantics insights over the DI bundle (the verb-naming factory the service composes). */
export function createInsights(
  ctx: DiscoveryContext,
): Pick<DiscoveryService, "themeDrift" | "unusedCharacters"> {
  return {
    themeDrift: (userId, level) => themeDrift(ctx.db, userId, level),
    unusedCharacters: (userId) => unusedCharacters(ctx.db, userId),
  };
}

/**
 * How the owner's themes shift over STORY time — per-month theme prevalence (drift), bucket-ascending. The
 * month bucket derives from the digest's `msgMidAt` (PD-39 position-median message time; assignments without a
 * stamp — e.g. tier-k/arc until the bridge-coverage backfill lands — are skipped). Owner scope via
 * `theme_clusters.ownerId` (KEEPS ownerId, D23). `level` defaults to `scene` (matches the `themes` surface).
 */
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

/**
 * The owner's characters that were NEVER played — no `chat_participants` character seat anywhere. Synthetic
 * group characters are excluded (they have no card). Name + avatar for display, name-ascending. Owner scope via
 * `characters.ownerId` (audit #1).
 */
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
