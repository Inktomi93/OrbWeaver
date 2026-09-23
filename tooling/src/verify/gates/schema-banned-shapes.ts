// The SCHEMA partition of the ledger's rejected shapes (D18/D25/D26/D27/D28/D36/D58), judged on the shared
// Drizzle fact: tables by SQL name, columns by the identity the authored schema object declares. The fact
// owns builder/alias/import/spread resolution, so an imported columns object or a shorthand member is the
// same obligation as an inline property. The contract partition is `contract-banned-shapes`; the D12 import
// ban is biome's native `noRestrictedImports`. Rows + the message: ../lib/ledger-banned-shapes.ts.
// HARD by design: a ledger verdict's only escape is contesting the D-cite, never a site comment.
//
// FAMILY `drizzle-schema` — the shared reader is `lib/schema-fact.ts` (`drizzleSchemaFact`), which owns
// Drizzle builder identity and the table/column model. `../lib/ledger-banned-shapes.ts` is the shared
// VOCABULARY (the rows and their D-cite text), not the family key: it is consumed by two policies that
// read DIFFERENT SUBJECTS, which is exactly why `contract-banned-shapes` is a singleton under its own id.
// POPULATION PORT: byte-identical. The legacy descriptor declared `scopeSafety: "whole-project"` and
// filtered in-run on `/\/packages\/db\/src\/schema\//`; the final declares the PROVIDER'S OWN
// `DRIZZLE_SCHEMA_POPULATION`, whose admitted set is that same directory, barrel included. The family's
// one-path delta against the other legacy spelling is recorded at that constant in `lib/schema-fact.ts`.
//
// The legacy `schema-banned-shapes` descriptor (0593a6a6cbd151faa088ddd3f9cbaca0ce69b4ef — the PARENT of
// the `1bf7ff7d9` split commit, verified 2026-09-12 to hold a `GateDescriptor` at this path) checked both
// this schema partition and the contract partition (now `contract-banned-shapes`) in one combined gate
// with its own inline schema read before this split.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `schema-banned-shapes` descriptor at 0593a6a6cbd151faa088ddd3f9cbaca0ce69b4ef, the parent of the conversion
// `1bf7ff7d9` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,137 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy harness
// dispatch (no `scanRoot`) admits 7,137 and final `population` admits 30. legacy − final = 7,107 harness sources
// outside `packages/db/src/schema/` — read by the combined module's contract and import arms, which left for
// `contract-banned-shapes` and biome; the schema arm itself tested `SCHEMA_DIR`. final − legacy = ∅. Controls: inside
// `packages/db/src/schema/__cbbhr_in_assets.ts` (virtual) admitted by both; outside `docs/__cbbhr_out_control.ts`
// (virtual) rejected by both.
// OUTSIDE-CONTROL CAVEAT (verifier cb-v-header-residue): `docs/__cbbhr_out_control.ts` is rejected by `harnessGlobs`,
// not by the legacy descriptor — which has no path predicate of its own and admits it — so it proves only that
// neither side reaches outside the harness corpus, not that the legacy filter discriminates.

import type { SchemaBannedShape } from "../contract/ledger-banned-shapes.ts";
import { defineGate } from "../contract/policy.ts";
import type { SchemaColumn, SchemaTable } from "../contract/schema-fact.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { bannedMessage, SCHEMA_BANNED_SHAPES } from "../lib/ledger-banned-shapes.ts";
import { DRIZZLE_SCHEMA_POPULATION, drizzleSchemaFact } from "../lib/schema-fact.ts";

const MESSAGE =
  "a ledger-REJECTED schema shape has been reintroduced — the ledger killed this table/column by name; drop it or contest the D-cite in its docs/adr/ decision (every row and its cite: tooling/src/verify/lib/ledger-banned-shapes.ts).";
const FIX = "remove the banned column (or the whole table) — the ledger row names the correct home for the concern.";

/** Does this column match a column / column-pattern row? The subject is the PROPERTY name, which is the
 *  identity a reintroduction re-spells; the fact already resolved it through shorthand, spread, alias and
 *  imported-columns-object shapes. */
function columnHit(shape: Exclude<SchemaBannedShape, { readonly kind: "table" }>, column: SchemaColumn): boolean {
  return shape.kind === "column" ? column.identity.propertyName === shape.column : shape.pattern.test(column.identity.propertyName);
}

function columnLabel(shape: Exclude<SchemaBannedShape, { readonly kind: "table" }>): string {
  return shape.kind === "column" ? `\`${shape.table}.${shape.column}\`` : shape.label;
}

interface BannedShapeFinding {
  readonly node: SchemaTable["declaration"] | SchemaColumn["declaration"];
  readonly token: string;
  readonly message: string;
}

/** Every rejected shape this table reintroduces, one finding per OCCURRENCE (two banned columns on one
 *  table are two findings, never one summary row). */
function tableFindings(table: SchemaTable): readonly BannedShapeFinding[] {
  return SCHEMA_BANNED_SHAPES.filter((shape) => shape.table === table.sqlName).flatMap((shape) => {
    if (shape.kind === "table") {
      return [{ node: table.declaration, token: table.identity.declarationName, message: bannedMessage(`the \`${shape.table}\` table`, shape.cite) }];
    }
    return table.columns
      .filter((column) => columnHit(shape, column))
      .map((column) => ({ node: column.declaration, token: column.identity.propertyName, message: bannedMessage(columnLabel(shape), shape.cite) }));
  });
}

export const gate = defineGate({
  id: "schema-banned-shapes",
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
        for (const finding of tableFindings(table)) {
          // The token is the DECLARED identity, which is not always at offset 0 of the declaration text (a
          // computed-key member spells it inside a string literal), so the offset is located rather than
          // assumed; an identity the authored text does not carry verbatim falls back to the runtime's own
          // derived anchor instead of throwing.
          const offset = finding.node.getText().indexOf(finding.token);
          if (offset < 0) {
            ctx.report.node(finding.node, { message: finding.message });
          } else {
            ctx.report.node(finding.node, { token: finding.token, offset, message: finding.message });
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
          'const activePresetId = text("active_preset_id");\n' +
          'export const chats = sqliteTable("chats", { activePresetId });\n',
      },
      expect: { count: 1, token: "activePresetId", messageIncludes: "D58" },
      why: "THE #1035 SHORTHAND RED: a ledger-REJECTED column reintroduced as a shorthand member — the ban reads the RESOLVED column identity, never the written member kind",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x-columns.ts":
          'import { text } from "drizzle-orm/sqlite-core";\nexport const chatColumns = { activePresetId: text("active_preset_id") };\n',
        "packages/db/src/schema/x.ts":
          'import { sqliteTable } from "drizzle-orm/sqlite-core";\nimport { chatColumns } from "./x-columns";\nexport const t = sqliteTable("chats", chatColumns);\n',
      },
      expect: { count: 1, token: "activePresetId", messageIncludes: "D58" },
      why: "THE #945 IMPORTED-COLUMNS RED: the column ban (the arm carrying the D-cite for this shape) used to read ZERO columns behind an imported columns object and pass",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import * as core from "drizzle-orm/sqlite-core";\nexport const chats = core.sqliteTable("chats", { ownerId: core.text("owner_id") });\n',
      },
      expect: { count: 1, token: "ownerId", messageIncludes: "D18" },
      why: "chats.ownerId — the ledger DROPPED it (D18, chats are membership-scoped); the namespace-qualified builder is the same shape, not a different one",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/message.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("messages", { content: text("content") });\n',
      },
      expect: { count: 1, token: "content", messageIncludes: "D26" },
      why: "a messages economics column (content) — messages is a pure slot (D26)",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("chats", { activePresetId: text("active_preset_id") });\n',
      },
      expect: { count: 1, token: "activePresetId", messageIncludes: "D58" },
      why: "a chats.*presetId* column-pattern — never bind a preset to a chat (D58)",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chats = sqliteTable("chats", { ["memoryEnabled"]: text("memory_enabled") });\n',
      },
      expect: { count: 1, token: "memoryEnabled", messageIncludes: "D36" },
      why: "a COMPUTED-KEY column member is the same declared identity — a dot-only reader would answer 'not my subject' (the #1506 respelling class)",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characterVersions = sqliteTable("character_versions", { id: text("id").primaryKey() });\n',
      },
      expect: { count: 1, token: "characterVersions", messageIncludes: "D28" },
      why: "a character_versions table — the card is a flat characters row (D28); the finding anchors on the table declaration rather than the legacy line-1 stub",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'export const chats = sqliteTable("chats", { id: text("id").primaryKey(), ownerId: text("owner_id"), sessionId: text("session_id") });\n',
      },
      expect: { count: 2 },
      why: "two banned columns on one table are TWO findings — a per-occurrence verdict, not one summary row",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const rooms = sqliteTable("chats", { ownerId: text("owner_id") });\n',
      },
      expect: { count: 1, token: "ownerId", messageIncludes: "D18" },
      why: "DIFFERENT DECLARATION NAME, SAME TABLE: the binding is `rooms` but the SQL table is `chats`, which is what D18 ruled on — renaming the JS const must not launder the ban",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'const OWNER = "ownerId";\n' +
          'export const chats = sqliteTable("chats", { [OWNER]: text("owner_id") });\n',
      },
      expect: { count: 1, token: "OWNER", messageIncludes: "D18" },
      why: 'THE NON-VERBATIM IDENTITY: a computed key bound to a module constant resolves to the property name `ownerId`, which the declaration text `[OWNER]: text("owner_id")` does not carry — so `indexOf` returns -1 and the fallback anchor is taken. THE ROW THAT DIES WITHOUT the `offset < 0` branch: with it neutered, `report.node` is handed a token that is not authored text at the reported offset and THROWS',
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nconst title = text("title");\nexport const chats = sqliteTable("chats", { title });\n',
      },
      why: "the SHORTHAND's green twin: an ordinary column as a shorthand member is not a banned shape — resolving the member kind widens the obligation set, never the accusation",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'export const c = sqliteTable("chats", { id: text("id"), hostUserId: text("host_user_id") });\n' +
          'export const m = sqliteTable("messages", { id: text("id"), role: text("role") });\n',
      },
      why: "born-compliant chats/messages slots — no rejected shape, passes",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/other.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const rooms = sqliteTable("rooms", { ownerId: text("owner_id"), activePresetId: text("active_preset_id") });\n',
      },
      why: "DECLARED LIMIT / no-false-positive: the bans are TABLE-SCOPED by SQL name — an `ownerId` or a `*presetId` on a table the ledger never ruled on is ordinary schema (`ownerid-registry` owns the ownership question)",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chats = sqliteTable("rooms", { ownerId: text("owner_id") });\n',
      },
      why: "the counterfactual's green twin: a binding spelled `chats` creating the SQL table `rooms` is NOT the ruled table — together with the mustFlag above this pins the verdict to the SQL name in both directions",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/message.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const variants = sqliteTable("message_variants", { content: text("content"), model: text("model"), costUsd: text("cost_usd") });\n',
      },
      why: "the D26 economics columns on `message_variants` are their CORRECT home — the ban names the slot table, and this row is the written baseline of that boundary",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chats = sqliteTable("chats", { presetLabel: text("preset_label") });\n',
      },
      why: "DECLARED LIMIT: the D58 pattern is `presetId`, not the word `preset` — a label column naming a preset is not a per-chat preset BINDING",
    },
  ],
});
