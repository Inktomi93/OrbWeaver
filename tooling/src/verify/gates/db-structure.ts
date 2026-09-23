// Policy: db-structure — every authored schema module is re-exported from schema/index.ts. The schema
// source population is already closed by the policy runtime; this module reads only that population and
// the barrel AST. Producer-home permissions live in the reviewed sibling policy; both read what a schema
// module is through `lib/db-schema-module.ts#topLevelSchemaModule`, the family's shared subject.
import type { SourceFile } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { SCHEMA_BARREL, topLevelSchemaModule } from "../lib/db-schema-module.ts";

const MESSAGE = "a schema file is not re-exported from schema/index.ts, so its tables vanish from typeof schema and the relational query API.";
const FIX = 'add export * from "./<name>.ts" to packages/db/src/schema/index.ts.';

export const gate = defineGate({
  id: "db-structure",
  family: "db-structure",
  authority: "hard",
  severity: "error",
  population: { in: ["@db"], under: ["packages/db/src/schema/*"], ext: ["ts"] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const modules = ctx.files.flatMap((sourceFile) => {
        const name = topLevelSchemaModule(ctx.relativePath(sourceFile));
        return name === undefined ? [] : [{ sourceFile, name }];
      });
      const first = modules[0];
      if (first === undefined) {
        return;
      }
      const barrel: SourceFile | undefined = ctx.files.find((sourceFile) => ctx.relativePath(sourceFile) === SCHEMA_BARREL);
      if (barrel === undefined) {
        ctx.report.node(first.sourceFile, {
          message: "the schema barrel index.ts is missing — every schema file must be re-exported from it.",
          fix: FIX,
        });
        return;
      }
      const exports = new Set(barrel.getExportDeclarations().map((declaration) => declaration.getModuleSpecifierValue()));
      for (const { sourceFile, name } of modules) {
        if (!(exports.has(`./${name}`) || exports.has(`./${name}.ts`))) {
          ctx.report.node(sourceFile, { message: MESSAGE, fix: FIX });
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/orphan.ts": "export const t = 1;\n",
        [SCHEMA_BARREL]: "export const barrel = 1;\n",
      },
      expect: { count: 1, messageIncludes: "not re-exported" },
      why: "a schema module omitted from the barrel silently vanishes from the exported schema",
    },
    {
      mode: "types",
      files: { "packages/db/src/schema/thing.ts": "export const t = 1;\n" },
      expect: { count: 1, messageIncludes: "barrel index.ts is missing" },
      why: "a nonempty schema tree with no barrel is an explicit structural finding",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/thing.ts": "export const t = 1;\n",
        [SCHEMA_BARREL]: 'export * from "./thing.ts";\n',
      },
      why: "the schema module is exported by the canonical barrel",
    },
  ],
});
