// schema/preset — the generation-config library (producer: domain/preset). A preset is a library of
// `PromptConfig` blobs (the authored, reorderable prompt structure + the provider-agnostic `UserIntent`
// generation snapshot). NOT the connection (`{api, source, model}` selection is contracts/connection).
//
// Two row kinds:
//   • owner-scoped — `owner_id IS NOT NULL`, the user's library, unlimited count.
//   • system default — exactly ONE row with `owner_id IS NULL`, keyed by the NIL TypeID sentinel
//     `SYSTEM_DEFAULT_PRESET_ID` (`preset_00000000000000000000000000`). That sentinel is a DOMAIN
//     constant (`domain/preset/constants.ts`, NOT contracts — no client needs it), so this schema does
//     NOT import it; it only makes `owner_id` NULLABLE so the row can exist. The FK is RESTRICT
//     (nullable): a null owner is the system default; a non-null owner can't be deleted out from under
//     their presets.
//
// `schema_version` mirrors `config.schemaVersion` (the boot reseed is
// version-gated; the column is the legible compare key, defaulted to the current PromptConfig version).
// NO FK from chats/messages: past-turn provenance lives on `message_variants.params` (a UserIntent
// snapshot, D26), never a preset FK.

import type { PromptConfig } from "@orb/contracts/preset";
import { PROMPT_CONFIG_SCHEMA_VERSION } from "@orb/contracts/preset";
import type { PresetId, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const presets = sqliteTable(
  "presets",
  {
    id: text("id").$type<PresetId>().primaryKey(),
    // NULLABLE (system default = null owner). RESTRICT: never cascade-delete a user's presets out from
    // under them; the system-default row has no owner to restrict.
    ownerId: text("owner_id")
      .$type<UserId>()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    // Free-text label (`kind` is NOT an enum; e.g. "roleplay", "assistant").
    kind: text("kind").notNull(),
    // The PromptConfig blob. Parsed at the read seam via `parsePromptConfig` (@orb/contracts/preset);
    // a corrupt blob degrades to DEFAULT_PROMPT_CONFIG there, never here.
    config: text("config", { mode: "json" }).$type<PromptConfig>().notNull(),
    // Mirrors `config.schemaVersion` (the reseed-gate compare key). Defaulted to the current version so
    // a fresh write is self-consistent; the domain stamps `config.schemaVersion` explicitly on write.
    schemaVersion: integer("schema_version").notNull().default(PROMPT_CONFIG_SCHEMA_VERSION),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => [index("presets_owner_idx").on(table.ownerId)],
);
