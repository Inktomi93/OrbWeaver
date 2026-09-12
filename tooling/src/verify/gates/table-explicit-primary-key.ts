// Every Drizzle table declares a primary key instead of falling back to SQLite's hidden rowid. The shared
// schema fact owns call identity, imported columns and extras resolution; this policy only judges the fact.
//
// FAMILY `drizzle-schema` — the shared reader is `lib/schema-fact.ts` (`drizzleSchemaFact`), which owns
// Drizzle builder identity and the table/column model for every member.
// POPULATION PORT: an INTENTIONAL WIDENING BY EXACTLY ONE PATH, lossless. The legacy descriptor
// (f2e1e2f3d41d02e1443072d009b19012b4762b44, the parent of the `fa5612835` conversion) scoped with
// `scanRoot: isSchemaFile`; the final declares the PROVIDER'S OWN `DRIZZLE_SCHEMA_POPULATION`. The delta,
// its one path and its positive control are recorded once at that constant in `lib/schema-fact.ts`.

import { defineGate } from "../contract/policy.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { DRIZZLE_SCHEMA_POPULATION, drizzleSchemaFact } from "../lib/schema-fact.ts";

const MESSAGE =
  "a `sqliteTable` has no PRIMARY KEY — SQLite's hidden rowid is unstable across VACUUM, invisible to `$inferSelect`, and cannot participate in the inherited ownership chain. Tier-1-DB.md §Invariants.";
const FIX = "declare an inline `.primaryKey()` or a Drizzle `primaryKey({ columns: [...] })` in the extras callback, then regenerate the baseline.";

export const gate = defineGate({
  id: "table-explicit-primary-key",
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
        const hasPrimaryKey = table.columns.some((column) => column.primaryKey) || table.indexes.some((index) => index.kind === "primary-key");
        if (!hasPrimaryKey) {
          const name = table.declaration.getNameNode();
          ctx.report.node(name, { token: table.identity.declarationName, offset: 0 });
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chatLocks = sqliteTable("chat_locks", { chatId: text("chat_id"), holder: text("holder") });\n',
      },
      expect: { count: 1, token: "chatLocks" },
      why: "a keyless table silently falls back to rowid",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/tag.ts":
          'import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'export const characterTags = sqliteTable("character_tags", { characterId: text("character_id"), tagId: text("tag_id") }, (t) => [index("tag_idx").on(t.tagId)]);\n',
      },
      expect: { count: 1, token: "characterTags" },
      why: "an index does not substitute for a primary key",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chats = sqliteTable("chats", { id: text("id").primaryKey(), title: text("title") });\n',
      },
      why: "an inline primary key is the entity-table norm",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/tag.ts":
          'import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'export const characterTags = sqliteTable("character_tags", { characterId: text("character_id"), tagId: text("tag_id") }, (t) => [primaryKey({ columns: [t.characterId, t.tagId] })]);\n',
      },
      why: "a composite primary key is the junction-table norm",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/tag.ts":
          'import * as sqliteCore from "drizzle-orm/sqlite-core";\n' +
          'export const characterTags = sqliteCore.sqliteTable("character_tags", { characterId: sqliteCore.text("character_id"), tagId: sqliteCore.text("tag_id") }, (t) => [sqliteCore.primaryKey({ columns: [t.characterId, t.tagId] })]);\n',
      },
      why: "namespace imports preserve canonical Drizzle builder identity",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/tag.ts":
          'import { primaryKey as sqlitePrimaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'export const characterTags = sqliteTable("character_tags", { characterId: text("character_id"), tagId: text("tag_id") }, (t) => [sqlitePrimaryKey({ columns: [t.characterId, t.tagId] })]);\n',
      },
      why: "a named import retains identity through a local alias",
    },
  ],
});
