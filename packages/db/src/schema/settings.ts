// schema/settings — the two config-tier tables (producer: domain/settings). `settings` is the global
// KV escape hatch (a generic `key → json` store); `user_settings` is the per-user tier.
//
// `settings` (natural-key PK `key`): the reserved `APP_SETTINGS_KEY` (`"app"`) row holds the AppSettings
// OVERRIDE blob (its `schemaVersion` lives INSIDE the blob — this table has no version column, so the
// in-blob probe is authoritative for AppSettings). The OR model-catalog snapshot row
// (`'openrouter-model-catalog'`) is a TENANT here — owned by connection's persistence; settings owns
// the table mechanism, not that blob's meaning. The generic setter refuses the reserved `"app"` key.
//
// `user_settings` (natural-key PK `user_id`, also the FK): the `schema_version` COLUMN is LOAD-BEARING
// — it is threaded into `parseUserSettings(raw, storedVersion)` and BEATS the
// in-blob `schemaVersion` probe. The persisted `config` blob does NOT carry `schemaVersion`; the column
// does. Without it every blob probes as v1 and all lifts re-run on every read (corrupting data the
// moment a lift is non-idempotent). Defaulted to the current version so a fresh seed is self-consistent.

import type { UserSettings } from "@orb/contracts/settings";
import { USER_SETTINGS_SCHEMA_VERSION } from "@orb/contracts/settings";
import type { UserId } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const settings = sqliteTable("settings", {
  // The natural KV key (e.g. "app", "openrouter-model-catalog"). No brand — a free-form string key.
  key: text("key").primaryKey(),
  // The stored JSON value. Generic `JsonValue` (the AppSettings override blob, the OR catalog snapshot,
  // …); parsed into its specific shape at the read seam by whichever tenant owns the row.
  value: text("value", { mode: "json" }).$type<JsonValue>().notNull(),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
});

export const userSettings = sqliteTable("user_settings", {
  // PK = the owning user (one settings row per user). The FK + the PK are the same column.
  userId: text("user_id")
    .$type<UserId>()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // LOAD-BEARING: the stored version that BEATS the in-blob probe (the corruption guard). Defaulted to
  // the current version; the service stamps it on every write.
  schemaVersion: integer("schema_version").notNull().default(USER_SETTINGS_SCHEMA_VERSION),
  // The UserSettings blob. Parsed (with this row's `schema_version` as `storedVersion`) at the read seam
  // via `parseUserSettings`; a never-touched account reads defaults from `{}` with NO row written.
  config: text("config", { mode: "json" }).$type<UserSettings>().notNull(),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
});
