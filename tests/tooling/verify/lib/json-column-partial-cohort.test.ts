// @subject tooling/src/floor/code-facts/ordinary-observations.ts
// A partial root set (D328) still answers every question its roots' writes raise, through the calls written in their
// arguments and the stable bindings those arguments read; a question about a call outside it reads as unresolved.
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { CallExpression, SourceFile } from "ts-morph";
import { Node, Project, SyntaxKind, ts } from "ts-morph";
import { DRIZZLE_ROW_MODELS } from "../../../../tooling/src/floor/code-facts/drizzle-vocabulary.ts";
import type { OrdinaryObservationDemand } from "../../../../tooling/src/floor/code-facts/ordinary-observations-contract.ts";
import type { SchemaQuery } from "../../../../tooling/src/floor/code-facts/schema-model-contract.ts";
import { projectSchemaData } from "../../../../tooling/src/floor/code-facts/schema-projection.ts";
import type { SchemaProjectedModel } from "../../../../tooling/src/floor/code-facts/schema-projection-contract.ts";
import { createSchemaQuery } from "../../../../tooling/src/floor/code-facts/schema-query.ts";
import { captureInvocationEvidence } from "../../../../tooling/src/floor/compiler/invocation-evidence-extract.ts";
import type { JsonColumnOriginContext } from "../../../../tooling/src/verify/contract/json-column-origin.ts";
import { jsonColumnObservationPlan, jsonColumnObservedReaders } from "../../../../tooling/src/verify/lib/json-column-observed-readers.ts";
import { createObservedJsonColumnOriginContext } from "../../../../tooling/src/verify/lib/json-column-origin-context.ts";
import { JSON_COLUMN_READ_TERMINALS } from "../../../../tooling/src/verify/lib/json-column-read.ts";
import { scaledBudget } from "../../_load-budget.ts";

const SCHEMA = [
  "import{sqliteTable,text}from'drizzle-orm/sqlite-core';export interface Payload{enabled:boolean}",
  "export const settings=sqliteTable('settings',{payload:text('payload',{mode:'json'}).$type<Payload>().notNull()});",
  "const schemaOnlyDefault={enabled:false};export const untouched=sqliteTable('untouched',{payload:text('payload',{mode:'json'}).$type<Payload>().default(schemaOnlyDefault).notNull()});",
].join("\n");
// One write whose value is a parse result held in a const; the unrelated `noop` calls are never roots.
const CONSUMER =
  "import{z}from'zod';import type{BaseSQLiteDatabase}from'drizzle-orm/sqlite-core';import{settings}from'./schema.ts';declare const db:BaseSQLiteDatabase<'async',void>;const payloadSchema=z.object({enabled:z.boolean()});const snapshot={enabled:true};declare function noop(value:number):number;export function unrelated(){return noop(1)+noop(2);}export async function save(input:unknown){const next=payloadSchema.parse(input);return db.update(settings).set({payload:next});}";

interface CohortFixture {
  readonly schemaSource: SourceFile;
  readonly consumer: SourceFile;
  readonly query: SchemaQuery;
  readonly schema: SchemaProjectedModel;
  readonly calls: readonly CallExpression[];
}

interface Cohort {
  readonly roots: readonly CallExpression[];
  readonly context: JsonColumnOriginContext;
  readonly closure: readonly CallExpression[];
  readonly parse: CallExpression;
  readonly noop: CallExpression;
}

function cohortFixture(root: string, repoRoot: string): CohortFixture {
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
  return { schemaSource, consumer, query, schema: projected.value, calls: consumer.getDescendantsOfKind(SyntaxKind.CallExpression) };
}

function captureFixture(
  fixture: CohortFixture,
  roots: readonly CallExpression[],
  reads: OrdinaryObservationDemand["reads"],
): ReturnType<typeof captureInvocationEvidence> {
  const terminals = {
    ...JSON_COLUMN_READ_TERMINALS,
    packageMethods: [...JSON_COLUMN_READ_TERMINALS.packageMethods],
    projectMethods: [...JSON_COLUMN_READ_TERMINALS.projectMethods],
  };
  return captureInvocationEvidence(fixture.consumer, jsonColumnObservationPlan(roots, reads), {
    demand: { roots, reads, terminals },
    schema: fixture.query,
  });
}

function cohort(root: string, repoRoot: string): Cohort {
  const fixture = cohortFixture(root, repoRoot);
  const roots = fixture.calls.filter((call) => {
    const callee = call.getExpression();
    return Node.isPropertyAccessExpression(callee) && callee.getName() === "set";
  });
  const evidence = captureFixture(fixture, roots, []);
  const context = createObservedJsonColumnOriginContext(fixture.schema, jsonColumnObservedReaders(evidence, fixture.schema));
  const named = (prefix: string): CallExpression => {
    const call = fixture.calls.find((candidate) => candidate.getText().startsWith(prefix));
    if (call === undefined) {
      throw new Error(`fixture has no ${prefix} call`);
    }
    return call;
  };
  return { roots, context, closure: evidence.observations?.closureCalls ?? [], parse: named("payloadSchema.parse"), noop: named("noop(1)") };
}

test("empty ordinary demand retains complete native schema questions without schema-subtree value closure", {
  timeout: scaledBudget(60_000),
}, ({ scratch, repoRoot }) => {
  const fixture = cohortFixture(join(scratch, "empty"), repoRoot);
  const program = fixture.consumer.getProject().getProgram().compilerObject;
  const evidence = captureFixture(fixture, [], []);
  const delivered = jsonColumnObservedReaders(evidence, fixture.schema);
  const graph = delivered.graph;
  expect(fixture.schema.tables.map(({ identity }) => identity.declarationName)).toEqual(["settings", "untouched"]);
  expect(graph.schemaStatus).toBe("ready");
  expect(graph.anchor).toBe(fixture.consumer);
  expect(graph.demand.roots).toEqual([]);
  expect(graph.demand.reads).toEqual([]);
  const metadataAnchors = new Set<Node>(
    fixture.schema.tables.flatMap((table) => [
      table.declaration,
      ...table.columns.flatMap((column) => {
        const type = column.typeOverride?.node;
        return type === undefined ? [] : [type, ...[type, ...type.getDescendants()].filter(Node.isTypeReference).map((reference) => reference.getTypeName())];
      }),
    ]),
  );
  for (const table of fixture.schema.tables) {
    expect(table.declaration.getSourceFile()).toBe(fixture.schemaSource);
    for (const name of DRIZZLE_ROW_MODELS) {
      expect(
        delivered.selected({
          base: { kind: "node", node: table.declaration },
          steps: [{ kind: "property", name, at: table.declaration }],
          displayAt: null,
        }),
      ).not.toBeNull();
    }
    for (const column of table.columns) {
      expect(delivered.selected({ base: { kind: "schema-column", column: column.identity.key }, steps: [], displayAt: null })?.vocabulary.properties).toEqual([
        "enabled",
      ]);
    }
  }
  expect(fixture.schemaSource.getProject().getProgram().compilerObject).toBe(program);
  expect(graph.calls.map(({ call }) => call.getText())).toEqual([]);
  expect(graph.nodes.filter(({ node }) => !metadataAnchors.has(node)).map(({ node }) => node.getText())).toEqual([]);
  expect(graph.profileNodes.filter((node) => !metadataAnchors.has(node)).map((node) => node.getText())).toEqual([]);
});

test("a read-only ordinary demand retains its registered missing-world refusal with no call roots", {
  timeout: scaledBudget(60_000),
}, ({ scratch, repoRoot }) => {
  const fixture = cohortFixture(join(scratch, "read-only"), repoRoot);
  const read = fixture.consumer.getVariableDeclarationOrThrow("snapshot").getNameNode();
  const path = ["enabled"];
  const evidence = captureFixture(fixture, [], [{ node: read, path }]);
  const delivered = jsonColumnObservedReaders(evidence, fixture.schema);
  expect(delivered.graph.demand.roots).toEqual([]);
  expect(delivered.graph.demand.reads.map(({ node, path: registered }) => [node === read, registered])).toEqual([[true, path]]);
  expect(delivered.graph.nodes.some(({ node }) => node === read)).toBe(true);
  const returned = delivered.returned(read, path);
  expect(returned).toMatchObject({
    kind: "unresolved",
    reason: "unsupported",
    node: read,
    detail: "call/return observations belong to another compiler world or a stale source/program epoch",
  });
  expect(() => delivered.returned(read, ["unregistered"])).toThrow("not registered");
});

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
