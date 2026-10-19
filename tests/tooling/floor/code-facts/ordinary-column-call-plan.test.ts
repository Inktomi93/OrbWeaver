// @subject tooling/src/floor/code-facts/ordinary-observations.ts
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node } from "ts-morph";
import { Project, SyntaxKind, ts } from "ts-morph";
import { captureOrdinaryObservations } from "../../../../tooling/src/floor/code-facts/ordinary-observations.ts";
import { createSchemaQuery } from "../../../../tooling/src/floor/code-facts/schema-query.ts";
import type { NativeTypeSelector } from "../../../../tooling/src/floor/code-facts/type-projection-contract.ts";
import { scaledBudget } from "../../_load-budget.ts";

const SCHEMA =
  "import{sqliteTable,text}from'drizzle-orm/sqlite-core';export interface Payload{enabled:boolean;tags:readonly string[];label:string}export const settings=sqliteTable('settings',{payload:text('payload',{mode:'json'}).$type<Payload>().notNull()});";

// `plain` unrelated calls plus one same-field array remap the JSON array-field proof reads.
function consumer(plain: number): string {
  const calls = Array.from({ length: plain }, (_, index) => `noop(${String(index)});`).join("");
  return `import{settings}from'./schema.ts';declare function noop(value:number):void;declare const row:typeof settings.$inferSelect;export function run(){${calls}return row.payload.tags.map((tag)=>tag);}run();`;
}

function columnCallSelectors(root: string, repoRoot: string, plain: number): readonly NativeTypeSelector[] {
  mkdirSync(root, { recursive: true });
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  writeFileSync(join(root, "schema.ts"), SCHEMA);
  writeFileSync(join(root, "consumer.ts"), consumer(plain));
  const project = new Project({
    compilerOptions: {
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
      types: [],
    },
  });
  project.addSourceFilesAtPaths([join(root, "schema.ts"), join(root, "consumer.ts")]);
  const schemaSource = project.getSourceFileOrThrow(join(root, "schema.ts"));
  const consumerSource = project.getSourceFileOrThrow(join(root, "consumer.ts"));
  const query = createSchemaQuery({ files: [schemaSource], checker: () => project.getTypeChecker(), relativePath: (source) => source.getBaseName() });
  const observations = captureOrdinaryObservations(
    {
      roots: consumerSource.getDescendantsOfKind(SyntaxKind.CallExpression),
      reads: [],
      terminals: { packageName: "drizzle-orm", packageMethods: [], projectHome: null, projectMethods: [] },
    },
    { query, anchor: consumerSource, related: (node: Node) => node, profile: () => undefined },
  );
  expect(observations.schemaStatus).toBe("ready");
  expect(observations.calls.length).toBeGreaterThan(plain);
  return (observations.types?.plan.selectors ?? []).filter(
    (selector) =>
      selector.base.kind === "schema-column" && selector.steps.some((step) => step.kind === "property" && step.at.getKindName() === "CallExpression"),
  );
}

test("typed-column call questions grow with the calls that can bind a field, not with every call in the closure", { timeout: scaledBudget(60_000) }, ({
  scratch,
  repoRoot,
}) => {
  const few = columnCallSelectors(join(scratch, "few"), repoRoot, 2);
  const many = columnCallSelectors(join(scratch, "many"), repoRoot, 40);
  expect(many.length).toBe(few.length);
  // The array remap is still planned: every Payload field at the map call, through nonnullable.
  const remap = many.filter((selector) => selector.steps.some((step) => step.kind === "property" && step.at.getText().endsWith(".map((tag)=>tag)")));
  expect(remap.map((selector) => selector.steps.map((step) => (step.kind === "property" ? step.name : step.kind)).join(".")).toSorted()).toEqual([
    "enabled.nonnullable",
    "label.nonnullable",
    "tags.nonnullable",
  ]);
});
