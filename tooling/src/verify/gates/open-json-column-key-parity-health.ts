// Policy: open-json-column-key-parity-health — hard blindness tripwire for the reviewed occurrence sibling.
// A loaded Drizzle schema that yields no JSON column means the reader/writer parity denominator vanished;
// the shared schema and parity facts remain the single visitor-fed derivation for both halves.
import { defineGate } from "../contract/policy.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { openJsonParityFact } from "../lib/open-json-parity-fact.ts";
import { drizzleSchemaFact } from "../lib/schema-fact.ts";

const SCHEMA_ANCHOR = "packages/db/src/schema/index.ts";
const MESSAGE =
  'open-json-column-key-parity: DERIVED NOTHING — no `text(..., { mode: "json" })` column was found in ' +
  "packages/db/src/schema/** on a tree that HAS a db schema. The column derivation is this family's whole " +
  "basis, so a green verdict would be a placebo (GATE-AUTHORING.md §4.6). Re-point the shared schema reader.";
const DRIZZLE_IMPORT = 'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n';

export const gate = defineGate({
  id: "open-json-column-key-parity-health",
  family: "open-json-column-key-parity",
  authority: "hard",
  severity: "error",
  population: { in: ["@db", "@server"], under: ["packages/db/src/schema/**", "packages/server/src/**"] },
  analysis: "types",
  execution: "entire-population",
  facts: [openJsonParityFact, drizzleSchemaFact],
  resources: [],
  message: MESSAGE,
  create: (ctx) => ({
    evaluate: () => {
      const parityFact = ctx.fact(openJsonParityFact);
      const schema = ctx.fact(drizzleSchemaFact).schema();
      if (schema.status === "empty") {
        ctx.receipt({ kind: "population", source: schema.receipt.source, members: schema.receipt.members });
        ctx.report.file(SCHEMA_ANCHOR, { line: 1, column: 1, token: "mode:json" });
        return;
      }
      recordReadySchemaFact(ctx, schema);
      const analysis = parityFact.analyze(schema.value);
      if (analysis.columns.length === 0) {
        ctx.report.file(SCHEMA_ANCHOR, { line: 1, column: 1, token: "mode:json" });
      }
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/index.ts": `${DRIZZLE_IMPORT}export const notes = sqliteTable("notes", { id: text("id") });\n`,
      },
      expect: { count: 1, token: "mode:json" },
      why: "the schema still resolves a table but the JSON-column denominator disappeared",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/index.ts": `${DRIZZLE_IMPORT}export const notes = sqliteTable("notes", { body: text("body", { mode: "json" }).$type<NoteBody>() });\n`,
      },
      why: "a closed JSON column still proves the parity family has a derived denominator even though the occurrence sibling only judges open columns",
    },
  ],
  mustRefuse: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/index.ts": `${DRIZZLE_IMPORT}const columns = makeColumns();\nexport const notes = sqliteTable("notes", columns);\n`,
      },
      expect: { messageIncludes: "drizzle schema fact unresolved" },
      why: "an unreadable canonical schema declaration cannot be softened into a missing JSON denominator",
    },
  ],
});
