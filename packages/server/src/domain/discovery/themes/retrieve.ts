// domain/discovery/themes/retrieve — the owner-scoped theme read. `theme_clusters` KEEPS `ownerId` (D23 — a
// parentless per-user aggregate), so the owner scope belt is a direct `owner_id = ?` filter (never reads the
// `users` table). `ownerId` is ALWAYS the resolved principal id, never caller input (audit #1).

import type { Db } from "@orb/db";
import { themeClusters } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { and, asc, eq } from "drizzle-orm";
import type { ThemeLevel } from "../contract/params.ts";
import type { ThemeRow } from "../contract/results.ts";

/** The owner's theme clusters at `level` (both levels when omitted), ordered by `clusterIdx`. The stored
 *  `level` TEXT is the domain-validated {@link ThemeLevel} (schema/discovery.ts: db stores it as plain TEXT,
 *  the domain owns the union) — cast at this read boundary. */
export async function readThemes(db: Db, ownerId: UserId, level?: ThemeLevel): Promise<ThemeRow[]> {
  const where = [eq(themeClusters.ownerId, ownerId)];
  if (level !== undefined) {
    where.push(eq(themeClusters.level, level));
  }
  const rows = await db
    .select({
      id: themeClusters.id,
      level: themeClusters.level,
      clusterIdx: themeClusters.clusterIdx,
      name: themeClusters.name,
      size: themeClusters.size,
      model: themeClusters.model,
      computedAt: themeClusters.computedAt,
    })
    .from(themeClusters)
    .where(and(...where))
    .orderBy(asc(themeClusters.level), asc(themeClusters.clusterIdx));

  return rows.map((r) => ({ ...r, level: r.level as ThemeLevel }));
}
