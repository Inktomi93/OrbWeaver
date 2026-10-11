// domain/settings/persistence/migrate-seeded-background-picks — the `kind:"seeded"` background RETIREMENT's
// settings half (owner ask 2026-09-18, "the weird seeded backgrounds").
//
// WHY A DATA PASS AND NOT JUST THE SCHEMA'S `.catch`. `appearanceSettingsSchema`'s `backgroundImageKind`
// already heals an unknown kind to `none`, so nothing CRASHES on an un-migrated row — it just silently
// throws away the plate the user picked, which is the one thing that must not happen. This pass runs before
// that heal is ever reached and re-points the pick at the plate's now-owned asset.
//
// IT READS RAW, AND THAT IS THE WHOLE TRICK. Every parsed read of a stored config has ALREADY collapsed
// `"seeded"` to `"none"` and dropped the unknown `backgroundSeededId` key, so by the time `readUserSettings`
// answers, the evidence is gone. The slug and the kind are therefore read straight off the JSON column with
// `json_extract`; only the WRITE goes through `writeUserConfig`, the one whole-blob writer, so the
// ownership+kind guard that rides that UPDATE still decides whether the new asset pin is legal. No second
// writer, and no `json_set` shortcut past the guard.
//
// It is a boot-time pass rather than DDL for the usual reason (`heal-legacy-background-pins`'s header): the
// column is plain JSON, the change is inside the blob, and the pre-launch baseline is squashed rather than
// forward-only. It is idempotent by its own predicate — a row whose raw kind is not `"seeded"` is not read
// again — so it needs no marker column that could disagree with the data.

import type { UserSettings } from "@orb/contracts/settings";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import { userSettings } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { and, eq, sql } from "drizzle-orm";
import type { SeededSlugResolver } from "../contract/seeder.ts";
import { readUserSettings, writeUserConfig } from "./queries.ts";

/** The raw stored pick for one user, as it sits in the JSON column BEFORE any schema heal. */
interface RawSeededPick {
  readonly userId: UserId;
  readonly slug: string;
}

/** Every `user_settings` row whose STORED `appearance.backgroundImageKind` is still the retired `"seeded"`.
 *  Read through `json_extract` because the parsed read cannot see it (see the header). */
async function selectSeededPicks(db: Db, ownerId: UserId | null): Promise<readonly RawSeededPick[]> {
  const kind = sql<string | null>`json_extract(${userSettings.config}, '$.appearance.backgroundImageKind')`;
  const slug = sql<string | null>`json_extract(${userSettings.config}, '$.appearance.backgroundSeededId')`;
  const seededKind = eq(kind, "seeded");
  const rows = await db
    .select({ userId: userSettings.userId, slug })
    .from(userSettings)
    .where(ownerId === null ? seededKind : and(seededKind, eq(userSettings.userId, ownerId)));
  return rows.map((row) => ({ userId: row.userId, slug: row.slug ?? "" }));
}

/** The appearance plane with the pick re-pointed. A plate this pack still ships becomes the user's own
 *  `asset`; anything else — the four deleted landscape placeholders, a slug from an install that shipped a
 *  plate we no longer carry — becomes `none`, which is what the schema would have healed it to anyway. */
function repointedConfig(config: UserSettings, plate: ThemeBackground | null): UserSettings {
  const cleared = { backgroundImageKind: "none" as const, backgroundAssetId: "", backgroundAssetHash: "", backgroundAssetMime: "" };
  const pointed =
    plate === null
      ? cleared
      : { backgroundImageKind: "asset" as const, backgroundAssetId: plate.assetId, backgroundAssetHash: plate.assetHash, backgroundAssetMime: plate.mime };
  return { ...config, appearance: { ...config.appearance, ...pointed } };
}

/**
 * Re-point every stored `kind:"seeded"` appearance pick at the plate's now-owned asset (or clear it).
 * `ownerId === null` sweeps every user; a user id narrows it to that user's own row, which is the form the
 * per-user seeder calls. Returns the number of rows rewritten — 0 on every pass after the first, and on any
 * install whose settings were written entirely after the retirement.
 */
export async function migrateSeededBackgroundPicks(db: Db, ownerId: UserId | null, resolve: SeededSlugResolver, at: number): Promise<number> {
  let rewritten = 0;
  for (const pick of await selectSeededPicks(db, ownerId)) {
    const plate = pick.slug.length === 0 ? null : await resolve(pick.slug);
    const current = await readUserSettings(db, pick.userId);
    await writeUserConfig(db, pick.userId, repointedConfig(current.config, plate), at);
    rewritten++;
  }
  return rewritten;
}
