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
//
// `themes` (TypeID PK) — the D44 §12.1 user theme library. Seed
// palettes (Hearth/Mocha/Light) are rows with `owner_id IS NULL` (the `presets` two-row-kind precedent,
// `db/schema/preset.ts`): non-deletable/non-editable by construction, since `fetchOwned(caller)` can
// never match a NULL owner. CASCADE on `owner_id` (the D21 single-owned family norm — presets' RESTRICT
// is preset-specific). `unique(ownerId, name)` makes the picker/duplicate name-space collision surface
// as a typed constraint violation at the write verb (never a phantom pre-SELECT); SQLite treats NULLs as
// distinct, so seed names are NOT constrained by it (the seeder is the guard for the seed namespace).

import type { UserSettings } from "@orb/contracts/settings";
import { USER_SETTINGS_SCHEMA_VERSION } from "@orb/contracts/settings";
import type { ThemeOverride } from "@orb/contracts/theme";
import type { ThemeId, UserId } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  // biome-ignore lint/suspicious/noDeprecatedImports: drizzle @deprecates the positional primaryKey(col) overload; we use the supported primaryKey({ columns }) object form below.
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { users } from "./users.ts";

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

// `user_seed_ledger` (D263) — one row per seed-manifest item an account has been given. The seeder skips a
// recorded key, so an item the user deleted is never seeded again, and a key a later build adds is simply
// unrecorded, so it reaches the account on its next seed. The key is `@orb/default-content`'s manifest key.
export const userSeedLedger = sqliteTable(
  "user_seed_ledger",
  {
    userId: text("user_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemKey: text("item_key").notNull(),
    seededAt: integer("seeded_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemKey] })],
);

export const themes = sqliteTable(
  "themes",
  {
    id: text("id").$type<ThemeId>().primaryKey(),
    // NULLABLE: owner_id IS NULL = a seed palette row (the presets two-row-kind pattern). CASCADE for
    // owned rows — a deleted user's themes are worthless without the owner (the D21 single-owned norm).
    ownerId: text("owner_id")
      .$type<UserId>()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // The D44 Tier-A token-override value-set. Parsed LENIENTLY at the read seam via `themeOverrideSchema`
    // (@orb/contracts/theme) — a corrupt blob degrades to defaults there, never here.
    override: text("override", { mode: "json" }).$type<ThemeOverride>().notNull(),
    // Optional self-authored custom CSS (§12.1 Tier-B / global-owner tier — validated at the write
    // boundary via `@orb/kit/css-validate`). NULL on seeds.
    css: text("css"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("themes_owner_idx").on(table.ownerId),
    // Per-user name uniqueness: a duplicate name makes the theme picker ambiguous. NULLs are distinct in
    // SQLite, so this does not constrain seed names (the seeder is the guard for the seed namespace).
    //
    // THE SEED-NAMESPACE HOLE IS ACCEPTED (#1378 item 9, reachability traced). SQLite's NULL-distinctness
    // means this index permits two SYSTEM themes (`owner_id IS NULL`) with the same `name`. It is untidy
    // and it is NOT ambiguous in practice: every system-theme read resolves BY ID
    // (`domain/settings/seed-themes.ts` upserts and reads by the seed's stable id), and no query anywhere
    // does `WHERE owner_id IS NULL AND name = ?`. Closing it would take a second partial unique index over
    // `name WHERE owner_id IS NULL`, which buys nothing against a seeder that is already id-keyed. Not a
    // gap to fix; a fact so the next reader does not re-derive it.
    uniqueIndex("themes_owner_name_uq").on(table.ownerId, table.name),
  ],
);
