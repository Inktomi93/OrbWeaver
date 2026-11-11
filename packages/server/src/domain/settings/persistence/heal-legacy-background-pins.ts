// domain/settings/persistence/heal-legacy-background-pins — the background-pin ONE-TIME DATA heal.
//
// THE TRAP. The ownership+kind guard: every pinned background id must name an
// asset this user owns AND whose `kind` is `background`. `writeUserConfig` is the ONE whole-blob writer, so a
// user whose STORED blob already pins an asset that predates that guard — dev data seeded before the guard, or
// any asset whose `kind` was never `background` — now fails EVERY settings write for that user, not only a
// background edit: the round-trip write carries the unchanged stale pointer forward, and the guard refuses it
// on every field the user touches.
//
// HEAL, NOT NARROW (the fork's stated default): the write guard could instead be narrowed to
// only re-check a pinned id that CHANGED relative to the stored row (comparing old vs new pinned sets), which
// would let a round-trip of an already-dirty blob through untouched. That fork was NOT taken here — it
// complicates the write guard's already-delicate atomicity (the first-write path is ONE
// guarded statement; diffing old-vs-new pins would need the OLD blob's ids threaded into that guard too,
// widening that closed surface) for a defect whose population is bounded and one-shot: no live
// writer can PRODUCE a non-background pin under the guard (every writer of `backgroundAssetId` /
// `backgroundLibrary` stores exactly `kind: "background"`, per `queries.ts`'s `BACKGROUND_ASSET_KIND`
// comment), and nothing mutates an asset's `kind` after creation — so the dirty population is exactly
// "rows written before the guard" and a boot heal exhausts it once. Ends if a future writer needs to
// tolerate a MID-LIFE kind change (nothing does today) — then the narrow arm is the one to build.
//
// SKIPS UNREADABLE ROWS ON PURPOSE: a row this heal cannot parse is not this heal's job — `#primitives/stored-config`
// already refuses any write over it, and healing would mean building the next blob from a degraded
// read, which is exactly the wipe the intact guard exists to prevent. An unreadable row surfaces at the user's own next
// write attempt via the ordinary `stored_config_unreadable` refusal.

import type { UserSettings } from "@orb/contracts/settings";
import { userSettingsConfig } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { assets, userSettings } from "@orb/db";
import type { BootDatabaseHandle } from "@orb/db/wiring";
import { bootDatabaseForOwner } from "@orb/db/wiring-owner";
import type { AssetId, UserId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { and, eq, inArray } from "drizzle-orm";
import { isStoredConfigUnreadable, requireIntactStoredConfig } from "#primitives/stored-config";
import { BACKGROUND_ASSET_KIND, pinnedBackgroundAssetIds } from "./queries.ts";

/** The healed config: the current-selection pointer clears to "none" if it names a stale id; the library
 *  drops stale entries outright (the library is a set the picker re-populates by re-upload, never data the
 *  user authored by hand). Every OTHER field is untouched. */
function clearStaleBackgroundPins(config: UserSettings, validIds: ReadonlySet<AssetId>): UserSettings {
  const current = typeIdSchema(ID_PREFIX.asset).safeParse(config.appearance.backgroundAssetId).data;
  const currentStale = config.appearance.backgroundImageKind === "asset" && (current === undefined || !validIds.has(current));
  return {
    ...config,
    appearance: {
      ...config.appearance,
      ...(currentStale ? { backgroundImageKind: "none" as const, backgroundAssetId: "", backgroundAssetHash: "", backgroundAssetMime: "" } : {}),
      backgroundLibrary: config.appearance.backgroundLibrary.filter((entry) => validIds.has(entry.assetId)),
    },
  };
}

/** Heal one user's row; returns whether it was rewritten. `requireIntactStoredConfig`'s own top-level
 *  statement precedes the write below in this body — an
 *  unreadable row throws here and the caller skips it (see the header: not this heal's job). */
async function healOneUserBackgroundPins(db: Db, userId: UserId, storedConfig: UserSettings, schemaVersion: number): Promise<boolean> {
  const config = requireIntactStoredConfig(userSettingsConfig.parseOutcome(storedConfig, schemaVersion), `user_settings for ${userId}`);
  const ids = pinnedBackgroundAssetIds(config);
  if (ids.length === 0) {
    return false;
  }
  const owned = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.ownerId, userId), eq(assets.kind, BACKGROUND_ASSET_KIND), inArray(assets.id, [...ids])));
  // query-local lookup over THIS call's own SELECT result (a membership test for the ids just read), not module state — discarded when the function returns. Ends if it outlives the call.
  const validIds = new Set<AssetId>(owned.map((row) => row.id));
  if (ids.every((id) => validIds.has(id))) {
    return false;
  }
  await db
    .update(userSettings)
    .set({ config: clearStaleBackgroundPins(config, validIds) })
    .where(eq(userSettings.userId, userId));
  return true;
}

/** Clear every legacy background pin whose asset is missing or is not `kind: "background"`, across every
 *  `user_settings` row. Idempotent — a no-op on every boot after the first, and on a db seeded entirely
 *  under the guard. Returns the number of rows rewritten. */
export async function healLegacyBackgroundPins(handle: BootDatabaseHandle): Promise<number> {
  const db = bootDatabaseForOwner(handle);
  const rows = await db.select({ userId: userSettings.userId, config: userSettings.config, schemaVersion: userSettings.schemaVersion }).from(userSettings);
  let healed = 0;
  for (const row of rows) {
    // An unreadable row is the intact guard's territory: `writeUserConfig` raises the same refusal at the user's
    // own next write, so skipping it here drops no signal. Any other failure is a fault and fails the boot step.
    try {
      if (await healOneUserBackgroundPins(db, row.userId, row.config, row.schemaVersion)) {
        healed++;
      }
    } catch (error) {
      if (!isStoredConfigUnreadable(error)) {
        throw error;
      }
    }
  }
  return healed;
}
