// domain/settings/persistence/queries — ALL db access for settings (queries only; no business logic). The
// two config tables (`user_settings`, `settings`) are owned here; the table DEFINITIONS live in @orb/db.
// This domain NEVER reads/joins `users` (the `no-direct-users-read` chokepoint — UserSettings scopes by the
// `userId` PK the verb takes from the injected Principal). Timestamps arrive as PARAMS (the verb's injected
// clock — determinism; no ambient wall-clock reads). The `settings.value` column is `JsonValue` but is
// Json-validated at the read seam so the view's contract is honest rather than a cast.

import type { UserSettings } from "@orb/contracts/settings";
import {
  DEFAULT_USER_SETTINGS,
  parseUserSettings,
  USER_SETTINGS_SCHEMA_VERSION,
} from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { settings, userSettings } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import { eq } from "drizzle-orm";
import { APP_SETTINGS_KEY } from "../contract/keys";
import type { GlobalSettingView, UserSettingsView } from "../contract/views";

/** Read this user's typed/defaulted UserSettings. A never-touched account returns the parsed defaults
 *  synthesized from `{}` with NO write (`updatedAt: 0`) — materializing the row is `ensureUserSettings`. */
export async function readUserSettings(db: Db, ownerId: UserId): Promise<UserSettingsView> {
  const rows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, ownerId))
    .limit(1);
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
    // Thread the row's STORED version (the COLUMN) into the parse — the blob does NOT carry `schemaVersion`,
    // and without it every blob probes as v1 and ALL lifts re-run on every read (the corruption guard).
    config: parseUserSettings(row.config, row.schemaVersion),
    updatedAt: row.updatedAt,
  };
}

/** First-touch seed (idempotent; `onConflictDoNothing` on the `userId` PK). A pure read MUST NOT insert —
 *  write paths call this before the UPDATE so the UPDATE can't silently no-op a never-touched user. */
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

/** Seed-then-UPDATE the user's config blob. `schemaVersion` is service-owned (pinned to the current code
 *  constant) — the client supplies a `config` validated against the current schema, so the stored row
 *  claims the matching version (and that column is what reads thread back as `storedVersion`). */
export async function writeUserConfig(
  db: Db,
  ownerId: UserId,
  config: UserSettings,
  at: number,
): Promise<void> {
  await ensureUserSettings(db, ownerId, at);
  await db
    .update(userSettings)
    .set({ config, schemaVersion: USER_SETTINGS_SCHEMA_VERSION, updatedAt: at })
    .where(eq(userSettings.userId, ownerId));
}

function toView(row: { key: string; value: JsonValue; updatedAt: number }): GlobalSettingView {
  return {
    key: row.key,
    // Json-validate at the seam so the view is honest `JsonValue` (a corrupt row degrades to null, never
    // throws — the read surface must not 500 on a malformed escape-hatch blob).
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
export async function upsertGlobalSetting(
  db: Db,
  key: string,
  value: JsonValue,
  at: number,
): Promise<GlobalSettingView> {
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

/** Read the raw stored AppSettings override blob (or `undefined` if never written). The caller parses it
 *  via `parseAppSettings` (the in-blob `schemaVersion` probe is authoritative — no version column here). */
export async function readAppOverrideRaw(db: Db): Promise<JsonValue | undefined> {
  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, APP_SETTINGS_KEY))
    .limit(1);
  return rows[0]?.value;
}

/** Upsert the AppSettings override row. The caller stamps `schemaVersion` INTO the blob before writing
 *  (the `settings` table has no version column; the probe reads it before the schema strips it). */
export async function writeAppOverride(db: Db, value: JsonValue, at: number): Promise<void> {
  await db
    .insert(settings)
    .values({ key: APP_SETTINGS_KEY, value, updatedAt: at })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: at } });
}
