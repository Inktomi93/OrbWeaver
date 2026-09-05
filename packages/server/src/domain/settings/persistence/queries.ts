// domain/settings/persistence/queries — all db access for settings (queries only, no business logic). This
// domain never reads/joins users. Timestamps arrive as params (injected clock, no ambient wall-clock reads).
//
// THE ONE EXCEPTION (#471): the two whole-blob writers (`writeUserConfig`, `writeAppOverride`) re-read the
// row they are about to replace and REFUSE when an existing blob is unreadable. It lives here, not in the
// verbs, because "may this row be overwritten?" is a property of the ROW, and because these two functions
// are the only whole-blob writers on the tree — guarding them is TOTAL over every present and future
// caller, where a per-verb check is a convention the next verb forgets. `substrate/stored-config.ts`
// carries the reasoning + the tradeoff.

import type { AssetKind } from "@orb/contracts/assets";
import type { UserSettings } from "@orb/contracts/settings";
import { appSettingsConfig, DEFAULT_USER_SETTINGS, parseUserSettings, USER_SETTINGS_SCHEMA_VERSION, userSettingsConfig } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { assets, settings, userSettings } from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import type { AssetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import type { SQL } from "drizzle-orm";
import { and, eq, exists, inArray, sql } from "drizzle-orm";
import { APP_SETTINGS_KEY } from "../contract/keys.ts";
import type { GlobalSettingView, UserSettingsView } from "../contract/views.ts";
import { requireIntactStoredConfig } from "../substrate/stored-config.ts";

/** Read this user's typed/defaulted UserSettings. A never-touched account returns parsed defaults with no
 *  write (updatedAt: 0) — materializing the row is ensureUserSettings. */
export async function readUserSettings(db: Db, ownerId: UserId): Promise<UserSettingsView> {
  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, ownerId)).limit(1);
  const row = rows[0];
  if (row === undefined) {
    return {
      userId: ownerId,
      schemaVersion: USER_SETTINGS_SCHEMA_VERSION,
      config: parseUserSettings({}),
      updatedAt: 0,
    };
  }
  return {
    userId: ownerId,
    schemaVersion: row.schemaVersion,
    // The blob carries no schemaVersion itself; without threading the column, every blob probes as v1.
    config: parseUserSettings(row.config, row.schemaVersion),
    updatedAt: row.updatedAt,
  };
}

/** First-touch seed (idempotent). Write paths call this before the UPDATE so it can't silently no-op a
 *  never-touched user.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export async function ensureUserSettings(db: Db, ownerId: UserId, at: number): Promise<void> {
  await db
    .insert(userSettings)
    .values({
      userId: ownerId,
      schemaVersion: USER_SETTINGS_SCHEMA_VERSION,
      config: DEFAULT_USER_SETTINGS,
      updatedAt: at,
    })
    .onConflictDoNothing();
}

// The ONE asset kind a background may be. Every writer of a `backgroundAssetId` / `backgroundLibrary`
// entry stores exactly this kind — the appearance upload field, `materializeBackground` (the pasted-URL
// arm), and the ST profile import — so the predicate below refuses nothing the product produces.
const BACKGROUND_ASSET_KIND: AssetKind = "background";

/** The ONE refusal both halves of the background predicate raise (the pre-write check and the guards that
 *  ride the UPDATE), so which half refused is not observable — and neither names the asset. */
function backgroundUnavailable(): DomainOperationError {
  return new DomainOperationError("background_unavailable", "A background asset is no longer available.");
}

/** The background assets a config PINS: the `asset`-kind current selection plus every library entry,
 *  deduped. These are exactly the ids the write predicate has to clear. */
function pinnedBackgroundAssetIds(config: UserSettings): AssetId[] {
  const current =
    config.appearance.backgroundImageKind === "asset" && config.appearance.backgroundAssetId.length > 0
      ? [castId<AssetId>(config.appearance.backgroundAssetId)]
      : [];
  const ids = [...current, ...config.appearance.backgroundLibrary.map((entry) => entry.assetId)];
  return ids.filter((id, index, all) => all.indexOf(id) === index);
}

/** THE background predicate as EXISTS subqueries that RIDE the UPDATE (atomic with the write): every pinned
 *  id must name an asset this user owns AND whose `kind` is `background`. Ownership alone is not the
 *  question (#1478 item 1) — a user's own card / avatar / export asset id is owned but is not a background,
 *  and accepting one leaves the background plane semantically corrupt while the write reports success. */
function ownedBackgroundGuards(db: Db, ownerId: UserId, ids: readonly AssetId[]): SQL[] {
  return ids.map((id) =>
    exists(
      db
        .select({ one: sql`1` })
        .from(assets)
        .where(and(eq(assets.id, id), eq(assets.ownerId, ownerId), eq(assets.kind, BACKGROUND_ASSET_KIND))),
    ),
  );
}

/**
 * {@link ownedBackgroundGuards} evaluated STANDALONE, before anything is written. `writeUserConfig` must
 * seed the row before it can UPDATE it, so without this a refused FIRST write left a defaults-only row
 * behind (#1478 item 2): the refusal has to be decided before the seed. The guards still ride the UPDATE as
 * the atomic belt — this is a PRE-WRITE CHECK whose window is one statement (`db.transaction` is banned in
 * product code and `batchMany` bans a SELECT ahead of its writes, `@orb/db/kit/batch`, so a guard subquery
 * inside the write plus this check are the reachable shapes). Inside that window the write still REFUSES
 * (fail-closed — the guards decide it); only the no-row property degrades.
 */
async function requireOwnedBackgrounds(db: Db, ownerId: UserId, ids: readonly AssetId[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const cleared = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.ownerId, ownerId), eq(assets.kind, BACKGROUND_ASSET_KIND), inArray(assets.id, [...ids])));
  // `ids` is deduped and `assets.id` is the PK, so a cleared id contributes exactly one row: a short count
  // means at least one pinned id is missing, someone else's, or not a background.
  if (cleared.length !== ids.length) {
    throw backgroundUnavailable();
  }
}

/** Seed-then-UPDATE the user's config blob; schemaVersion is service-owned (pinned to the current constant).
 *
 *  REFUSES (`DomainOperationError(stored_config_unreadable)`) when a row already exists whose blob cannot be
 *  read: every caller builds `config` by spreading a READ of that row, and the read seam degrades an
 *  unreadable blob to schema defaults — so persisting it would silently reset the user's whole settings
 *  blob (#471). A never-written user has nothing to lose and writes normally. */
export async function writeUserConfig(db: Db, ownerId: UserId, config: UserSettings, at: number): Promise<void> {
  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, ownerId)).limit(1);
  const row = rows[0];
  if (row !== undefined) {
    requireIntactStoredConfig(userSettingsConfig.parseOutcome(row.config, row.schemaVersion), `user_settings for ${ownerId}`);
  }
  const ids = pinnedBackgroundAssetIds(config);
  // THE PREDICATE IS EVALUATED BEFORE THE SEED (#1478 item 2) — see `requireOwnedBackgrounds`.
  await requireOwnedBackgrounds(db, ownerId, ids);
  await ensureUserSettings(db, ownerId, at);
  const written = await db
    .update(userSettings)
    .set({ config, schemaVersion: USER_SETTINGS_SCHEMA_VERSION, updatedAt: at })
    .where(and(eq(userSettings.userId, ownerId), ...ownedBackgroundGuards(db, ownerId, ids)))
    .returning({ userId: userSettings.userId });
  if (written.length === 0) {
    throw backgroundUnavailable();
  }
}

function toView(row: { key: string; value: JsonValue; updatedAt: number }): GlobalSettingView {
  return {
    key: row.key,
    // A corrupt row degrades to null rather than throwing — the read surface must not 500.
    value: jsonValueSchema.catch(null).parse(row.value),
    updatedAt: row.updatedAt,
  };
}

export async function readGlobalSetting(db: Db, key: string): Promise<GlobalSettingView | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  const row = rows[0];
  return row === undefined ? null : toView(row);
}

/** Upsert one raw global-KV row and return its view. The reserved-key guard + audit live in the verb. */
export async function upsertGlobalSetting(db: Db, key: string, value: JsonValue, at: number): Promise<GlobalSettingView> {
  await db
    .insert(settings)
    .values({ key, value, updatedAt: at })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: at } });
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`upsertGlobalSetting: row for '${key}' missing immediately after upsert`);
  }
  return toView(row);
}

/** Read the raw stored AppSettings override blob (or undefined if never written); the caller parses it. */
export async function readAppOverrideRaw(db: Db): Promise<JsonValue | undefined> {
  const rows = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, APP_SETTINGS_KEY)).limit(1);
  return rows[0]?.value;
}

/** Upsert the AppSettings override row; the caller stamps schemaVersion into the blob before writing.
 *
 *  Same refusal as `writeUserConfig` and for the same reason (#471): `updateAppSettings` merges its patch
 *  onto `parseAppSettings(readAppOverrideRaw())`, which degrades an unreadable override row to the empty
 *  override — persisting that would silently drop every admin override the box had. An ABSENT row is the
 *  normal first-write and proceeds. */
export async function writeAppOverride(db: Db, value: JsonValue, at: number): Promise<void> {
  const stored = await readAppOverrideRaw(db);
  if (stored !== undefined) {
    requireIntactStoredConfig(appSettingsConfig.parseOutcome(stored), `the ${APP_SETTINGS_KEY} override row`);
  }
  await db
    .insert(settings)
    .values({ key: APP_SETTINGS_KEY, value, updatedAt: at })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: at } });
}
