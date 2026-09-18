// Policy: json-column-write-parity-health — hard instrument-health sibling for the reviewed JSON writer
// policy. It keeps all three legacy fail-closed boundaries unwaivable: the schema still yields JSON
// columns, the contracts package still yields versioned-config owners, and every authored owner is
// readable. The shared fact owns the visitor-fed writer/config census; this policy only judges its health.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { JSON_SCHEMA_ANCHOR, JSON_UNREADABLE_CONFIG_MESSAGE, JSON_VERSIONED_BLIND_MESSAGE, jsonColumnWriteFact } from "../lib/json-column-write-fact.ts";
import { drizzleSchemaFact } from "../lib/schema-fact.ts";

const CONTRACTS_DIR = "/packages/contracts/src/";
const JSON_BLIND_MESSAGE =
  'DERIVED NOTHING — no `text(..., { mode: "json" })` column was found in packages/db/src/schema/** on a ' +
  "tree that HAS a db schema. The column derivation is json-column-write-parity's whole basis, so a green " +
  "verdict would be a placebo (tooling/src/verify/gates/GATE-AUTHORING.md §4.6). Re-point the shared schema reader.";
const MESSAGE = `${JSON_BLIND_MESSAGE} ${JSON_VERSIONED_BLIND_MESSAGE} ${JSON_UNREADABLE_CONFIG_MESSAGE}`;
const DRIZZLE_IMPORT = 'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n';
const VALID_CONFIG = "export const userSettingsConfig = defineVersionedConfig<UserSettings>({ schema: s, version: 1, lifts: {}, default: d });\n";

export const gate = defineGate({
  id: "json-column-write-parity-health",
  family: "json-column-write-parity",
  authority: "hard",
  severity: "error",
  population: {
    in: ["@db", "@server", "@contracts"],
    under: ["packages/db/src/schema/**", "packages/server/src/domain/**", "packages/contracts/src/**"],
  },
  analysis: "types",
  execution: "entire-population",
  facts: [jsonColumnWriteFact, drizzleSchemaFact],
  resources: [],
  message: MESSAGE,
  create: (ctx) => ({
    evaluate: () => {
      const writerFact = ctx.fact(jsonColumnWriteFact);
      const schema = ctx.fact(drizzleSchemaFact).schema();
      if (schema.status === "empty") {
        ctx.receipt({ kind: "population", source: schema.receipt.source, members: schema.receipt.members });
        ctx.report.file(JSON_SCHEMA_ANCHOR, { line: 1, column: 1, token: "mode:json", message: JSON_BLIND_MESSAGE });
        return;
      }
      recordReadySchemaFact(ctx, schema);
      const analysis = writerFact.analyze(schema.value);
      if (analysis.columns.all.size === 0) {
        ctx.report.file(JSON_SCHEMA_ANCHOR, { line: 1, column: 1, token: "mode:json", message: JSON_BLIND_MESSAGE });
      }
      if (analysis.versioned.types.size === 0 && analysis.files.some((file) => file.getFilePath().includes(CONTRACTS_DIR))) {
        ctx.report.file(JSON_SCHEMA_ANCHOR, {
          line: 1,
          column: 1,
          token: "defineVersionedConfig",
          message: JSON_VERSIONED_BLIND_MESSAGE,
        });
      }
      for (const call of analysis.versioned.unresolved) {
        const binding = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName() ?? "(unbound)";
        ctx.report.node(call, {
          token: "defineVersionedConfig",
          offset: 0,
          message: `${JSON_UNREADABLE_CONFIG_MESSAGE} Unreadable declaration: ${binding}. (tooling/src/verify/gates/GATE-AUTHORING.md)`,
        });
      }
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        [JSON_SCHEMA_ANCHOR]: `${DRIZZLE_IMPORT}export const notes = sqliteTable("notes", { id: text("id") });\n`,
        "packages/contracts/src/settings/index.ts": VALID_CONFIG,
      },
      expect: { count: 1, token: "mode:json", messageIncludes: 'no `text(..., { mode: "json" })` column' },
      why: "the schema still resolves tables but no JSON column, so the occurrence sibling's entire subject disappeared",
    },
    {
      mode: "types",
      files: {
        [JSON_SCHEMA_ANCHOR]: `${DRIZZLE_IMPORT}export const notes = sqliteTable("notes", { body: text("body", { mode: "json" }) });\n`,
        "packages/contracts/src/settings/index.ts": "export const contractsPackageStillExists = true;\n",
      },
      expect: { count: 1, token: "defineVersionedConfig", messageIncludes: "no `defineVersionedConfig(...)` call" },
      why: "the contracts corpus remains loaded but its versioned-config primitive census disappeared",
    },
    {
      mode: "types",
      files: {
        [JSON_SCHEMA_ANCHOR]: `${DRIZZLE_IMPORT}export const notes = sqliteTable("notes", { body: text("body", { mode: "json" }) });\n`,
        "packages/contracts/src/settings/index.ts": VALID_CONFIG,
        "packages/contracts/src/preset/index.ts":
          "export const promptConfigConfig = defineVersionedConfig({ schema: s, version: 1, lifts: {}, default: d });\n",
      },
      expect: { count: 1, token: "defineVersionedConfig", messageIncludes: "UNREADABLE" },
      why: "one unreadable owner cannot silently erase the versioned columns it governs while a readable sibling keeps the denominator nonempty",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [JSON_SCHEMA_ANCHOR]: `${DRIZZLE_IMPORT}export const userSettings = sqliteTable("user_settings", { config: text("config", { mode: "json" }).$type<UserSettings>() });\n`,
        "packages/contracts/src/settings/index.ts": VALID_CONFIG,
      },
      why: "the shared readers resolve both a JSON column and a readable versioned-config owner",
    },
  ],
  mustRefuse: [
    {
      mode: "types",
      files: {
        [JSON_SCHEMA_ANCHOR]: `${DRIZZLE_IMPORT}const columns = makeColumns();\nexport const notes = sqliteTable("notes", columns);\n`,
        "packages/contracts/src/settings/index.ts": VALID_CONFIG,
      },
      expect: { messageIncludes: "drizzle schema fact unresolved" },
      why: "an unreadable canonical schema declaration cannot be softened into an empty JSON-column verdict",
    },
  ],
});
