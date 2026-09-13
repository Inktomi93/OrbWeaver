// Every Drizzle foreign key states its deletion policy explicitly. The shared schema fact owns call
// identity, imported columns, aliases, and fail-closed option parsing; this policy only judges the fact.
//
// FAMILY `drizzle-schema` — the shared reader is `lib/schema-fact.ts` (`drizzleSchemaFact`), which owns
// Drizzle builder identity and the table/column model for every member.
// POPULATION PORT: an INTENTIONAL WIDENING BY EXACTLY ONE PATH, lossless. The legacy descriptor
// (f2e1e2f3d41d02e1443072d009b19012b4762b44, the parent of the `fa5612835` conversion) scoped with
// `scanRoot: isSchemaFile`; the final declares the PROVIDER'S OWN `DRIZZLE_SCHEMA_POPULATION`. The delta,
// its one path and its positive control are recorded once at that constant in `lib/schema-fact.ts`.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `fk-ondelete-stated` descriptor at f2e1e2f3d41d02e1443072d009b19012b4762b44, the parent of the conversion
// `fa5612835` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,128 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot`
// admits 29 and final `population` admits 30. legacy − final = ∅. final − legacy =
// {`packages/db/src/schema/index.ts`} — the schema barrel, which the legacy `isSchemaFile` excluded and
// `DRIZZLE_SCHEMA_POPULATION` admits; the intentional one-path widening recorded at that constant. Controls: inside
// `packages/db/src/schema/__cbbhr_in_assets.ts` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.

import { defineGate } from "../contract/policy.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { DRIZZLE_SCHEMA_POPULATION, drizzleSchemaFact } from "../lib/schema-fact.ts";

const MESSAGE =
  "a `.references(...)` has no `onDelete` action — SQLite's silent default is `NO ACTION`, a real policy that must be stated at the column. Tier-1-DB.md §Invariants.";
const FIX =
  'pass `{ onDelete: "cascade" | "set null" | "restrict" | "no action" }` to `.references(...)`, choosing ' +
  "what the child row means without its parent; then regenerate the baseline. A deliberate site is waived " +
  "with `@orb-waive fk-ondelete-stated(<position>): <reason>` on the line above, where <position> is the FK " +
  "column's own property name (e.g. `chatId`).";

export const gate = defineGate({
  id: "fk-ondelete-stated",
  family: "drizzle-schema",
  authority: "ordinary",
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
        for (const column of table.columns) {
          if (column.foreignKey?.onDelete.kind === "unspecified") {
            ctx.report.node(column.declaration, { token: column.identity.propertyName, offset: 0 });
          }
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
          'export const messages = sqliteTable("messages", { chatId: text("chat_id").references(() => chats.id) });\n',
      },
      expect: { count: 1, token: "chatId" },
      why: "an FK with no options silently inherits NO ACTION",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'export const chats = sqliteTable("chats", { id: text("id").primaryKey() });\n' +
          'export const messages = sqliteTable("messages", { chatId: text("chat_id").references(() => chats.id, {}) });\n',
      },
      expect: { count: 1, token: "chatId" },
      why: "an options object without onDelete still leaves the policy unstated",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'export const chats = sqliteTable("chats", { id: text("id").primaryKey() });\n' +
          'export const messages = sqliteTable("messages", {\n' +
          '  chatId: text("chat_id").references(() => chats.id, { onDelete: "cascade" }),\n' +
          '  parentId: text("parent_id").references(() => messages.chatId, { onDelete: "set null" }),\n' +
          "});\n",
      },
      why: "each FK names its deletion policy",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/plugin.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'export const assets = sqliteTable("assets", { id: text("id").primaryKey() });\n' +
          'export const plugins = sqliteTable("plugins", { bundleAssetId: text("bundle_asset_id").references(() => assets.id, { onDelete: "restrict", onUpdate: "cascade" }) });\n',
      },
      why: "restrict is explicit and sibling reference options are irrelevant",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'export const chats = sqliteTable("chats", { id: text("id").primaryKey() });\n' +
          "// @orb-waive fk-ondelete-stated(chatId): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          'export const messages = sqliteTable("messages", { chatId: text("chat_id").references(() => chats.id) });\n',
      },
      why: "POSITIONAL IDENTITY: the report anchors on the COLUMN DECLARATION at offset 0 and its token is the schema fact's `column.identity.propertyName`, so an author waives the property name `chatId` — never the SQL name `chat_id` or the `references` call. The fixture is mustFlag[0] (:47, count 1) plus the marker line; the marker suppresses the finding that row proves this fixture produces, and it ends if that row changes",
    },
  ],
});
