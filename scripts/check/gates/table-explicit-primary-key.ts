// Gate: table-explicit-primary-key — every `sqliteTable` declares a primary key, explicitly.
//
// A SQLite table without a PRIMARY KEY still has one: the hidden `rowid`, which is NOT stable (VACUUM can
// renumber it), NOT visible to drizzle's `$inferSelect`, and NOT a thing another table can reference. The
// consequences are all silent: no row is addressable by identity, `.returning()` gives back nothing to key
// on, an upsert has no conflict target, and the table can never become an FK parent — which in this schema
// is the same as saying it can never be part of the ownership chain (`Ownership is INHERITED` — AGENTS §1:
// scope derives through the FK chain to the root row).
//
// TWO SANCTIONED FORMS, both explicit: an inline `.primaryKey()` on the identity column (the TypeID-PK
// norm — `id: text("id").$type<ChatId>().primaryKey()`), or a composite `primaryKey({ columns: [a, b] })`
// in the extras callback (the junction norm — `character_tags`, `chat_digest_speakers`, `plugin_kv`). A
// natural-key single column (`settings.key`, `oidc_transactions.state`) uses the inline form.
//
// PURE PREVENTION at zero violations: all 76 tables carry one today (spot-checks were clean; this gate is
// what turns "we checked a few" into "all 76, every run"). No allowlist — a genuinely keyless log table
// would be a schema decision to argue in the ledger, not a row here.
//
// DECLARED LIMIT (shared with its two siblings): the reader keys on the literal drizzle call shape, so a
// table assembled through a column-factory helper reads as keyless and REDs — fail-CLOSED, which for a
// primary key is the right direction.
import type { SourceFile } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";
import { hasPrimaryKey, isSchemaFile, schemaTables } from "../schema-read.ts";

const MESSAGE =
  "a `sqliteTable` with no PRIMARY KEY — SQLite falls back to the hidden `rowid`, which is unstable " +
  "across VACUUM, invisible to `$inferSelect`, and unreferenceable, so the table can never be an FK " +
  "parent and its rows are not addressable by identity. Tier-1-DB.md §Invariants.";

const FIX =
  "declare the key explicitly: an inline `.primaryKey()` on the identity column (the TypeID-PK norm, " +
  '`id: text("id").$type<XId>().primaryKey()`), or a composite `primaryKey({ columns: [t.a, t.b] })` in ' +
  "the extras callback for a junction. DDL changed ⇒ regenerate the baseline (see `structure:db-baseline`).";

function checkFile(sf: SourceFile, ctx: GateRunCtx): void {
  for (const table of schemaTables(sf)) {
    if (!hasPrimaryKey(table)) {
      ctx.report(table.call, { token: table.variableName, offset: 0 });
    }
  }
}

export const gate: GateDescriptor = {
  name: "table-explicit-primary-key",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3) — Tier-1-DB.md §Invariants",
  status: "active",
  scopeSafety: "incremental-safe", // per-file: a table's key is declared inside its own call
  message: MESSAGE,
  fix: FIX,
  scanRoot: isSchemaFile,
  visitFile: checkFile,

  mustFlag: [
    {
      at: "packages/db/src/schema/chat.ts",
      files:
        'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
        'export const chatLocks = sqliteTable("chat_locks", {\n' +
        '  chatId: text("chat_id"),\n' +
        '  holder: text("holder"),\n' +
        "});\n",
      expect: { count: 1, messageIncludes: "no PRIMARY KEY" },
      why: "the whole rule — a keyless table silently keys on the unstable hidden rowid",
    },
    {
      at: "packages/db/src/schema/tag.ts",
      files:
        'import { index, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
        'export const characterTags = sqliteTable(\n  "character_tags",\n  {\n' +
        '    characterId: text("character_id"),\n' +
        '    tagId: text("tag_id"),\n' +
        "  },\n" +
        '  (t) => [index("character_tags_tag_idx").on(t.tagId)],\n);\n',
      expect: { count: 1 },
      why: "a junction with extras but no `primaryKey({ columns })` — an index is not a key, and this is exactly how a junction loses its uniqueness guarantee",
    },
  ],
  mustPass: [
    {
      at: "packages/db/src/schema/chat.ts",
      files:
        'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
        'export const chats = sqliteTable("chats", {\n' +
        '  id: text("id").primaryKey(),\n' +
        '  title: text("title"),\n' +
        "});\n",
      why: "the TypeID-PK norm — an inline `.primaryKey()` on the identity column (the shape of ~70 of the 76 tables)",
    },
    {
      at: "packages/db/src/schema/tag.ts",
      files:
        'import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
        'export const characterTags = sqliteTable(\n  "character_tags",\n  {\n' +
        '    characterId: text("character_id"),\n' +
        '    tagId: text("tag_id"),\n' +
        "  },\n" +
        "  (t) => [primaryKey({ columns: [t.characterId, t.tagId] })],\n);\n",
      why: "the junction norm — a composite key declared in the extras callback",
    },
    {
      at: "packages/db/src/schema/settings.ts",
      files:
        'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
        'export const settings = sqliteTable("settings", {\n' +
        '  key: text("key").primaryKey(),\n' +
        '  value: text("value"),\n' +
        "});\n",
      why: "a NATURAL single-column key (`settings.key`) — explicit is explicit; the gate demands a declared key, not a TypeID",
    },
  ],
};
