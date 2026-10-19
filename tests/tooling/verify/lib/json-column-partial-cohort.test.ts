// @subject tooling/src/floor/code-facts/ordinary-observations.ts
// A partial root set (D328) still answers every question its roots' writes raise, through the calls written in their
// arguments and the stable bindings those arguments read; a question about a call outside it reads as unresolved.
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { CallExpression } from "ts-morph";
import { Node, Project, SyntaxKind, ts } from "ts-morph";
import { projectSchemaData } from "../../../../tooling/src/floor/code-facts/schema-projection.ts";
import { createSchemaQuery } from "../../../../tooling/src/floor/code-facts/schema-query.ts";
import { captureInvocationEvidence } from "../../../../tooling/src/floor/compiler/invocation-evidence-extract.ts";
import type { JsonColumnOriginContext } from "../../../../tooling/src/verify/contract/json-column-origin.ts";
import { jsonColumnObservationPlan, jsonColumnObservedReaders } from "../../../../tooling/src/verify/lib/json-column-observed-readers.ts";
import { createObservedJsonColumnOriginContext } from "../../../../tooling/src/verify/lib/json-column-origin-context.ts";
import { JSON_COLUMN_READ_TERMINALS } from "../../../../tooling/src/verify/lib/json-column-read.ts";
import { scaledBudget } from "../../_load-budget.ts";

const SCHEMA =
  "import{sqliteTable,text}from'drizzle-orm/sqlite-core';export interface Payload{enabled:boolean}export const settings=sqliteTable('settings',{payload:text('payload',{mode:'json'}).$type<Payload>().notNull()});";
// One write whose value is a parse result held in a const; the unrelated `noop` calls are never roots.
const CONSUMER =
  "import{z}from'zod';import type{BaseSQLiteDatabase}from'drizzle-orm/sqlite-core';import{settings}from'./schema.ts';declare const db:BaseSQLiteDatabase<'async',void>;const payloadSchema=z.object({enabled:z.boolean()});declare function noop(value:number):number;export function unrelated(){return noop(1)+noop(2);}export async function save(input:unknown){const next=payloadSchema.parse(input);return db.update(settings).set({payload:next});}";

interface Cohort {
  readonly roots: readonly CallExpression[];
  readonly context: JsonColumnOriginContext;
  readonly closure: readonly CallExpression[];
  readonly parse: CallExpression;
  readonly noop: CallExpression;
}

function cohort(root: string, repoRoot: string): Cohort {
  mkdirSync(root, { recursive: true });
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  writeFileSync(join(root, "schema.ts"), SCHEMA);
  writeFileSync(join(root, "consumer.ts"), CONSUMER);
  const project = new Project({
    compilerOptions: {
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowImportingTsExtensions: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
    },
  });
  project.addSourceFilesAtPaths([join(root, "schema.ts"), join(root, "consumer.ts")]);
  const schemaSource = project.getSourceFileOrThrow(join(root, "schema.ts"));
  const consumer = project.getSourceFileOrThrow(join(root, "consumer.ts"));
  const query = createSchemaQuery({ files: [schemaSource], checker: () => project.getTypeChecker(), relativePath: (source) => source.getBaseName() });
  const projected = projectSchemaData(query.schema());
  if (projected.status !== "ready") {
    throw new Error("fixture schema is not ready");
  }
  const calls = consumer.getDescendantsOfKind(SyntaxKind.CallExpression);
  const roots = calls.filter((call) => {
    const callee = call.getExpression();
    return Node.isPropertyAccessExpression(callee) && callee.getName() === "set";
  });
  const terminals = {
    ...JSON_COLUMN_READ_TERMINALS,
    packageMethods: [...JSON_COLUMN_READ_TERMINALS.packageMethods],
    projectMethods: [...JSON_COLUMN_READ_TERMINALS.projectMethods],
  };
  const evidence = captureInvocationEvidence(consumer, jsonColumnObservationPlan(roots, []), {
    demand: { roots, reads: [], terminals },
    schema: query,
  });
  const context = createObservedJsonColumnOriginContext(projected.value, jsonColumnObservedReaders(evidence, projected.value));
  const named = (prefix: string): CallExpression => {
    const call = calls.find((candidate) => candidate.getText().startsWith(prefix));
    if (call === undefined) {
      throw new Error(`fixture has no ${prefix} call`);
    }
    return call;
  };
  return { roots, context, closure: evidence.observations?.closureCalls ?? [], parse: named("payloadSchema.parse"), noop: named("noop(1)") };
}

test("a partial root set answers the normalizer its write reads through a const binding", { timeout: scaledBudget(60_000) }, ({ scratch, repoRoot }) => {
  const { roots, context, closure, parse } = cohort(join(scratch, "partial"), repoRoot);
  expect(roots).toHaveLength(1);
  expect(closure.map((call) => call.getText())).toContain(parse.getText());
  expect(context.readNormalizer?.(parse).kind).toBe("resolved");
});

test("a call outside the requested cohort reads as unresolved, never as an answer", { timeout: scaledBudget(60_000) }, ({ scratch, repoRoot }) => {
  const { context, closure, noop } = cohort(join(scratch, "outside"), repoRoot);
  expect(closure.map((call) => call.getText())).not.toContain(noop.getText());
  expect(context.readNormalizer?.(noop)).toMatchObject({ kind: "unresolved", detail: expect.stringContaining("outside the requested ordinary cohort") });
});
