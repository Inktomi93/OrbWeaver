// domain/settings/persistence/queries — all db access for settings (queries only, no business logic). This
// domain never reads/joins users. Timestamps arrive as params (injected clock, no ambient wall-clock reads).
//
// THE ONE EXCEPTION (#471): the two whole-blob writers (`writeUserConfig`, `writeAppOverride`) re-read the
// row they are about to replace and REFUSE when an existing blob is unreadable. It lives here, not in the
// verbs, because "may this row be overwritten?" is a property of the ROW, and because these two functions
// are the only whole-blob writers on the tree — guarding them is TOTAL over every present and future
// caller, where a per-verb check is a convention the next verb forgets. `substrate/stored-config.ts`
// carries the reasoning + the tradeoff.

import type { UserSettings } from "@orb/contracts/settings";
import { appSettingsConfig, DEFAULT_USER_SETTINGS, parseUserSettings, USER_SETTINGS_SCHEMA_VERSION, userSettingsConfig } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { assets, settings, userSettings } from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import type { AssetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import { and, eq, exists, sql } from "drizzle-orm";
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
  await ensureUserSettings(db, ownerId, at);
  const current =
    config.appearance.backgroundImageKind === "asset" && config.appearance.backgroundAssetId.length > 0
      ? [castId<AssetId>(config.appearance.backgroundAssetId)]
      : [];
  const ids = [...current, ...config.appearance.backgroundLibrary.map((entry) => entry.assetId)].filter((id, index, all) => all.indexOf(id) === index);
  const owned = ids.map((id) =>
    exists(
      db
        .select({ one: sql`1` })
        .from(assets)
        .where(and(eq(assets.id, id), eq(assets.ownerId, ownerId))),
    ),
  );
  const written = await db
    .update(userSettings)
    .set({ config, schemaVersion: USER_SETTINGS_SCHEMA_VERSION, updatedAt: at })
    .where(and(eq(userSettings.userId, ownerId), ...owned))
    .returning({ userId: userSettings.userId });
  if (written.length === 0) {
    throw new DomainOperationError("background_unavailable", "A background asset is no longer available.");
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
