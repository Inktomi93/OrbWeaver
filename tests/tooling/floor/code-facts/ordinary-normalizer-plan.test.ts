// @subject tooling/src/floor/code-facts/ordinary-observations.ts
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node } from "ts-morph";
import { Project, SyntaxKind, ts } from "ts-morph";
import { captureOrdinaryObservations } from "../../../../tooling/src/floor/code-facts/ordinary-observations.ts";
import { createSchemaQuery } from "../../../../tooling/src/floor/code-facts/schema-query.ts";
import type { NativeTypeSelectionPlan } from "../../../../tooling/src/floor/code-facts/type-projection-contract.ts";
import { scaledBudget } from "../../_load-budget.ts";

const SCHEMA =
  "import{sqliteTable,text}from'drizzle-orm/sqlite-core';export interface Payload{enabled:boolean;tags:readonly string[];label:string}export const settings=sqliteTable('settings',{payload:text('payload',{mode:'json'}).$type<Payload>().notNull()});";

// `builders` zod builder calls, each with an `_output` receiver, plus the one `.parse` a normalizer proof reads.
function consumer(builders: number): string {
  const extra = Array.from({ length: builders }, (_, index) => `export const extra${String(index)}=z.string().min(${String(index)}).optional();`).join("");
  return `import{z}from'zod';${extra}const payload=z.object({enabled:z.boolean(),tags:z.array(z.string()),label:z.string()});declare const input:unknown;export function run(){return payload.parse(input);}run();`;
}

function normalizerPlan(root: string, repoRoot: string, builders: number): { readonly plan: NativeTypeSelectionPlan; readonly source: string } {
  mkdirSync(root, { recursive: true });
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  writeFileSync(join(root, "schema.ts"), SCHEMA);
  writeFileSync(join(root, "consumer.ts"), consumer(builders));
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
      terminals: { packageName: "zod", packageMethods: [], projectHome: null, projectMethods: [] },
    },
    { query, anchor: consumerSource, related: (node: Node) => node, profile: () => undefined },
  );
  expect(observations.schemaStatus).toBe("ready");
  expect(observations.calls.length).toBeGreaterThan(builders);
  const plan = observations.types?.plan;
  if (plan === undefined) {
    throw new Error("ordinary cohort planned no Type questions");
  }
  return { plan, source: consumerSource.getFilePath() };
}

// The normalizer arm's questions: a parser `_output`, and a typed-column field read at a call's input.
function normalizerQuestions(plan: NativeTypeSelectionPlan): { readonly outputs: number; readonly fields: readonly string[] } {
  const outputs = plan.selectors.filter((selector) => selector.steps.some((step) => step.kind === "property" && step.name === "_output")).length;
  const fields = plan.selectors.flatMap((selector) => {
    const [step, ...rest] = selector.steps;
    return selector.base.kind === "schema-column" && step?.kind === "property" && rest.length === 0 ? [`${step.name}@${step.at.getText()}`] : [];
  });
  return { outputs, fields };
}

test("normalizer questions grow with the parse calls a proof reads, not with every zod builder call", { timeout: scaledBudget(60_000) }, ({
  scratch,
  repoRoot,
}) => {
  const few = normalizerQuestions(normalizerPlan(join(scratch, "few"), repoRoot, 2).plan);
  const many = normalizerQuestions(normalizerPlan(join(scratch, "many"), repoRoot, 40).plan);
  expect(many).toEqual(few);
  // The `.parse` the normalizer proof reads is still planned: its `_output` and every Payload field at its input.
  expect(many.outputs).toBe(1);
  expect(many.fields.toSorted()).toEqual(["enabled@input", "label@input", "tags@input"]);
});
