// Entity ids in the Drizzle schema carry the canonical @orb/kit/ids phantom, and FK children carry the
// exact same brand as their parent column. The provider owns type/symbol identity; this policy owns intent.
//
// FAMILY `drizzle-schema` — the shared reader is `lib/schema-fact.ts` (`drizzleSchemaFact`), which owns
// Drizzle builder identity, the table/column model and the `$type<XId>()` override this policy judges.
// POPULATION PORT: an INTENTIONAL NARROWING OF THE WALKED SET over an IDENTICAL subject set. The legacy
// descriptor (fa56128359a0a5e107d1dde042dfe5c95001ec2f, the parent of the `32b66931e` conversion) declared
// `scopeSafety: "whole-project"` with NO `scanRoot` and filtered in-run on `path.includes(SCHEMA_DIR)`
// (`/packages/db/src/schema/`), so it loaded the whole harness project to judge one directory. The final
// declares the PROVIDER'S OWN `DRIZZLE_SCHEMA_POPULATION`, whose admitted set is that same directory —
// recorded once at that constant in `lib/schema-fact.ts`, with its one-path delta and positive control.
import { defineGate } from "../contract/policy.ts";
import type { SchemaColumn, SchemaTable } from "../contract/schema-fact.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { DRIZZLE_SCHEMA_POPULATION, drizzleSchemaFact } from "../lib/schema-fact.ts";

const MESSAGE =
  "a schema entity id is unbranded or an FK brand differs from its parent — Drizzle row types must preserve the canonical @orb/kit/ids identity across database reads and relationships.";
const FIX =
  "add the canonical `.$type<XId>()` from @orb/kit/ids; an FK must use the exact parent-column brand. For a deliberately plain identity, use an adjacent `@orb-waive schema-branding(<column>): <why + end condition>`.";
const ID_TYPES_PATH = "packages/kit/src/ids/index.ts";
const ID_TYPES =
  'declare const brand: unique symbol;\nexport type Branded<B extends string> = string & { readonly [brand]: B };\nexport type TypeIdOf<P extends string> = Branded<P>;\nexport type ChatId = TypeIdOf<"chat">;\nexport type UserId = Branded<"UserId">;\n';

function primaryBrandProblem(table: SchemaTable, column: SchemaColumn): string | null {
  return column.identity.propertyName === "id" && column.primaryKey && (column.typeOverride?.idBrand ?? null) === null
    ? `${table.sqlName}.${column.sqlName} is a primary-key entity id without a canonical @orb/kit/ids brand.`
    : null;
}

/** The BRAND-MISMATCH message. Both brands are `string` BY PARAMETER, which is what makes
 *  `foreignKeyBrandProblem`'s `parentBrand === null` acquittal a COMPILE-TIME obligation rather than a
 *  control-flow accident: deleting that clause makes this call a type error instead of silently shipping
 *  the sentence "carries null" to an author (wave 3 D8). `mustPass[5]` holds the same fence at the
 *  behavioural tier, so the narrowing is enforced on both rungs. */
function brandMismatch(column: SchemaColumn, parent: SchemaColumn, brand: string, parentBrand: string): string {
  return `${column.identity.table.declarationName}.${column.identity.propertyName} carries id brand ${brand}, but its parent ${parent.identity.table.declarationName}.${parent.identity.propertyName} carries ${parentBrand}.`;
}

function foreignKeyBrandProblem(column: SchemaColumn, columns: ReadonlyMap<string, SchemaColumn>): string | null {
  const parentIdentity = column.foreignKey?.parent;
  if (parentIdentity?.kind !== "population-column") {
    return null;
  }
  const parent = columns.get(parentIdentity.column.key);
  if (parent === undefined) {
    throw new Error(`schema-branding could not resolve parent column ${parentIdentity.column.key}`);
  }
  const parentBrand = parent.typeOverride?.idBrand ?? null;
  const brand = column.typeOverride?.idBrand ?? null;
  if (parentBrand === null || brand === parentBrand) {
    return null;
  }
  return brand === null
    ? `${column.identity.table.declarationName}.${column.identity.propertyName} references branded ${parent.identity.table.declarationName}.${parent.identity.propertyName} but carries no canonical id brand.`
    : brandMismatch(column, parent, brand, parentBrand);
}

export const gate = defineGate({
  id: "schema-branding",
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
      const columns = new Map(fact.value.tables.flatMap((table) => table.columns.map((column) => [column.identity.key, column] as const)));
      for (const table of fact.value.tables) {
        for (const column of table.columns) {
          const token = column.identity.propertyName;
          const message = primaryBrandProblem(table, column) ?? foreignKeyBrandProblem(column, columns);
          if (message !== null) {
            ctx.report.node(column.declaration, { token, offset: 0, message });
          }
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        [ID_TYPES_PATH]: ID_TYPES,
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const things = sqliteTable("things", { id: text("id").primaryKey() });\n',
      },
      expect: { count: 1, token: "id", messageIncludes: "without a canonical" },
      why: "a primary-key entity id without a canonical brand loses identity on DB reads",
    },
    {
      mode: "types",
      files: {
        [ID_TYPES_PATH]: ID_TYPES,
        "packages/db/src/schema/x.ts":
          'import type { ChatId } from "../../../kit/src/ids/index";\n' +
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'export const chats = sqliteTable("chats", { id: text("id").primaryKey().$type<ChatId>() });\n' +
          'export const messages = sqliteTable("messages", { chatId: text("chat_id").references(() => chats.id, { onDelete: "cascade" }) });\n',
      },
      expect: { count: 1, token: "chatId", messageIncludes: "carries no canonical" },
      why: "an FK to a branded parent must carry that brand",
    },
    {
      mode: "types",
      files: {
        [ID_TYPES_PATH]: ID_TYPES,
        "packages/db/src/schema/x.ts":
          'import type { ChatId, UserId } from "../../../kit/src/ids/index";\n' +
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'export const chats = sqliteTable("chats", { id: text("id").primaryKey().$type<ChatId>() });\n' +
          'export const messages = sqliteTable("messages", { chatId: text("chat_id").$type<UserId>().references(() => chats.id, { onDelete: "cascade" }) });\n',
      },
      expect: { count: 1, token: "chatId", messageIncludes: "but its parent" },
      why: "a different id brand is not equivalent merely because both values are strings",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [ID_TYPES_PATH]: ID_TYPES,
        "packages/db/src/schema/x.ts":
          'import type { ChatId } from "../../../kit/src/ids/index";\n' +
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'export const chats = sqliteTable("chats", { id: text("id").primaryKey().$type<ChatId>() });\n',
      },
      why: "a primary id using the canonical kit brand passes",
    },
    {
      mode: "types",
      files: {
        [ID_TYPES_PATH]: ID_TYPES,
        "packages/db/src/schema/x.ts":
          'import type { ChatId } from "../../../kit/src/ids/index";\n' +
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'export const chats = sqliteTable("chats", { id: text("id").primaryKey().$type<ChatId>() });\n' +
          'export const messages = sqliteTable("messages", { chatId: text("chat_id").$type<ChatId>().references(() => chats.id, { onDelete: "cascade" }) });\n',
      },
      why: "an FK carrying the exact parent brand passes",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/plain.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'export const plain = sqliteTable("plain", {\n' +
          "  // @orb-waive schema-branding(id): this natural identity is deliberately plain; ends if the table becomes an entity FK parent.\n" +
          '  id: text("id").primaryKey(),\n' +
          "});\n",
      },
      why: "a deliberate plain identity uses the one central positioned waiver grammar",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const things = sqliteTable("things", { id: text("id") });\n',
      },
      why: "THE PRIMARY-KEY FENCE (§4.1): a column named `id` that is NOT `.primaryKey()` and carries no brand must not flag — dropping `column.primaryKey` from `primaryBrandProblem`'s condition reds this row",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const things = sqliteTable("things", { code: text("code").primaryKey() });\n',
      },
      why: 'THE `id`-PROPERTY-NAME FENCE (§4.1): a primary-key column named anything OTHER than `id` and carrying no brand must not flag — dropping `column.identity.propertyName === "id"` reds this row',
    },
    {
      mode: "types",
      files: {
        [ID_TYPES_PATH]: ID_TYPES,
        "packages/db/src/schema/x.ts":
          'import type { ChatId } from "../../../kit/src/ids/index";\n' +
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'export const chats = sqliteTable("chats", { id: text("id").primaryKey().$type<ChatId>(), code: text("code") });\n' +
          'export const messages = sqliteTable("messages", { chatId: text("chat_id").$type<ChatId>().references(() => chats.code, { onDelete: "cascade" }) });\n',
      },
      why: "THE UNBRANDED-PARENT FENCE (§4.1): an FK column carrying a brand while its referenced PARENT column carries NONE must not flag — the parent's own lack of a brand is out of this policy's scope, not a mismatch. `chats.code` is neither `id`-named nor `primaryKey`, so it is silent under the primary-brand check and isolates this fence; dropping `parentBrand === null ||` from `foreignKeyBrandProblem`'s condition reds this row",
    },
  ],
});
