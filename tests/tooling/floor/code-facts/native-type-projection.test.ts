// @subject tooling/src/floor/code-facts/type-projection-codec.ts
// @subject tooling/src/floor/code-facts/authored-value-projection-codec.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node, SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import type { InventoryInvocationPlan, InventorySpan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import {
  latestInventoryGeneration,
  openInventoryDatabase,
  readInventoryGeneration,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts";
import { inputVersion } from "../../../../tooling/src/floor/code-facts/semantic-inventory-inputs.ts";
import { inventoryReader } from "../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts";
import { readInventoryRuntime } from "../../../../tooling/src/floor/code-facts/semantic-inventory-runtime-query.ts";
import { TYPE_OBSERVATION_PROFILE } from "../../../../tooling/src/floor/code-facts/type-observations-contract.ts";
import { readTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations-read.ts";
import { nodeTypeSelector, typeArgumentSelector, typeProjectionFacet } from "../../../../tooling/src/floor/code-facts/type-projection-contract.ts";
import { readCompilerPrograms } from "../../../../tooling/src/floor/compiler/compiler-programs.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeInventoryFixture } from "../compiler/native-inventory-fixture.ts";

const SOURCE = "shared/control.ts";
const TYPE_PLAN: InventoryInvocationPlan = {
  mode: "value",
  facets: ["type-projection"],
  arguments: [],
  typeProjection: { facets: ["scalar", "runtime-undefined"], properties: [] },
};
const AUTHORED_PLAN: InventoryInvocationPlan = { mode: "value", facets: ["authored-value"], arguments: [] };

function anchor(node: Node): InventorySpan {
  return { file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() };
}

function setup(root: string): {
  readonly options: Parameters<typeof nativeInventoryFixture>[0];
  readonly source: SourceFile;
  readonly value: Node;
  readonly config: Node;
} {
  const config = (browser: boolean): string =>
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        noLib: true,
        types: [],
        customConditions: browser ? ["browser"] : [],
      },
      files: [SOURCE],
    });
  const files = {
    ".gitignore": "node_modules/\n.cache/\n",
    "tsconfig.node.json": config(false),
    "tsconfig.browser.json": config(true),
    [SOURCE]: 'import {hook,type Axis} from "platform"; declare const value:Axis; export const subject=value; export const config={id:"fixed",hook};',
    "node_modules/platform/package.json": JSON.stringify({ name: "platform", exports: { browser: "./browser.d.ts", default: "./node.d.ts" } }),
    "node_modules/platform/node.d.ts": 'export type Axis="node"; export declare function hook():void;',
    "node_modules/platform/browser.d.ts": 'export type Axis="browser"; export declare function hook():void;',
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  execFixtureGit(root, ["init", "-q"]);
  const programs = readCompilerPrograms(root);
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const source = project.addSourceFileAtPath(join(root, SOURCE));
  const value = source.getVariableDeclarationOrThrow("subject").getInitializerOrThrow();
  const object = source.getVariableDeclarationOrThrow("config").getInitializerOrThrow();
  return {
    source,
    value,
    config: object,
    options: {
      root,
      programs,
      families: ["invocation-evidence", "global-origins", "computed-names"],
      globalOriginQueries: [],
      globalBindingQueries: [],
      computedNameQueries: [],
      invocationQueries: programs.flatMap(({ id }) => [
        { program: id, query: { ...TYPE_PLAN, node: anchor(value) } },
        { program: id, query: { ...AUTHORED_PLAN, node: anchor(object) } },
      ]),
    },
  };
}

test(
  "stored native projections retain importing-world meaning and independent registry readability/provenance",
  ({ scratch }) => {
    const fixture = setup(scratch);
    using inventory = nativeInventoryFixture(fixture.options);
    for (const world of ["browser", "node"]) {
      const program = `tsconfig.${world}.json`;
      const projection = inventory.invocationEvidence(fixture.value, program, TYPE_PLAN).typeProjections.get(fixture.value);
      if (projection === undefined) {
        throw new Error("stored native projection is missing");
      }
      expect(typeProjectionFacet(projection, "scalar").stringLiterals).toEqual([world]);
      expect(typeProjectionFacet(projection, "runtime-undefined")).toBe(false);
      const authored = inventory.invocationEvidence(fixture.config, program, AUTHORED_PLAN).authoredValues.get(fixture.config);
      expect(authored?.value.kind).toBe("unresolved");
      expect(authored?.composite).toMatchObject({ kind: "resolved", value: fixture.config });
    }
    const foreign: InventoryInvocationPlan = { ...TYPE_PLAN, typeProjection: { facets: ["scalar"], properties: [] } };
    expect(() => inventory.invocationEvidence(fixture.value, "tsconfig.node.json", foreign)).toThrow("query is unavailable");
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    const partitions = readInventoryGeneration(db, inventory.generation);
    using stored = inventoryReader(scratch, inventory.generation, partitions, { db, dispose: () => undefined });
    db.exec("BEGIN IMMEDIATE");
    try {
      const changed = db.prepare("UPDATE inventory_invocation_atom SET key='\"foreign\"' WHERE key='\"scalar\"'").run();
      expect(Number(changed.changes)).toBeGreaterThan(0);
      expect(() => stored.invocationEvidence(fixture.value, "tsconfig.node.json", TYPE_PLAN)).toThrow("Unrecognized key");
    } finally {
      db.exec("ROLLBACK");
    }
    fixture.source.addStatements("export const changed=1;");
    expect(() => inventory.invocationEvidence(fixture.value, "tsconfig.node.json", TYPE_PLAN)).toThrow("source/epoch is not admitted");
  },
  scaledBudget(30_000),
);

test(
  "invocation implementation receipts retain the loaded projection owners without invalidating a warm generation",
  ({ scratch }) => {
    const fixture = setup(scratch);
    using inventory = nativeInventoryFixture(fixture.options);
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    const dependencies = [
      "projection-reference-codec.ts",
      "type-projection.ts",
      "type-projection-codec.ts",
      "type-observation-questions.ts",
      "type-origin-projection.ts",
      "type-origin-projection-codec.ts",
      "type-member-origin-graph.ts",
      "type-member-origin-containment.ts",
      "type-member-origin-recurrence.ts",
      "authored-value-projection.ts",
      "authored-value-projection-codec.ts",
      "static-authored-value.ts",
      "zod-origin.ts",
      "schema-object.ts",
      "reference-fact-global.ts",
    ].map((name) => fileURLToPath(new URL(`../../../../tooling/src/floor/code-facts/${name}`, import.meta.url)));
    for (const partition of readInventoryGeneration(db, inventory.generation)) {
      const runtime = readInventoryRuntime(db, partition.id, "worker");
      expect(runtime.sources.some((source) => source.path.endsWith("/schema-object-contract.ts"))).toBe(false);
      expect(dependencies.filter((path) => runtime.sources.some((source) => source.path === path && source.version === inputVersion(path, "file")))).toEqual(
        dependencies,
      );
    }
    const workers: string[] = [];
    using reused = nativeInventoryFixture(fixture.options, { workers });
    expect(workers).toEqual([]);
    expect(reused.generation).toBe(inventory.generation);
  },
  scaledBudget(30_000),
);

test(
  "canonical value observations keep exact facet coverage, related nodes and failed-publication ownership",
  ({ scratch }) => {
    const fixture = setup(scratch);
    fixture.source.addStatements(`const prefix={first:1};function factory(){return {...prefix,last:2};}export const stored=factory();
declare const table:{$inferSelect:{value:{[key:string]:unknown}}};
function helper(skip:number,blob:{[key:string]:unknown},key:string){return blob[key];}
function consume(row:typeof table.$inferSelect){const {value:blob}=row;helper(0,blob,"first");return blob;}`);
    writeFileSync(join(scratch, SOURCE), fixture.source.getFullText());
    const stored = fixture.source.getVariableDeclarationOrThrow("stored").getInitializerOrThrow();
    const consume = fixture.source.getFunctionOrThrow("consume");
    const blob = consume.getDescendantsOfKind(SyntaxKind.ReturnStatement)[0]?.getExpression();
    const helper = consume.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
    if (blob === undefined || helper === undefined) {
      throw new Error("value observation controls missing");
    }
    const valuePlan: InventoryInvocationPlan = { mode: "value", facets: ["stored-value"], arguments: [] };
    const rowPlan: InventoryInvocationPlan = { mode: "value", facets: ["row-column"], arguments: [] };
    const helperPlan: InventoryInvocationPlan = { mode: "value", facets: ["indexed-parameters", "drizzle-write"], arguments: [] };
    const options = {
      ...fixture.options,
      invocationQueries: (fixture.options.programs ?? []).flatMap(({ id }) => [
        { program: id, query: { ...valuePlan, node: anchor(stored) } },
        { program: id, query: { ...rowPlan, node: anchor(blob) } },
        { program: id, query: { ...helperPlan, node: anchor(helper) } },
      ]),
    };
    using inventory = nativeInventoryFixture(options);
    for (const world of ["node", "browser"]) {
      const program = `tsconfig.${world}.json`;
      expect(inventory.invocationEvidence(stored, program, valuePlan).storedValues.get(stored)).toMatchObject({
        kind: "call",
        values: [
          {
            kind: "object",
            members: [
              { kind: "spread", value: { kind: "binding", values: [{ kind: "object", members: [{ kind: "named", name: "first" }] }] } },
              { kind: "named", name: "last" },
            ],
          },
        ],
      });
      const row = inventory.invocationEvidence(blob, program, rowPlan).columnRows.get(blob);
      expect(row).toMatchObject({ kind: "resolved", column: { property: "value" } });
      expect(row?.kind === "resolved" ? row.declarations : []).toEqual([fixture.source.getVariableDeclarationOrThrow("table")]);
      const evidence = inventory.invocationEvidence(helper, program, helperPlan);
      expect(evidence.drizzleWrites.get(helper)).toMatchObject({ kind: "resolved", value: null });
      expect(evidence.indexedParameters.get(helper)?.map((item) => [item.receiverIndex, item.keyIndex, item.node.getText()])).toEqual([[1, 2, "blob[key]"]]);
    }
    expect(() => inventory.invocationEvidence(stored, "tsconfig.node.json", { ...valuePlan, facets: ["drizzle-write"] })).toThrow("query is unavailable");
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    const partitions = readInventoryGeneration(db, inventory.generation);
    using reader = inventoryReader(scratch, inventory.generation, partitions, { db, dispose: () => undefined });
    db.exec("BEGIN IMMEDIATE");
    try {
      expect(Number(db.prepare("UPDATE inventory_invocation_atom SET key='\"foreign\"' WHERE key='\"stored-value\"'").run().changes)).toBeGreaterThan(0);
      expect(() => reader.invocationEvidence(stored, "tsconfig.node.json", valuePlan)).toThrow("facet coverage is incomplete");
    } finally {
      db.exec("ROLLBACK");
    }
    const dependencies = [
      "value-carrier.ts",
      "value-carrier-native.ts",
      "value-observation.ts",
      "value-observation-contract.ts",
      "value-observation-codec.ts",
      "stored-value-shape.ts",
      "drizzle-row-origin.ts",
      "drizzle-row-type.ts",
      "drizzle-column-reads.ts",
    ].map((name) => fileURLToPath(new URL(`../../../../tooling/src/floor/code-facts/${name}`, import.meta.url)));
    for (const partition of partitions) {
      const runtime = readInventoryRuntime(db, partition.id, "worker");
      expect(runtime.sources.some((source) => source.path.endsWith("/schema-object-contract.ts"))).toBe(false);
      for (const path of dependencies) {
        expect(
          runtime.sources.some((source) => source.path === path && source.version === inputVersion(path, "file")),
          path,
        ).toBe(true);
      }
    }
    const extra = { program: "tsconfig.node.json", query: { ...helperPlan, node: anchor(stored) } };
    expect(() =>
      nativeInventoryFixture(
        {
          ...options,
          invocationQueries: [...options.invocationQueries, extra],
        },
        { fault: "invocation-stored-value" },
      ),
    ).toThrow("facet coverage is incomplete");
    expect(latestInventoryGeneration(db)).toBe(inventory.generation);
    expect(inventory.invocationEvidence(stored, "tsconfig.node.json", valuePlan).storedValues.get(stored)).toMatchObject({ kind: "call" });
    inventory[Symbol.dispose]();
    expect(() => inventory.invocationEvidence(stored, "tsconfig.node.json", valuePlan)).toThrow("disposed");
  },
  scaledBudget(60_000),
);

test(
  "raw type cohorts retain same-world relations, strict publication, helper freshness and current overlays",
  ({ scratch }) => {
    const fixture = setup(scratch);
    fixture.source.replaceWithText(
      'import type{Axis}from"platform";interface Box<T>{readonly _output:T;}declare function build():Box<"node">;export const chosen=build() satisfies Box<Axis>;',
    );
    writeFileSync(join(scratch, SOURCE), fixture.source.getFullText());
    const declaration = fixture.source.getVariableDeclarationOrThrow("chosen");
    const initial = declaration.getInitializerIfKindOrThrow(SyntaxKind.SatisfiesExpression);
    const plan: InventoryInvocationPlan = {
      mode: "types",
      facets: [],
      arguments: [],
      typeObservations: { profile: TYPE_OBSERVATION_PROFILE, sources: [anchor(fixture.source)], nodes: [anchor(declaration)] },
    };
    const options = {
      root: scratch,
      programs: fixture.options.programs ?? [],
      families: ["invocation-evidence"] as const,
      invocationQueries: (fixture.options.programs ?? []).map(({ id }) => ({ program: id, query: { ...plan, node: anchor(fixture.source) } })),
    };
    using inventory = nativeInventoryFixture(options);
    const actual = { ...nodeTypeSelector(initial.getExpression()), steps: [{ kind: "property" as const, name: "_output", at: initial.getExpression() }] };
    const target = typeArgumentSelector(nodeTypeSelector(initial.getTypeNodeOrThrow()));
    for (const world of ["node", "browser"]) {
      const evidence = inventory.invocationEvidence(fixture.source, `tsconfig.${world}.json`, plan);
      if (evidence.typeObservations === undefined) {
        throw new Error("native raw type cohort missing");
      }
      const readers = readTypeObservations(evidence.typeObservations);
      expect(readers.relation(actual, target)).toEqual({ leftToRight: world === "node", rightToLeft: world === "node", leftIsAny: false, rightIsAny: false });
      expect(readers.display(target, initial)).toBe(`"${world}"`);
      expect(evidence.typeObservations.selections?.values.some((value) => value !== null && "vocabulary" in value)).toBe(false);
    }
    expect(() =>
      inventory.invocationEvidence(fixture.source, "tsconfig.node.json", {
        ...plan,
        typeObservations: { profile: TYPE_OBSERVATION_PROFILE, sources: [anchor(fixture.source)], nodes: [] },
      }),
    ).toThrow("query is unavailable");
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    const partitions = readInventoryGeneration(db, inventory.generation);
    using stored = inventoryReader(scratch, inventory.generation, partitions, { db, dispose: () => undefined });
    db.exec("BEGIN IMMEDIATE");
    try {
      expect(Number(db.prepare("UPDATE inventory_invocation_atom SET key='\"missing\"' WHERE key='\"types\"'").run().changes)).toBeGreaterThan(0);
      expect(() => stored.invocationEvidence(fixture.source, "tsconfig.node.json", plan)).toThrow();
    } finally {
      db.exec("ROLLBACK");
    }
    const helpers = [
      "type-observations.ts",
      "type-observation-profile.ts",
      "type-observations-codec.ts",
      "type-observations-inventory.ts",
      "type-observations-coverage.ts",
      "type-observations-read.ts",
      "type-slot-path.ts",
      "type-slot-syntax.ts",
      "type-dependence.ts",
      "symbol-identity.ts",
    ];
    for (const partition of partitions) {
      const runtime = readInventoryRuntime(db, partition.id, "worker");
      expect(runtime.sources.some((source) => source.path.endsWith("/schema-object-contract.ts"))).toBe(false);
      for (const name of helpers) {
        const path = fileURLToPath(new URL(`../../../../tooling/src/floor/code-facts/${name}`, import.meta.url));
        expect(
          runtime.sources.some((source) => source.path === path && source.version === inputVersion(path, "file")),
          name,
        ).toBe(true);
      }
    }
    const extra: InventoryInvocationPlan = {
      ...plan,
      typeObservations: { profile: TYPE_OBSERVATION_PROFILE, sources: [anchor(fixture.source)], nodes: [anchor(declaration), anchor(initial)] },
    };
    expect(() =>
      nativeInventoryFixture(
        {
          ...options,
          invocationQueries: [...options.invocationQueries, { program: "tsconfig.node.json", query: { ...extra, node: anchor(fixture.source) } }],
        },
        { fault: "invocation-types" },
      ),
    ).toThrow();
    expect(latestInventoryGeneration(db)).toBe(inventory.generation);
    expect(stored.invocationEvidence(fixture.source, "tsconfig.node.json", plan).typeObservations).toBeDefined();
    fixture.source.replaceWithText(fixture.source.getFullText().replace('Box<"node">', 'Box<"edge">'));
    const current = fixture.source.getVariableDeclarationOrThrow("chosen");
    const overlayPlan: InventoryInvocationPlan = {
      ...plan,
      typeObservations: { profile: TYPE_OBSERVATION_PROFILE, sources: [anchor(fixture.source)], nodes: [anchor(current)] },
    };
    using changed = nativeInventoryFixture(
      {
        ...options,
        invocationQueries: options.programs.map(({ id }) => ({ program: id, query: { ...overlayPlan, node: anchor(fixture.source) } })),
      },
      { projection: { root: scratch, files: [{ path: join(scratch, SOURCE), text: fixture.source.getFullText() }], deleted: [] } },
    );
    const facts = changed.invocationEvidence(fixture.source, "tsconfig.node.json", overlayPlan).typeObservations;
    if (facts === undefined) {
      throw new Error("current overlay raw cohort missing");
    }
    const expression = current.getInitializerIfKindOrThrow(SyntaxKind.SatisfiesExpression);
    const readers = readTypeObservations(facts);
    expect(
      readers.relation(
        { ...nodeTypeSelector(expression.getExpression()), steps: [{ kind: "property", name: "_output", at: expression.getExpression() }] },
        typeArgumentSelector(nodeTypeSelector(expression.getTypeNodeOrThrow())),
      ),
    ).toEqual({ leftToRight: false, rightToLeft: false, leftIsAny: false, rightIsAny: false });
    expect(() => stored.invocationEvidence(fixture.source, "tsconfig.node.json", plan)).toThrow();
    changed[Symbol.dispose]();
    expect(() => readers.symbol(current)).toThrow("disposed");
  },
  scaledBudget(60_000),
);
