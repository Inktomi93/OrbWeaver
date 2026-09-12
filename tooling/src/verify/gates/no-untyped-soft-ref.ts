// Policy: no-untyped-soft-ref (Core-Path-Registry.md D24, with D37) — an id-shaped schema column carries a
// `.references()` FK. Boundaries are physics: a soft ref (an id column with no FK, kept coherent by a
// hand-rolled sweep) is the shape D24 outlawed.
//
// AUTHORITY IS reviewed-grant, and the SUBJECT IS THE PAIR, not a file. The legacy `SOFT_REF_ALLOWLIST`
// keyed six `table.column` pairs, each a permanent semantic ruling that the referent is not an
// orbweaver row at all (an append-only log's polymorphic entity, an external IdP subject, an SDK resume
// handle, an upstream generation id, two code-tuple catalogue ids). Those are recurring repository
// PERMISSIONS, so each is one exact `(subject, operation)` row in `lib/reviewed-grants.ts` with `why`
// and `endsWhen`, keyed on the SQL `table.column` pair exactly as the ledger decided it — a grant keyed
// on a FILE would move with the schema module and license whatever else landed there.
//
// THE STALE ARM IS GONE, AND NOTHING WAS LOST. Legacy re-implemented liveness by hand: a `finalize` hook
// that compared the allowlist against a per-run `seenSoftPairs` set, guarded on the schema BARREL being
// loaded so a synthetic fileset could not report all six rows as stale. Central reconciliation owns both
// halves now — a row consumed zero times after a complete owner run is STALE and a row matching more than
// one finding is OVER-BROAD — and the guard is structural rather than hand-rolled: the shared
// `drizzleSchemaFact` refuses unless the whole declared schema population resolved, so an incomplete
// denominator withholds the policy instead of mis-judging its rows.
//
// IDENTITY, NOT SPELLING, on every axis, through the shared fact: the column BUILDER is the resolved
// `drizzle-orm/sqlite-core` export rather than the leading identifier of a `text("x").a().b()` chain, the
// FK is the resolved `.references()` operation rather than a `.includes(".references(")` text probe, and
// the primary-key exemption is the resolved operation rather than `.includes(".primaryKey(")`. The
// imported/spread columns object (#945) and the shorthand member (#1035) are the fact's own resolution.
import { defineGate } from "../contract/policy.ts";
import type { SchemaColumn, SchemaModel } from "../contract/schema-fact.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";
import { DRIZZLE_SCHEMA_POPULATION, drizzleSchemaFact } from "../lib/schema-fact.ts";

const OPERATION = "soft-reference";
const ID_KEY = /Id$/u;
/** The two scalar builders an orbweaver id column is ever declared with. */
const ID_COLUMN_BUILDERS: ReadonlySet<string> = new Set(["text", "integer"]);

const MESSAGE =
  "an id-shaped column (its JS key ends `Id`) carries NO `.references()` FK — a soft ref is banned: " +
  "boundaries are physics, FK-enforced (D24). Add the FK, or, if the referent is genuinely not an " +
  "orbweaver row, take an exact reviewed grant naming the table.column pair. See Core-Path-Registry.md D24.";
const UNREADABLE = MESSAGE;
const FIX = "add the `.references(() => target.id)` FK; a genuinely non-relational id column takes an exact reviewed grant with its D-cite.";

/** Is this an id-shaped column with no FK — the D24 subject? */
function isSoftReference(column: SchemaColumn): boolean {
  return ID_KEY.test(column.identity.propertyName) && ID_COLUMN_BUILDERS.has(column.builder.exportedName) && !column.primaryKey && column.foreignKey === null;
}

/** Every soft reference in the ready schema, as a grant candidate keyed on the SQL `table.column` pair. */
function softReferences(schema: SchemaModel): readonly ReviewedGrantCandidate[] {
  return schema.tables.flatMap((table) =>
    table.columns.filter(isSoftReference).map((column) => {
      const name = column.identity.propertyName;
      return {
        node: column.declaration,
        subject: `${table.sqlName}.${name}`,
        operation: OPERATION,
        token: name,
        offset: Math.max(column.declaration.getText().indexOf(name), 0),
      };
    }),
  );
}

export const gate = defineGate({
  id: "no-untyped-soft-ref",
  family: "drizzle-schema",
  authority: "reviewed-grant",
  severity: "error",
  population: DRIZZLE_SCHEMA_POPULATION,
  analysis: "types",
  execution: "entire-population",
  facts: [drizzleSchemaFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: (): void => {
      const fact = ctx.fact(drizzleSchemaFact).schema();
      recordReadySchemaFact(ctx, fact);
      reportReviewedGrantCandidates(ctx.report, softReferences(fact.value), { message: MESSAGE, fix: FIX, unreadableMessage: UNREADABLE });
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("t", { widgetId: text("widget_id") });\n',
      },
      expect: { count: 1, token: "widgetId" },
      why: "the founding shape — a `*Id` text column with no `.references()` FK and no grant row",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nconst widgetId = text("widget_id");\nexport const t = sqliteTable("t", { widgetId });\n',
      },
      expect: { count: 1, token: "widgetId" },
      why: "THE #1035 SHORTHAND RED: the same column written as a shorthand member — the keystroke that used to empty this gate's subject",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x-columns.ts": 'import { text } from "drizzle-orm/sqlite-core";\nexport const tColumns = { widgetId: text("widget_id") };\n',
        "packages/db/src/schema/x.ts":
          'import { sqliteTable } from "drizzle-orm/sqlite-core";\nimport { tColumns } from "./x-columns.ts";\nexport const t = sqliteTable("t", tColumns);\n',
      },
      expect: { count: 1, token: "widgetId" },
      why: "THE #945 IMPORTED-COLUMNS RED: the obligation reached through an imported columns object, anchored on the column's DECLARING file",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const audit = sqliteTable("audit_logs", { entityId: text("entity_id") });\n',
      },
      expect: { count: 1 },
      why: "THE PERMISSION IS NOT A CARVE-OUT IN THE RULE: the sole D24 sanctioned pair reds like any other soft ref and is licensed by its exact grant row, so a SECOND soft ref on the same table is a finding until someone reviews it",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const w = sqliteTable("w", { id: text("id").primaryKey() });\nexport const t = sqliteTable("t", { widgetId: text("widget_id").references(() => w.id) });\n',
      },
      why: "the fix: the id column carries its FK, resolved as a Drizzle `.references()` operation rather than found by a text probe",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const w = sqliteTable("w", { id: text("id").primaryKey() });\nconst widgetId = text("widget_id").references(() => w.id);\nexport const t = sqliteTable("t", { widgetId });\n',
      },
      why: "the SHORTHAND's green twin: resolving the member kind widens the obligation set, never the accusation",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("t", { id: text("id").primaryKey(), name: text("name") });\n',
      },
      why: "neither column is in subject at all: `id` does not match the `/Id$/` key shape and `name` is not id-named, so this row exits at the KEY test and never reaches the pk clause. It is the founding shape's green twin, and its `why` used to claim the primary-key exemption — which the row below is what actually proves",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("t", { widgetId: text("widget_id").primaryKey() });\n',
      },
      why: "THE PRIMARY-KEY EXEMPTION (`!column.primaryKey`), and it is the only row that reaches it: the key ends `Id`, the builder is `text`, and there is no `.references()` — every other clause of `isSoftReference` says FINDING, so the pk operation alone acquits it. A row's own key IS its referent, so D24's FK obligation cannot apply to it. Cut the clause and this row flags. The exemption is the RESOLVED drizzle operation, never a `.includes(\".primaryKey(\")` text probe",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, blob } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("t", { widgetId: blob("widget_id") });\n',
      },
      why: "DECLARED NARROWING: an id-named column built by something other than `text`/`integer` is not the scalar-id shape D24 rules, and the builder is proven by its drizzle export rather than by the leading identifier of the chain",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("t", { widget: text("widget") });\n',
      },
      why: "a column whose key does not end in `Id` is outside the subject — the pair identity is the JS key, exactly as D24 states it",
    },
  ],
});
