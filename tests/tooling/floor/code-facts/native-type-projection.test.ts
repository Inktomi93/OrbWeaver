// @subject tooling/src/floor/code-facts/type-projection-codec.ts
// @subject tooling/src/floor/code-facts/authored-value-projection-codec.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node, SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import { createSemanticInventory } from "../../../../tooling/src/floor/code-facts/semantic-inventory.ts";
import type { InventoryInvocationPlan, InventorySpan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import {
  latestInventoryGeneration,
  openInventoryDatabase,
  readInventoryGeneration,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts";
import { inputsCurrent, inventoryAuthoredFiles } from "../../../../tooling/src/floor/code-facts/semantic-inventory-inputs.ts";
import { readInventoryInputs } from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { inventoryReader } from "../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts";
import { typeProjectionFacet } from "../../../../tooling/src/floor/code-facts/type-projection-contract.ts";
import { readCompilerPrograms } from "../../../../tooling/src/floor/compiler/compiler-programs.ts";
import { inventoryFileSystem } from "../../../../tooling/src/floor/compiler/semantic-inventory-filesystem.ts";
import { runInventoryPartitionWorker } from "../../../../tooling/src/floor/compiler/semantic-inventory-worker-run.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { scaledBudget } from "../../_load-budget.ts";

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
  readonly options: Parameters<typeof createSemanticInventory>[0];
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
    using inventory = createSemanticInventory(fixture.options);
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
  "invocation implementation inputs refuse helper-only changes without replacing a pinned store generation",
  ({ scratch }) => {
    const fixture = setup(scratch);
    using inventory = createSemanticInventory(fixture.options);
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    const dependencies = [
      "projection-reference-codec.ts",
      "type-projection.ts",
      "type-projection-codec.ts",
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
      "schema-object-contract.ts",
      "reference-fact-global.ts",
    ].map((name) => fileURLToPath(new URL(`../../../../tooling/src/floor/code-facts/${name}`, import.meta.url)));
    const authored = inventoryAuthoredFiles(scratch);
    const fileSystem = new Project({ skipAddingFilesFromTsConfig: true }).getFileSystem();
    for (const partition of readInventoryGeneration(db, inventory.generation)) {
      const inputs = [...readInventoryInputs(db, partition.id)];
      expect(dependencies.filter((path) => inputs.some((input) => input.kind === "file" && input.path === path))).toEqual(dependencies);
      expect(inputsCurrent(inputs, { authored })).toBe(true);
      for (const path of dependencies) {
        const changed = inventoryFileSystem(fileSystem, { root: scratch, files: [{ path, text: `${readFileSync(path, "utf8")}\n` }], deleted: [] });
        expect(inputsCurrent(inputs, { authored, fileSystem: changed }), path).toBe(false);
      }
    }
    const helper = dependencies[0];
    if (helper === undefined) {
      throw new Error("native helper invalidation control is missing");
    }
    const changed = inventoryFileSystem(fileSystem, { root: scratch, files: [{ path: helper, text: `${readFileSync(helper, "utf8")}\n` }], deleted: [] });
    // Transaction source overlays cannot substitute executable helpers outside the authored fixture.
    // A changed helper observation must refuse publication, not accept the worker's unchanged bytes.
    expect(() => createSemanticInventory({ ...fixture.options, fileSystem: changed })).toThrow("inputs changed during extraction");
    using reused = createSemanticInventory({
      ...fixture.options,
      buildPartition: (): never => {
        throw new Error("unchanged projection rebuilt");
      },
    });
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
    using inventory = createSemanticInventory(options);
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
    const authored = inventoryAuthoredFiles(scratch);
    for (const partition of partitions) {
      const inputs = [...readInventoryInputs(db, partition.id)];
      for (const path of dependencies) {
        expect(
          inputs.some((input) => input.kind === "file" && input.path === path),
          path,
        ).toBe(true);
        const fileSystem = inventoryFileSystem(new Project({ skipAddingFilesFromTsConfig: true }).getFileSystem(), {
          root: scratch,
          files: [{ path, text: readFileSync(path, "utf8") + "\n" }],
          deleted: [],
        });
        expect(inputsCurrent(inputs, { authored, fileSystem }), path).toBe(false);
      }
    }
    const extra = { program: "tsconfig.node.json", query: { ...helperPlan, node: anchor(stored) } };
    expect(() =>
      createSemanticInventory({
        ...options,
        invocationQueries: [...options.invocationQueries, extra],
        buildPartition: (request) => {
          runInventoryPartitionWorker(request);
          using staging = openInventoryDatabase(request.destination);
          staging.prepare("UPDATE inventory_invocation_atom SET key='\"foreign\"' WHERE key='\"stored-value\"'").run();
        },
      }),
    ).toThrow("facet coverage is incomplete");
    expect(latestInventoryGeneration(db)).toBe(inventory.generation);
    expect(inventory.invocationEvidence(stored, "tsconfig.node.json", valuePlan).storedValues.get(stored)).toMatchObject({ kind: "call" });
    inventory[Symbol.dispose]();
    expect(() => inventory.invocationEvidence(stored, "tsconfig.node.json", valuePlan)).toThrow("disposed");
  },
  scaledBudget(60_000),
);
