// The shared Drizzle fact is an instrument: empty or unresolved schema identity is a broken checker.
import { defineGate } from "../contract/policy.ts";
import { DRIZZLE_SCHEMA_POPULATION, drizzleSchemaFact } from "../lib/schema-fact.ts";

const MESSAGE = "shared Drizzle schema fact is incomplete — schema policy verdicts are withheld until every table, column, foreign key, and index resolves.";

export const gate = defineGate({
  id: "schema-fact-health",
  family: "drizzle-schema",
  authority: "hard",
  severity: "error",
  population: DRIZZLE_SCHEMA_POPULATION,
  analysis: "types",
  execution: "entire-population",
  facts: [drizzleSchemaFact],
  resources: [],
  message: MESSAGE,
  fix: "restore the missing canonical declaration or rewrite the dynamic, mutated, or ambiguous schema shape through the supported Drizzle seams.",
  create: (ctx) => ({
    evaluate: () => {
      const fact = ctx.fact(drizzleSchemaFact).schema();
      ctx.receipt({ kind: "population", source: "schema-fact-health", members: 1 });
      if (fact.status !== "ready") {
        const anchor = ctx.files[0];
        if (anchor === undefined) {
          throw new Error("schema fact health received an empty effective source population");
        }
        ctx.report.file(ctx.relativePath(anchor), { message: `${MESSAGE} drizzle schema fact ${fact.status}: ${fact.reason}` });
      }
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: { "packages/db/src/schema/probe.ts": "export const noSchemaTable = true;\n" },
      expect: { count: 1, messageIncludes: "shared Drizzle schema fact is incomplete" },
      why: "a schema population with no canonical Drizzle table is a blind instrument, not a clean verdict",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/probe.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          "const fake = { primaryKey: (value: unknown) => value };\n" +
          'export const probe = sqliteTable("probe", { id: text("id") }, (t) => [fake.primaryKey({ columns: [t.id] })]);\n',
      },
      expect: { count: 1, messageIncludes: "shared Drizzle schema fact is incomplete" },
      why: "an impostor builder makes the fact unresolved instead of manufacturing schema evidence",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/probe.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const probe = sqliteTable("probe", { id: text("id").primaryKey() });\n',
      },
      why: "a nonempty fully resolved Drizzle schema census is healthy; sibling policies judge its semantics",
    },
  ],
});
