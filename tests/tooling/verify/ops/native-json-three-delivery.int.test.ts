// The maintained JSON policies consume native schema/return observations without consulting syntax-carrier meaning.
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { jsonValueSchema } from "@orb/kit/json";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { CallExpression, SourceFile } from "ts-morph";
import { Identifier, Node, SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import type { SchemaProjectedModel } from "../../../../tooling/src/floor/code-facts/schema-projection-contract.ts";
import type { InventoryInvocationEvidence, InventorySpan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { invocationQueryKey } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import {
  latestInventoryGeneration,
  openInventoryDatabase,
  readInventoryGeneration,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts";
import { hasInventoryInvocationCoverage, readInventoryInvocationEvidence } from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { inventoryReader } from "../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts";
import { inventoryString, invocationAtoms } from "../../../../tooling/src/floor/code-facts/semantic-inventory-records.ts";
import { readInventoryRuntime } from "../../../../tooling/src/floor/code-facts/semantic-inventory-runtime-query.ts";
import { readCompilerPrograms } from "../../../../tooling/src/floor/compiler/compiler-programs.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import type { NativeTypeFacts } from "../../../../tooling/src/verify/contract/project-context.ts";
import { gate as read } from "../../../../tooling/src/verify/gates/json-column-read-parsed.ts";
import { gate as write } from "../../../../tooling/src/verify/gates/json-column-write-parity.ts";
import { jsonColumnObservationPlan, jsonColumnObservedReaders } from "../../../../tooling/src/verify/lib/json-column-observed-readers.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeInventoryFixture } from "../../floor/compiler/native-inventory-fixture.ts";
import { nativeVerifyFixture } from "../../floor/compiler/native-verify-fixture.ts";

const NATIVE_JSON_TIMEOUT = scaledBudget(120_000);
const nativeSpan = (node: Node): InventorySpan => ({
  file: node.getSourceFile().getFilePath(),
  start: node.getStart(),
  end: node.getEnd(),
  kind: node.getKind(),
});
const POLICIES = [read, write];
const SIBLINGS = [...POLICIES.map(({ id }) => id), "open-json-column-key-parity"];
const SCHEMA = "packages/db/src/schema/settings.ts";
const ENTRY = "packages/server/src/domain/settings/persistence/proof.ts";

function fixture(root: string, repoRoot: string, browser: boolean): void {
  const put = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  put(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const files = {
    [SCHEMA]:
      "import{sqliteTable,text}from'drizzle-orm/sqlite-core';import type{Payload}from'../../../contracts/src/payload.ts';export const settings=sqliteTable('settings',{payload:text('payload',{mode:'json'}).$type<Payload>().notNull()});",
    "packages/contracts/src/payload.ts":
      "import * as z from'zod';export interface Payload{enabled:boolean}export const payloadSchema=z.object({enabled:z.boolean()});declare function defineVersionedConfig<T>(options:object):object;export const payloadConfig=defineVersionedConfig<Payload>({});",
    [ENTRY]:
      "import type{BaseSQLiteDatabase}from'drizzle-orm/sqlite-core';import{settings}from'../../../../../db/src/schema/settings.ts';import type{Payload}from'../../../../../contracts/src/payload.ts';import{parsePayload}from'#reader';declare const db:BaseSQLiteDatabase<'async',void>;export function unchecked(row:typeof settings.$inferSelect){return row.payload;}export function checked(row:typeof settings.$inferSelect){return parsePayload(row.payload);}export async function replace(next:Payload){return db.update(settings).set({payload:next});}export async function preserve(){const row=await db.select().from(settings).get();if(row===undefined)throw new Error('missing');return db.update(settings).set({payload:{...row.payload}});}",
    "packages/server/src/closed.ts":
      "import{payloadSchema}from'../../contracts/src/payload.ts';export function parsePayload(value:unknown){return payloadSchema.parse(value);}",
    "packages/server/src/foreign.ts":
      "const parser={parse(value:unknown){return value;}};export function parsePayload(value:unknown){return parser.parse(value);}",
  };
  for (const [path, text] of Object.entries(files)) {
    put(path, text);
  }
  const compilerOptions = {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "Bundler",
    strict: true,
    skipLibCheck: true,
    types: [],
    ...(browser ? { customConditions: ["browser"] } : {}),
  };
  put(
    "package.json",
    JSON.stringify({ type: "module", imports: { "#reader": { browser: "./packages/server/src/foreign.ts", default: "./packages/server/src/closed.ts" } } }),
  );
  put("tsconfig.json", JSON.stringify({ compilerOptions, files: Object.keys(files) }));
  put("packages/db/tsconfig.json", JSON.stringify({ compilerOptions, files: ["src/schema/settings.ts"] }));
  put("packages/contracts/tsconfig.json", JSON.stringify({ compilerOptions, files: ["src/payload.ts"] }));
  put(
    "packages/server/tsconfig.json",
    JSON.stringify({ compilerOptions, files: ["src/domain/settings/persistence/proof.ts", "src/closed.ts", "src/foreign.ts"] }),
  );
  put("tooling/tsconfig.json", JSON.stringify({ compilerOptions, files: SIBLINGS.map((id) => `src/verify/gates/${id}.ts`) }));
  for (const id of SIBLINGS) {
    put(
      `tooling/src/verify/gates/${id}.ts`,
      `export {gate} from ${JSON.stringify(new URL(`../../../../tooling/src/verify/gates/${id}.ts`, import.meta.url).href)};`,
    );
  }
  execFixtureGit(root, ["init", "-q"]);
}

test(
  "native JSON3 command preserves actual importing-world parsing and write authority without syntax meaning",
  async ({ scratch, repoRoot }) => {
    const inventoryFactory = await import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
    const producer = vi.spyOn(inventoryFactory, "createSemanticInventory").mockImplementation(nativeInventoryFixture);
    try {
      for (const browser of [false, true]) {
        const root = join(scratch, browser ? "browser" : "node");
        fixture(root, repoRoot, browser);
        const context = projectCtx(root);
        const symbols = Node.prototype.getSymbol;
        const types = Node.prototype.getType;
        const definitions = Identifier.prototype.getDefinitionNodes;
        const symbolPoison = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
          if (this.getProject() === context.project) {
            throw new Error("syntax JSON3 Symbol read");
          }
          return symbols.call(this);
        });
        const typePoison = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
          if (this.getProject() === context.project) {
            throw new Error("syntax JSON3 Type read");
          }
          return types.call(this);
        });
        const definitionPoison = vi.spyOn(Identifier.prototype, "getDefinitionNodes").mockImplementation(function (this: Identifier) {
          if (this.getProject() === context.project) {
            throw new Error("syntax JSON3 definition read");
          }
          return definitions.call(this);
        });
        try {
          const syntaxReads: number[] = [];
          expect.soft(await nativeVerifyFixture(root, "structure", ["--check=json-column-write-parity"], { forbidSyntax: true, syntaxReads })).toBe(1);
          expect(syntaxReads).toEqual([0]);
          const result = runPolicyPass({
            root,
            project: context.project,
            ...nativeTypeFactOptions(context),
            knownPolicies: POLICIES,
            policies: POLICIES,
            reviewedGrants: [],
            failOnWarnings: false,
          });
          expect.soft(result.toolErrors).toEqual([]);
          expect.soft(result.factErrors).toEqual([]);
          expect.soft(result.policies.find(({ id }) => id === read.id)?.findings).toHaveLength(browser ? 2 : 1);
          expect.soft(result.policies.find(({ id }) => id === write.id)?.findings).toMatchObject([
            { file: ENTRY, subject: `${ENTRY}#replace`, operation: "versioned-config-replace", token: "payload" },
            { file: ENTRY, subject: "settings.payload", operation: "json-column-straddle", token: "payload" },
          ]);
        } finally {
          definitionPoison.mockRestore();
          typePoison.mockRestore();
          symbolPoison.mockRestore();
        }
      }
    } finally {
      producer.mockRestore();
    }
  },
  NATIVE_JSON_TIMEOUT,
);

function ordinarySources(context: ReturnType<typeof projectCtx>): { readonly source: SourceFile; readonly schema: SourceFile; readonly contracts: SourceFile } {
  const source = context.project.getSourceFileOrThrow(join(context.root, ENTRY));
  const schema = context.project.getSourceFileOrThrow(join(context.root, SCHEMA));
  const contracts = context.project.getSourceFileOrThrow(join(context.root, "packages/contracts/src/payload.ts"));
  return { source, schema, contracts };
}
function observationControlFile(root: string): void {
  const path = join(root, ENTRY);
  const text = readFileSync(path, "utf8").replace("parsePayload(row.payload)", "parsePayload(row[KEY])");
  writeFileSync(
    path,
    "import{payloadSchema}from'../../../../../contracts/src/payload.ts';const KEY='payload';" +
      text +
      "export function late(value:unknown){return payloadSchema.safeParse(value);}",
  );
}
function replaceInvocationGraph(db: DatabaseSync, partition: string, owner: number, wire: InventoryInvocationEvidence): void {
  expect(db.prepare("PRAGMA foreign_keys").get()).toEqual({ ["foreign_keys"]: 0 });
  const atoms = [...invocationAtoms(jsonValueSchema.parse(wire))];
  db.prepare("DELETE FROM inventory_invocation_atom WHERE partition=? AND owner=?").run(partition, owner);
  const insert = db.prepare("INSERT INTO inventory_invocation_atom VALUES(?,?,?,?,?,?,?,?,?)");
  for (const atom of atoms) {
    insert.run(partition, owner, atom.ordinal, atom.parent, inventoryString(atom.key), atom.kind, atom.text, atom.number, atom.size);
  }
  db.prepare("UPDATE inventory_invocation_evidence SET atomCount=? WHERE partition=? AND ordinal=?").run(atoms.length, partition, owner);
}

test(
  "native ordinary cohorts preserve ordered initial parser closure, raw bindings and strict store ownership",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot, false);
    observationControlFile(scratch);
    const inventoryFactory = await import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
    const producer = vi.spyOn(inventoryFactory, "createSemanticInventory").mockImplementation(nativeInventoryFixture);
    try {
      const context = projectCtx(scratch);
      const { source, schema: schemaSource, contracts } = ordinarySources(context);
      const first = source.getFunctionOrThrow("checked").getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
      const second = source.getFunctionOrThrow("replace").getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
      const late = source.getFunctionOrThrow("late").getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
      const roots = [first, second];
      const plan = jsonColumnObservationPlan(roots, [
        { node: first, path: [] },
        { node: late, path: [] },
      ]);
      const reversed = jsonColumnObservationPlan([second, first], [{ node: first, path: [] }]);
      const empty = jsonColumnObservationPlan([], []);
      const contractCall = contracts.getVariableDeclarationOrThrow("payloadConfig").getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
      const contractPlan = jsonColumnObservationPlan([contractCall], []);
      using native = context.nativeTypeFacts?.();
      if (native === undefined) {
        throw new Error("real native observation session is missing");
      }
      native.request("catalog", { kind: "schema-data", nodes: [schemaSource] });
      native.request("read", { kind: "invocation-evidence", nodes: [source], plan });
      native.request("reversed", { kind: "invocation-evidence", nodes: [source], plan: reversed });
      native.request("empty", { kind: "invocation-evidence", nodes: [source], plan: empty });
      native.request("contracts", { kind: "invocation-evidence", nodes: [contracts], plan: contractPlan });
      native.request("none", { kind: "invocation-evidence", nodes: [], plan: empty });
      native.seal(new Set(["catalog", "read", "reversed", "empty", "contracts", "none"]));
      const catalog = native.schemaData("catalog", [schemaSource]);
      if (catalog.status !== "ready") {
        throw new Error(catalog.reason);
      }
      const evidence = native.invocationEvidence("read", [source], plan).get(source);
      const graph = evidence?.observations;
      if (evidence === undefined || graph === undefined) {
        throw new Error("ordinary graph is missing");
      }
      const delivered = jsonColumnObservedReaders(evidence, catalog.value);
      expect(graph.anchor).toBe(source);
      expect(graph.schemaStatus).toBe("ready");
      expect(graph.demand.roots).toEqual(roots);
      expect(graph.initialCalls[0]).toBe(first);
      expect(graph.terminals).toHaveLength(1);
      expect(graph.terminals.every((call) => !roots.includes(call))).toBe(true);
      expect(graph.terminals[0]?.getSourceFile().getBaseName()).toBe("closed.ts");
      expect(graph.initialCalls).not.toContain(late);
      expect(graph.terminals).not.toContain(late);
      const leaves = delivered.returned(first, []);
      expect(leaves.kind).toBe("resolved");
      if (leaves.kind !== "resolved") {
        throw new Error(leaves.detail);
      }
      expect(leaves.value).toHaveLength(1);
      expect(leaves.value[0]?.present).toBe(true);
      expect(leaves.value[0]?.value).toBe(graph.terminals[0]);
      expect(leaves.value[0]?.bindings.size).toBeGreaterThan(0);
      expect(delivered.returned(late, []).kind).toBe("unresolved");
      expect(delivered.readReaders.parse(late)).toBe(true);
      expect(() => delivered.returned(first, ["enabled"])).toThrow("was not registered");
      const reverse = native.invocationEvidence("reversed", [source], reversed).get(source)?.observations;
      expect(reverse?.demand.roots).toEqual([second, first]);
      expect(reverse?.initialCalls[0]).toBe(second);
      expect(reverse).not.toBe(graph);
      const emptyGraph = native.invocationEvidence("empty", [source], empty).get(source)?.observations;
      expect(emptyGraph?.anchor).toBe(source);
      expect(emptyGraph?.initialCalls).toEqual([]);
      expect(emptyGraph?.returned).toEqual([]);
      expect(emptyGraph?.terminals).toEqual([]);
      expect(native.invocationEvidence("none", [], empty).size).toBe(0);
      expect(() => native.invocationEvidence("none", [source], empty)).toThrow("not registered");
      expect(() => native.invocationEvidence("read", [source], { mode: "value", facets: [], arguments: [] })).toThrow("not registered");
      expect(() => native.invocationEvidence("read", [source], jsonColumnObservationPlan([late], []))).toThrow("not registered");
      const contractEvidence = native.invocationEvidence("contracts", [contracts], contractPlan).get(contracts);
      if (contractEvidence === undefined) {
        throw new Error("contract-only ordinary graph is missing");
      }
      const outside = jsonColumnObservedReaders(contractEvidence, catalog.value);
      expect(outside.graph.schemaStatus).toBe("unavailable");
      const bodyless = outside.graph.nodes.find((value) => value.node === contractCall)?.declaration;
      expect(bodyless?.kind).toBe("resolved");
      if (bodyless?.kind !== "resolved") {
        throw new Error("real bodyless declaration must remain resolved");
      }
      expect(bodyless.value.body).toBeUndefined();
      const column = catalog.value.tables[0]?.columns[0];
      if (column === undefined) {
        throw new Error("canonical JSON column is missing");
      }
      expect(() => outside.selected({ base: { kind: "schema-column", column: column.identity.key }, steps: [], displayAt: null })).toThrow(
        "complete schema view is unavailable",
      );

      assertOrdinaryStore({ scratch, context, source, plan, first, late, native, delivered, schema: catalog.value });
    } finally {
      producer.mockRestore();
    }
  },
  NATIVE_JSON_TIMEOUT,
);

function assertOrdinaryStore(input: {
  readonly scratch: string;
  readonly context: ReturnType<typeof projectCtx>;
  readonly source: SourceFile;
  readonly plan: ReturnType<typeof jsonColumnObservationPlan>;
  readonly first: CallExpression;
  readonly late: CallExpression;
  readonly native: NativeTypeFacts;
  readonly delivered: ReturnType<typeof jsonColumnObservedReaders>;
  readonly schema: SchemaProjectedModel;
}): void {
  const { scratch, context, source, plan, first, late, native, delivered, schema } = input;
  using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  const generation = latestInventoryGeneration(db);
  const partitions = readInventoryGeneration(db, generation);
  const partition = partitions.find((value) => value.program === "packages/server/tsconfig.json");
  if (partition === undefined) {
    throw new Error("native server partition is missing");
  }
  const query = { ...plan, node: nativeSpan(source) };
  const wire = [...readInventoryInvocationEvidence(db, partition.id, query)][0];
  const captured = wire?.observations;
  if (wire === undefined || captured === undefined) {
    throw new Error("persisted ordinary graph is missing");
  }
  expect(wire.sources).toEqual([]);
  expect(partition.families).not.toContain("bindings");
  expect(hasInventoryInvocationCoverage(db, partition.id, [query], wire.observationBasis ?? null)).toBe(true);
  expect(hasInventoryInvocationCoverage(db, partition.id, [query], null)).toBe(false);
  const inputs = new Set(readInventoryRuntime(db, partition.id, "worker").sources.map((record) => record.path));
  for (const helper of [
    "ordinary-observations.ts",
    "ordinary-observations-codec.ts",
    "ordinary-observations-inventory.ts",
    "drizzle-row.ts",
    "drizzle-writer-source.ts",
    "assignability.ts",
  ]) {
    expect(
      [...inputs].some((path) => path.endsWith("/code-facts/" + helper)),
      helper,
    ).toBe(true);
  }
  const row = db
    .prepare("SELECT ordinal FROM inventory_invocation_evidence WHERE partition=? AND key=?")
    .get(partition.id, inventoryString(invocationQueryKey(query)));
  const owner = row?.["ordinal"];
  if (typeof owner !== "number") {
    throw new Error("persisted ordinary graph owner is missing");
  }
  using borrowed = inventoryReader(scratch, generation, partitions, { db, dispose: () => undefined });
  expect(borrowed.invocationEvidence(source, partition.program, plan).observations?.terminals).toHaveLength(1);
  const withBody = captured.nodes.find((value) => value.declaration.kind === "resolved" && value.declaration.value.body !== null);
  const declaration = withBody?.declaration;
  if (withBody === undefined || declaration?.kind !== "resolved") {
    throw new Error("actual authored helper body is missing");
  }
  const mutants: readonly [string, InventoryInvocationEvidence][] = [
    [
      "body is incomplete or foreign",
      {
        ...wire,
        observations: {
          ...captured,
          nodes: captured.nodes.map((value) =>
            value === withBody ? { ...value, declaration: { ...declaration, value: { ...declaration.value, body: null } } } : value,
          ),
        },
      },
    ],
    [
      "cohort is missing or foreign",
      { ...wire, observations: { ...captured, demand: { ...captured.demand, roots: [...captured.demand.roots, nativeSpan(late)] } } },
    ],
    ["returned-query coverage", { ...wire, observations: { ...captured, returned: [] } }],
    ["root/initial-closure/terminal membership", { ...wire, observations: { ...captured, initialCalls: [] } }],
    ["frozen terminal membership", { ...wire, observations: { ...captured, terminals: [] } }],
    ["basis is outside the pinned generation", { ...wire, observationBasis: { program: partition.program, partition: "foreign" } }],
  ];
  for (const [message, mutant] of mutants) {
    db.exec("PRAGMA foreign_keys=OFF;BEGIN IMMEDIATE;");
    try {
      replaceInvocationGraph(db, partition.id, owner, mutant);
      expect(() => jsonColumnObservedReaders(borrowed.invocationEvidence(source, partition.program, plan), schema)).toThrow(message);
    } finally {
      db.exec("ROLLBACK;PRAGMA foreign_keys=ON;");
    }
  }
  for (const field of ["lexical", "bindings", "keys"]) {
    db.exec("PRAGMA foreign_keys=OFF;BEGIN IMMEDIATE;");
    try {
      db.prepare("UPDATE inventory_invocation_atom SET key=? WHERE partition=? AND owner=? AND key=?").run(
        inventoryString("missing-" + field),
        partition.id,
        owner,
        inventoryString(field),
      );
      expect(() => borrowed.invocationEvidence(source, partition.program, plan)).toThrow(field);
    } finally {
      db.exec("ROLLBACK;PRAGMA foreign_keys=ON;");
    }
  }
  db.exec("PRAGMA foreign_keys=OFF;BEGIN IMMEDIATE;");
  try {
    db.prepare("DELETE FROM inventory_computed_name WHERE partition=?").run(partition.id);
    expect(() => borrowed.invocationEvidence(source, partition.program, plan)).toThrow("computed-name coverage");
  } finally {
    db.exec("ROLLBACK;PRAGMA foreign_keys=ON;");
  }
  const stillCurrent = jsonColumnObservedReaders(borrowed.invocationEvidence(source, partition.program, plan), schema);
  expect(stillCurrent.returned(first, []).kind).toBe("resolved");
  native[Symbol.dispose]();
  expect(() => delivered.returned(first, [])).toThrow("disposed");
  const imported = context.project.getSourceFileOrThrow(join(scratch, "packages/server/src/closed.ts"));
  imported.replaceWithText(imported.getFullText() + "\nexport const changed = true;");
  expect(() => stillCurrent.schemaReaders.module(first.getExpression())).toThrow("closed source epoch is stale");
}

test(
  "ordinary observation catalog and consumer facts stay atomic across a current imported-helper overlay",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot, false);
    const context = projectCtx(scratch);
    const { source, schema } = ordinarySources(context);
    const call = source.getFunctionOrThrow("checked").getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
    const plan = jsonColumnObservationPlan([call], [{ node: call, path: [] }]);
    const programs = readCompilerPrograms(scratch);
    const dbOwner = programs.find((program) => program.id === "packages/db/tsconfig.json");
    const consumer = programs.find((program) => program.id === "packages/server/tsconfig.json");
    if (dbOwner === undefined || consumer === undefined) {
      throw new Error("canonical catalog/consumer owners are missing");
    }
    const options = {
      root: scratch,
      programs: [dbOwner, consumer],
      families: ["schema-data", "drizzle-identities", "invocation-evidence", "global-origins", "computed-names"] as const,
      schemaQuery: { program: dbOwner.id, sources: [nativeSpan(schema)] },
      schemaDataQuery: { program: dbOwner.id, sources: [nativeSpan(schema)] },
      drizzleQueries: [],
      globalOriginQueries: [],
      globalBindingQueries: [],
      computedNameQueries: [],
      invocationQueries: [{ program: consumer.id, query: { ...plan, node: nativeSpan(source) } }],
    };
    using original = nativeInventoryFixture(options);
    expect(original.invocationEvidence(source, consumer.id, plan).observations?.terminals).toHaveLength(1);
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    const committed = latestInventoryGeneration(db);
    const helper = "packages/server/src/closed.ts";
    const projection = {
      root: scratch,
      files: [
        {
          path: join(scratch, helper),
          text: "const custom={parse(value:unknown){return value;}};export function parsePayload(value:unknown){return custom.parse(value);}",
        },
      ],
      deleted: [],
    };
    using overlay = nativeInventoryFixture(options, { projection });
    expect(() => overlay.invocationEvidence(source, consumer.id, plan)).toThrow("replay source/epoch is stale");
    const currentSource = overlay.sourceCorpus().getSourceFile(ENTRY);
    const currentCall = currentSource?.getFunctionOrThrow("checked").getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
    if (currentSource === undefined || currentCall === undefined) {
      throw new Error("actual overlay query source is missing");
    }
    const currentPlan = jsonColumnObservationPlan([currentCall], [{ node: currentCall, path: [] }]);
    const projected = overlay.invocationEvidence(currentSource, consumer.id, currentPlan).observations;
    expect(projected?.demand.roots).toEqual([currentCall]);
    expect(projected?.terminals).toEqual([]);
    expect(projected?.returned).toHaveLength(1);
    expect(latestInventoryGeneration(db)).toBe(committed);
    expect(original.invocationEvidence(source, consumer.id, plan).observations?.terminals).toHaveLength(1);
  },
  NATIVE_JSON_TIMEOUT,
);
