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
// snapshot, D26), never a preset FK. The ONE preset→preset link is `forked_from` (self-FK, below).

import type { PromptConfig } from "@orb/contracts/preset";
import { PROMPT_CONFIG_SCHEMA_VERSION } from "@orb/contracts/preset";
import type { PresetId, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
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
    // Fork lineage — the preset this row was COPIED from (the copy-on-write fork of the system default,
    // and the `clonePackaged` copy of a PACKAGED template). A self-FK, NOT a soft ref (D24 sanctions
    // exactly one soft ref, `audit_logs.entity_id`), spelled like `chats.parent_chat_id`: nullable
    // (null = born here, not a fork) with SET NULL so a fork outlives its source as a root. A fork is a
    // deep COPY — this link carries nothing but provenance, and no read path depends on the source row
    // existing. Also the COW convergence key: `domain/preset/verbs/update.ts` looks up the caller's
    // existing fork of the same source instead of minting a second one.
    forkedFrom: text("forked_from")
      .$type<PresetId>()
      .references((): AnySQLiteColumn => presets.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  // The owner index serves the library list; the (owner, source) index serves the COW convergence lookup.
  // NOT unique, for two independent reasons: `clonePackaged` mints an INDEPENDENT copy per call by contract
  // (its rpg GM-preset consumer clones the same template once per game), and the owner may deliberately keep
  // SEVERAL forks of the built-in (the update verb's `{mode:"new"}` fork intent) — uniqueness on this pair
  // would refuse both.
  // `presets_forked_from_idx` is the fork self-FK's own SET-NULL parent scan: SQLite only uses an index
  // whose LEFTMOST column is the constrained one, so the (owner, forkedFrom) pair above cannot serve a
  // delete that knows only the parent preset id (`fk-columns-indexed` gate).
  (table) => [
    index("presets_owner_idx").on(table.ownerId),
    index("presets_owner_forked_from_idx").on(table.ownerId, table.forkedFrom),
    index("presets_forked_from_idx").on(table.forkedFrom),
  ],
);
