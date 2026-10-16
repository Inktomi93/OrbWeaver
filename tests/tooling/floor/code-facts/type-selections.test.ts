// Native selection data separates compiler identity, directional assignability and semantic absence.
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node } from "ts-morph";
import { Project, SyntaxKind, ts } from "ts-morph";
import { typeSelectionsSchema } from "../../../../tooling/src/floor/code-facts/projection-inventory-contract.ts";
import type { SchemaModel } from "../../../../tooling/src/floor/code-facts/schema-model-contract.ts";
import { createSchemaQuery } from "../../../../tooling/src/floor/code-facts/schema-query.ts";
import type { InventorySpan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { spanSchema } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { captureTypeSelections } from "../../../../tooling/src/floor/code-facts/type-projection.ts";
import { encodeTypeSelections, replayTypeSelections } from "../../../../tooling/src/floor/code-facts/type-projection-codec.ts";
import type { NativeTypeSelectionPlan, NativeTypeSelector } from "../../../../tooling/src/floor/code-facts/type-projection-contract.ts";
import { scaledBudget } from "../../_load-budget.ts";

function fixture(root: string, repoRoot: string): { readonly project: Project; readonly schema: SchemaModel } {
  mkdirSync(root, { recursive: true });
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const schemaPath = join(root, "schema.ts");
  const consumerPath = join(root, "consumer.ts");
  writeFileSync(
    schemaPath,
    "import{sqliteTable,text}from'drizzle-orm/sqlite-core';export interface Payload{enabled:boolean;tags?:readonly number[]}export const settings=sqliteTable('settings',{payload:text('payload',{mode:'json'}).$type<Payload>().notNull()});",
  );
  writeFileSync(
    consumerPath,
    "import{settings,type Payload}from'./schema.ts';declare const original:Payload;declare const same:Payload;declare const structural:{enabled:boolean;tags?:readonly number[]};declare const list:readonly Payload[]|undefined;const insert:typeof settings.$inferInsert={payload:{enabled:true}};declare const unknownValue:unknown;declare const projection:Pick<Payload,'enabled'>;declare const intersect:Payload & {marker?:true};",
  );
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
  const sources = project.addSourceFilesAtPaths([schemaPath, consumerPath]);
  const schemaSource = sources.find((source) => source.getFilePath() === schemaPath);
  if (schemaSource === undefined) {
    throw new Error("native schema selection source is missing");
  }
  const fact = createSchemaQuery({ files: [schemaSource], checker: () => project.getTypeChecker(), relativePath: (source) => source.getBaseName() }).schema();
  expect(fact.status).toBe("ready");
  if (fact.status !== "ready") {
    throw new Error(fact.reason);
  }
  return { project, schema: fact.value };
}

function nodeSelector(node: Node): NativeTypeSelector {
  return { base: { kind: "node", node }, steps: [], displayAt: node };
}

test(
  "selected canonical schema Types preserve exact identity independently of structural relations and selector absence",
  ({ scratch, repoRoot }) => {
    const { project, schema } = fixture(scratch, repoRoot);
    const source = project.getSourceFileOrThrow(join(scratch, "consumer.ts"));
    const value = (name: string): Node => source.getVariableDeclarationOrThrow(name).getNameNode();
    const column = schema.tables[0]?.columns[0];
    if (column === undefined) {
      throw new Error("actual native JSON column is missing");
    }
    const literal = source.getVariableDeclarationOrThrow("insert").getInitializerOrThrow();
    const selectors: NativeTypeSelector[] = [
      { base: { kind: "schema-column", column: column.identity.key }, steps: [], displayAt: column.typeOverride?.node ?? null },
      nodeSelector(value("original")),
      nodeSelector(value("same")),
      nodeSelector(value("structural")),
      { base: { kind: "node", node: value("list") }, steps: [{ kind: "nonnullable" }, { kind: "array-element-or-self" }], displayAt: null },
      {
        base: { kind: "schema-column", column: column.identity.key },
        steps: [{ kind: "property", name: "tags", at: literal }, { kind: "nonnullable" }],
        displayAt: literal,
      },
      { base: { kind: "schema-column", column: column.identity.key }, steps: [{ kind: "property", name: "absent", at: literal }], displayAt: literal },
      { base: { kind: "contextual", node: literal }, steps: [], displayAt: literal },
      nodeSelector(value("unknownValue")),
      nodeSelector(value("projection")),
      nodeSelector(value("intersect")),
    ];
    const plan: NativeTypeSelectionPlan = {
      selectors,
      relations: [
        { left: 0, right: 3 },
        { left: 0, right: 8 },
        { left: 0, right: 6 },
      ],
    };
    const facts = captureTypeSelections(plan, { value: schema, program: project.getProgram().compilerObject });
    expect(facts.values.slice(0, 5).map((selected) => selected?.identity)).toEqual([0, 0, 0, 3, 0]);
    expect(facts.relations).toEqual([
      { kind: "answer", value: { leftToRight: true, rightToLeft: true, leftIsAny: false, rightIsAny: false } },
      { kind: "answer", value: { leftToRight: true, rightToLeft: false, leftIsAny: false, rightIsAny: false } },
      { kind: "absent" },
    ]);
    expect(facts.values[5]?.arms).toMatchObject([{ arrayElement: { number: true } }]);
    expect(facts.values[6]).toBeNull();
    expect(facts.values[7]?.vocabulary.properties).toContain("payload");
    expect(facts.values[8]?.vocabulary.arms).toMatchObject([{ unknown: true }]);
    expect(facts.values[9]?.parts[0]).toMatchObject({ aliasName: "Pick", aliasArguments: [0, null] });
    expect(facts.values[10]?.parts.some((part) => part.identity === 0)).toBe(true);
  },
  scaledBudget(30_000),
);

test(
  "selected Type wire coverage preserves native absence and refuses missing, ambiguous and foreign selector relations",
  ({ scratch, repoRoot }) => {
    const { project } = fixture(scratch, repoRoot);
    const source = project.getSourceFileOrThrow(join(scratch, "consumer.ts"));
    const node = source.getVariableDeclarationOrThrow("original").getNameNode();
    const plan: NativeTypeSelectionPlan = {
      selectors: [nodeSelector(node), { base: { kind: "node", node }, steps: [{ kind: "property", name: "missing", at: node }], displayAt: null }],
      relations: [{ left: 0, right: 1 }],
    };
    const facts = captureTypeSelections(plan);
    const nodes = new Map<string, Node>();
    const span = (value: Node): InventorySpan => {
      const result = { file: value.getSourceFile().getFilePath(), start: value.getStart(), end: value.getEnd(), kind: value.getKind() };
      nodes.set(JSON.stringify(result), value);
      return result;
    };
    const replay = (value: InventorySpan): Node => {
      const result = nodes.get(JSON.stringify(value));
      if (result === undefined) {
        throw new Error("foreign native selector span");
      }
      return result;
    };
    const schema = typeSelectionsSchema(spanSchema);
    const wire = schema.parse(JSON.parse(JSON.stringify(encodeTypeSelections(facts, span))));
    expect(replayTypeSelections(wire, plan, span, replay)).toEqual(facts);
    expect(() => schema.parse({ ...wire, values: [] })).toThrow("coverage");
    expect(() =>
      schema.parse({ ...wire, relations: [{ kind: "answer", value: { leftToRight: false, rightToLeft: false, leftIsAny: false, rightIsAny: false } }] }),
    ).toThrow("absence");
    expect(() =>
      schema.parse({
        ...wire,
        plan: {
          ...wire.plan,
          relations: [
            { left: 0, right: 1 },
            { left: 0, right: 1 },
          ],
        },
        relations: [...wire.relations, ...wire.relations],
      }),
    ).toThrow("ambiguous");
    expect(() => replayTypeSelections(wire, { ...plan, selectors: [nodeSelector(node), nodeSelector(node)] }, span, replay)).toThrow("foreign");
    const present = wire.values[0];
    if (present === null || present === undefined) {
      throw new Error("native selected Type is absent");
    }
    expect(() => schema.parse({ ...wire, values: [{ ...present, identity: 1 }, null] })).toThrow("identity");
  },
  scaledBudget(30_000),
);

test(
  "selected Type inputs refuse foreign Project nodes, forgotten wrappers and stale canonical schema owners",
  ({ scratch, repoRoot }) => {
    const { project, schema } = fixture(scratch, repoRoot);
    const node = project.getSourceFileOrThrow(join(scratch, "consumer.ts")).getVariableDeclarationOrThrow("original").getNameNode();
    const foreign = new Project({ useInMemoryFileSystem: true })
      .createSourceFile("/foreign.ts", "declare const original:number;")
      .getVariableDeclarationOrThrow("original")
      .getNameNode();
    expect(() => captureTypeSelections({ selectors: [nodeSelector(node), nodeSelector(foreign)], relations: [] })).toThrow("foreign");
    const program = project.getProgram().compilerObject;
    project.createSourceFile(join(scratch, "changed.ts"), "export const changed=true;");
    expect(() => captureTypeSelections({ selectors: [nodeSelector(node)], relations: [] }, { value: schema, program })).toThrow("changed");
    const forgotten = project.getSourceFileOrThrow(join(scratch, "consumer.ts")).getFirstDescendantByKindOrThrow(SyntaxKind.Identifier);
    forgotten.forget();
    expect(() => captureTypeSelections({ selectors: [nodeSelector(forgotten)], relations: [] })).toThrow();
  },
  scaledBudget(30_000),
);
