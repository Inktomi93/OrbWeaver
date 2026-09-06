// Every child-side foreign-key column leads a real Drizzle B-tree index. The shared schema fact owns
// canonical builder identity and imported/aliased column and extras resolution.

import { defineGate } from "../contract/policy.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { DRIZZLE_SCHEMA_POPULATION, drizzleSchemaFact } from "../lib/schema-fact.ts";

const MESSAGE =
  "a foreign-key column does not LEAD any B-tree index — SQLite indexes only the parent side, and a column second in a composite cannot serve child lookup or parent-delete probes. Tier-1-DB.md §Invariants.";
const FIX =
  "add a Drizzle `index` or `uniqueIndex` whose first term is the FK; an inline `.primaryKey()`/`.unique()` or leading composite `primaryKey` also counts. Then regenerate the baseline.";

export const gate = defineGate({
  id: "fk-columns-indexed",
  family: "drizzle-schema",
  authority: "hard",
  severity: "error",
  population: DRIZZLE_SCHEMA_POPULATION,
  analysis: "types",
  execution: "entire-population",
  facts: [drizzleSchemaFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const fact = ctx.fact(drizzleSchemaFact).schema();
      recordReadySchemaFact(ctx, fact);
      for (const table of fact.value.tables) {
        const leading = new Set(
          table.indexes.flatMap((index) => {
            const first = index.terms[0];
            return first?.kind === "column" ? [first.column.key] : [];
          }),
        );
        for (const column of table.columns) {
          if (column.foreignKey === null || column.primaryKey || column.unique || leading.has(column.identity.key)) {
            continue;
          }
          ctx.report.node(column.declaration, { token: column.identity.propertyName, offset: 0 });
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'export const chats = sqliteTable("chats", { id: text("id").primaryKey() });\n' +
          'const chatId = text("chat_id").references(() => chats.id, { onDelete: "cascade" });\n' +
          'export const messages = sqliteTable("messages", { id: text("id").primaryKey(), chatId });\n',
      },
      expect: { count: 1, token: "chatId" },
      why: "a shorthand FK remains an index obligation",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/parents.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chats = sqliteTable("chats", { id: text("id").primaryKey() });\n',
        "packages/db/src/schema/chat-columns.ts":
          'import { text } from "drizzle-orm/sqlite-core";\nimport { chats } from "./parents";\nexport const messageColumns = { id: text("id").primaryKey(), chatId: text("chat_id").references(() => chats.id, { onDelete: "cascade" }) };\n',
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable } from "drizzle-orm/sqlite-core";\nimport { messageColumns } from "./chat-columns";\nexport const messages = sqliteTable("messages", messageColumns);\n',
      },
      expect: { count: 1, token: "chatId" },
      why: "an FK in an imported columns object remains an index obligation",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'export const chats = sqliteTable("chats", { id: text("id").primaryKey() });\n' +
          'export const characters = sqliteTable("characters", { id: text("id").primaryKey() });\n' +
          'export const messages = sqliteTable("messages", { chatId: text("chat_id").references(() => chats.id, { onDelete: "cascade" }), characterId: text("character_id").references(() => characters.id, { onDelete: "set null" }) }, (t) => [index("messages_chat_idx").on(t.chatId)]);\n',
      },
      expect: { count: 1, token: "characterId" },
      why: "one indexed sibling cannot cover another FK",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";\n' +
          'export const chats = sqliteTable("chats", { id: text("id").primaryKey() });\n' +
          'export const users = sqliteTable("users", { id: text("id").primaryKey() });\n' +
          'export const participants = sqliteTable("participants", { chatId: text("chat_id").references(() => chats.id, { onDelete: "cascade" }), userId: text("user_id").references(() => users.id, { onDelete: "cascade" }) }, (t) => [uniqueIndex("chat_user_unique").on(t.chatId, t.userId)]);\n',
      },
      expect: { count: 1, token: "userId" },
      why: "the second term of a composite does not lead the index",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/tag.ts":
          'import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'export const chats = sqliteTable("chats", { id: text("id").primaryKey() });\n' +
          'export const tags = sqliteTable("tags", { id: text("id").primaryKey() });\n' +
          'export const chatTags = sqliteTable("chat_tags", { chatId: text("chat_id").references(() => chats.id, { onDelete: "cascade" }), tagId: text("tag_id").references(() => tags.id, { onDelete: "cascade" }) }, (t) => [primaryKey({ columns: [t.chatId, t.tagId] })]);\n',
      },
      expect: { count: 1, token: "tagId" },
      why: "a composite primary key covers only its leading FK for single-column lookup",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'export const chats = sqliteTable("chats", { id: text("id").primaryKey() });\n' +
          'const chatId = text("chat_id").references(() => chats.id, { onDelete: "cascade" });\n' +
          'export const messages = sqliteTable("messages", { id: text("id").primaryKey(), chatId }, (t) => [index("messages_chat_idx").on(t.chatId)]);\n',
      },
      why: "an indexed shorthand FK passes",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";\n' +
          'export const messages = sqliteTable("messages", { id: text("id").primaryKey() });\n' +
          'export const variants = sqliteTable("variants", { messageId: text("message_id").references(() => messages.id, { onDelete: "cascade" }), idx: text("idx") }, (t) => [uniqueIndex("message_idx_unique").on(t.messageId, t.idx)]);\n',
      },
      why: "an FK that leads a composite unique index passes",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/tag.ts":
          'import * as sqliteCore from "drizzle-orm/sqlite-core";\n' +
          'export const characters = sqliteCore.sqliteTable("characters", { id: sqliteCore.text("id").primaryKey() });\n' +
          'export const tags = sqliteCore.sqliteTable("tags", { id: sqliteCore.text("id").primaryKey() });\n' +
          'export const characterTags = sqliteCore.sqliteTable("character_tags", { characterId: sqliteCore.text("character_id").references(() => characters.id, { onDelete: "cascade" }), tagId: sqliteCore.text("tag_id") }, (t) => [sqliteCore.primaryKey({ columns: [t.characterId, t.tagId] })]);\n',
      },
      why: "a namespace-qualified composite key covers its leading FK",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/stats.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const users = sqliteTable("users", { id: text("id").primaryKey() });\nexport const ownerStats = sqliteTable("owner_stats", { ownerId: text("owner_id").primaryKey().references(() => users.id, { onDelete: "restrict" }) });\n',
      },
      why: "an FK that is itself the primary key already has a unique B-tree",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/embeddings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const embeddings = sqliteTable("embeddings", { id: text("id").primaryKey(), embedding: text("embedding") });\n',
      },
      why: "a table with no foreign keys has no child-index obligation",
    },
  ],
});
