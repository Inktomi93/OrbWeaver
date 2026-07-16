// domain/settings/persistence/queries — all db access for settings (queries only, no business logic). This
// domain never reads/joins users. Timestamps arrive as params (injected clock, no ambient wall-clock reads).

import type { UserSettings } from "@orb/contracts/settings";
import { DEFAULT_USER_SETTINGS, parseUserSettings, USER_SETTINGS_SCHEMA_VERSION } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { settings, userSettings } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import { eq } from "drizzle-orm";
import { APP_SETTINGS_KEY } from "../contract/keys";
import type { GlobalSettingView, UserSettingsView } from "../contract/views";

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
 *  never-touched user. */
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

/** Seed-then-UPDATE the user's config blob; schemaVersion is service-owned (pinned to the current constant). */
export async function writeUserConfig(db: Db, ownerId: UserId, config: UserSettings, at: number): Promise<void> {
  await ensureUserSettings(db, ownerId, at);
  await db.update(userSettings).set({ config, schemaVersion: USER_SETTINGS_SCHEMA_VERSION, updatedAt: at }).where(eq(userSettings.userId, ownerId));
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

/** Upsert the AppSettings override row; the caller stamps schemaVersion into the blob before writing. */
export async function writeAppOverride(db: Db, value: JsonValue, at: number): Promise<void> {
  await db
    .insert(settings)
    .values({ key: APP_SETTINGS_KEY, value, updatedAt: at })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: at } });
}
