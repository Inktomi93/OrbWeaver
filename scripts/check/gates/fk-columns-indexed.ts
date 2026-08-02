// Gate: fk-columns-indexed — every `.references()` column LEADS a B-tree index.
//
// SQLite indexes the PARENT side of a foreign key (the referenced key must already be UNIQUE) and NOTHING
// on the child side. So `messages.character_id REFERENCES characters(id) ON DELETE SET NULL` means every
// `DELETE FROM characters` does a FULL SCAN of `messages` to find the rows to null — and every "this
// character's lines" read scans too. The fix is one plain B-tree index per referencing column; the cost is
// one extra index write per row insert.
//
// LEADING, not "mentioned anywhere". SQLite can only use an index whose LEFTMOST column is the one the
// predicate constrains, so a column sitting SECOND in a composite is unindexed for every predicate that
// knows only that column — precisely the cascade parent-delete and the child lookup. Seven of the 37
// violations this gate was minted from were exactly that shape (`chat_participants.userId` covered only by
// UNIQUE(chatId, userId) — which left D18's "list my chats", pure membership by userId, table-scanning).
// A composite whose leading column IS the FK counts, so no table needs a redundant single-column twin.
//
// WHAT COUNTS AS AN INDEX (all four emit a real B-tree): `index("…").on(fk, …)` ·
// `uniqueIndex("…").on(fk, …)` · `primaryKey({ columns: [fk, …] })` · an inline `.primaryKey()`/`.unique()`
// on the column itself.
//
// NOT ANN, NOT VECTOR. This is plain B-tree only. `Tier-1-DB.md` §Esoteric #1 records the owner's hard
// rejection of a shadow ANN/DiskANN index on the `F32_BLOB` vector columns (~50× data bloat for a
// sub-millisecond exact scan); a vector column carries no `.references()` and is never in scope here.
//
// NO EXEMPTION MAP, deliberately. All 37 live violations were FIXED in the minting commit (gates land on a
// fixed tree), and every one had a real justifying access path — so there is no permanent deliberate
// exemption to carry, and an empty allowlist would be an untestable branch inviting debt parking. If a
// genuinely pure-cost case ever appears (an append-only table whose insert rate dwarfs any plausible
// cascade or lookup), it lands as a cited row here WITH its reason and its own mustPass example — not as a
// silent pass.
//
// DECLARED LIMIT (measured): the reader keys on the drizzle call SHAPE — `sqliteTable(name, {columns},
// (t) => [extras])` with a literal `.references(`/`.primaryKey(` in the column's builder chain. A table
// assembled through a helper (spread columns, a shared column factory) would read as having no FK and no
// index. Zero such tables exist (all 76 are written literally); the day one is introduced this gate goes
// quiet on it rather than wrong — which is why `db-structure` + the baseline parity stage remain the
// structural belts around it.
import type { SourceFile } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";
import { isSchemaFile, leadingIndexedColumns, referencingColumns, schemaTables } from "../schema-read.ts";

const MESSAGE =
  "a foreign-key column that does not LEAD any index — SQLite auto-indexes only the PARENT side of an FK, " +
  "so the child column is unindexed unless you say so: every parent delete (CASCADE / SET NULL / the " +
  "RESTRICT probe) full-scans this table, and so does every lookup by that column. A column sitting " +
  "SECOND in a composite does not count — SQLite only uses an index whose LEFTMOST column is the one " +
  "constrained. Tier-1-DB.md §Invariants.";

const FIX =
  'add a plain B-tree index whose FIRST column is the FK — `index("<table>_<col>_idx").on(t.<col>)` in ' +
  "the table's extras callback (an existing composite counts if the FK already leads it). Plain B-tree " +
  "only: no ANN/vector shadow index (Tier-1-DB.md §Esoteric #1). DDL changed ⇒ the baseline REGENERATES — " +
  "`pnpm --filter @orb/db exec drizzle-kit generate --name baseline` over a cleared migrations dir, then " +
  "biome-format the meta files (the `structure:db-baseline` stage is the proof).";

function checkFile(sf: SourceFile, ctx: GateRunCtx): void {
  for (const table of schemaTables(sf)) {
    const leading = leadingIndexedColumns(table);
    for (const column of referencingColumns(table)) {
      if (leading.has(column.name)) {
        continue;
      }
      ctx.report(column.node, { token: column.name, offset: 0 });
    }
  }
}

export const gate: GateDescriptor = {
  name: "fk-columns-indexed",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3) — Tier-1-DB.md §Invariants",
  status: "active",
  scopeSafety: "incremental-safe", // per-file: a table's FKs and its indexes are declared in the same call
  message: MESSAGE,
  fix: FIX,
  scanRoot: isSchemaFile,
  visitFile: checkFile,

  mustFlag: [
    {
      at: "packages/db/src/schema/chat.ts",
      files:
        'import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
        'export const messages = sqliteTable(\n  "messages",\n  {\n' +
        '    id: text("id").primaryKey(),\n' +
        '    chatId: text("chat_id").references(() => chats.id, { onDelete: "cascade" }),\n' +
        '    characterId: text("character_id").references(() => characters.id, { onDelete: "set null" }),\n' +
        "  },\n" +
        '  (t) => [index("messages_chat_idx").on(t.chatId)],\n);\n',
      expect: { count: 1, messageIncludes: "does not LEAD any index" },
      why: "the founding shape — an FK column with no index at all (`characterId`), beside a correctly-indexed sibling that must NOT flag",
    },
    {
      at: "packages/db/src/schema/chat.ts",
      files:
        'import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";\n' +
        'export const chatParticipants = sqliteTable(\n  "chat_participants",\n  {\n' +
        '    id: text("id").primaryKey(),\n' +
        '    chatId: text("chat_id").references(() => chats.id, { onDelete: "cascade" }),\n' +
        '    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),\n' +
        "  },\n" +
        '  (t) => [uniqueIndex("chat_participants_chat_user_unique").on(t.chatId, t.userId)],\n);\n',
      expect: { count: 1, messageIncludes: "SECOND in a composite" },
      why: "the LEADING-position arm, and the real defect the gate was minted from: `userId` is covered only as the SECOND column of a composite unique, which serves neither the user-delete cascade nor D18's membership read",
    },
    {
      at: "packages/db/src/schema/tag.ts",
      files:
        'import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
        'export const chatTags = sqliteTable(\n  "chat_tags",\n  {\n' +
        '    chatId: text("chat_id").references(() => chats.id, { onDelete: "cascade" }),\n' +
        '    tagId: text("tag_id").references(() => tags.id, { onDelete: "cascade" }),\n' +
        "  },\n" +
        "  (t) => [primaryKey({ columns: [t.chatId, t.tagId] })],\n);\n",
      expect: { count: 1, messageIncludes: "does not LEAD any index" },
      why: "a junction whose composite PK covers the FIRST FK only — the second junction leg still needs its own index (the `chat_tags_tag_idx` shape)",
    },
  ],
  mustPass: [
    {
      at: "packages/db/src/schema/chat.ts",
      files:
        'import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
        'export const messages = sqliteTable(\n  "messages",\n  {\n' +
        '    id: text("id").primaryKey(),\n' +
        '    characterId: text("character_id").references(() => characters.id, { onDelete: "set null" }),\n' +
        "  },\n" +
        '  (t) => [index("messages_character_idx").on(t.characterId)],\n);\n',
      why: "the sanctioned shape — one plain B-tree index leading with the FK column",
    },
    {
      at: "packages/db/src/schema/chat.ts",
      files:
        'import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";\n' +
        'export const messageVariants = sqliteTable(\n  "message_variants",\n  {\n' +
        '    id: text("id").primaryKey(),\n' +
        '    messageId: text("message_id").references(() => messages.id, { onDelete: "cascade" }),\n' +
        '    idx: text("idx"),\n' +
        "  },\n" +
        '  (t) => [uniqueIndex("message_variants_message_idx_unique").on(t.messageId, t.idx)],\n);\n',
      why: "a composite whose LEADING column is the FK — SQLite uses it for the messageId-only predicate, so no redundant single-column twin is demanded",
    },
    {
      at: "packages/db/src/schema/stats.ts",
      files:
        'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
        'export const ownerStats = sqliteTable("owner_stats", {\n' +
        '  ownerId: text("owner_id").primaryKey().references(() => users.id, { onDelete: "restrict" }),\n' +
        "});\n",
      why: "the FK IS the primary key (`owner_stats`) — an inline `.primaryKey()` is already a unique index on that column; demanding a second would be pure cost",
    },
    {
      at: "packages/db/src/schema/embeddings.ts",
      files:
        'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
        'export const characterEmbeddings = sqliteTable("character_embeddings", {\n' +
        '  id: text("id").primaryKey(),\n' +
        '  embedding: text("embedding"),\n' +
        "});\n",
      why: "a table with NO foreign key at all (the vector columns carry none) — the gate has nothing to say, and never reaches for an ANN index (Tier-1-DB.md §Esoteric #1)",
    },
  ],
};
