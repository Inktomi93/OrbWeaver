// Reference demand coverage preserves exact native answers without rebuilding a covered partition.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { createSemanticWorkspace } from "@orb/tooling/floor/compiler/ts-workspace";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import type { Node } from "ts-morph";
import type { InventoryBuildRequest, InventorySpan, SemanticInventoryOptions } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { openInventoryDatabase, readInventoryGeneration } from "../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeInventoryFixture } from "../compiler/native-inventory-fixture.ts";

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("reference demand fixture is incomplete");
  }
  return value;
}

function span(node: Node): InventorySpan {
  return { file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() };
}

function demandFixture(root: string): SemanticInventoryOptions & Required<Pick<SemanticInventoryOptions, "programs" | "referenceDemand">> {
  writeFileSync(join(root, ".gitignore"), ".cache/\n");
  writeFileSync(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { noLib: true, types: [] }, files: ["source.ts", "consumer.ts"] }));
  writeFileSync(join(root, "source.ts"), "export const value=1; export const isolated=2; export const missing=3;");
  writeFileSync(join(root, "consumer.ts"), "import {value} from './source'; export const consumed=value;");
  execFixtureGit(root, ["init", "-q"]);
  const workspace = createSemanticWorkspace({ root });
  const program = required(workspace.program("tsconfig.json"));
  const source = required(program.project().getSourceFile(join(root, "source.ts")));
  return {
    root,
    programs: [program.descriptor],
    families: ["references"],
    referenceDemand: {
      mode: "closed",
      queries: ["value", "isolated"].map((name) => ({
        program: program.descriptor.id,
        root: span(source),
        node: span(source.getVariableDeclarationOrThrow(name).getNameNode()),
      })),
    },
  };
}

test("bounded reference demand cold capture and narrower warm acquisition", { timeout: scaledBudget(120_000) }, ({ scratch }) => {
  const options = demandFixture(scratch);
  const coldWorkers: string[] = [];
  const coldStart = performance.now();
  using cold = nativeInventoryFixture(options, { workers: coldWorkers });
  const coldMs = performance.now() - coldStart;
  const warmWorkers: string[] = [];
  const warmStart = performance.now();
  using warm = nativeInventoryFixture(
    { ...options, referenceDemand: { mode: "closed", queries: [required(options.referenceDemand.queries[0])] } },
    { workers: warmWorkers },
  );
  const warmMs = performance.now() - warmStart;
  console.info(JSON.stringify({ scope: "fixture/tsconfig.json", families: options.families, coldMs, warmMs, coldWorkers, warmWorkers }));
  const before = required(cold.sourceCorpus().getSourceFile("source.ts"));
  const after = required(warm.sourceCorpus().getSourceFile("source.ts"));
  const expected = cold.references(before.getVariableDeclarationOrThrow("value").getNameNode(), "tsconfig.json", before).map(span);
  expect(expected.length).toBeGreaterThan(0);
  expect(warm.references(after.getVariableDeclarationOrThrow("value").getNameNode(), "tsconfig.json", after).map(span)).toEqual(expected);
  expect(coldWorkers).toEqual(["tsconfig.json"]);
  expect(warmWorkers).toEqual([]);
  expect(warm.generation).toBe(cold.generation);
});

test.for(["closed", "complete"] as const)(
  "a %s reference partition reuses covered subsets, reordered pairs and duplicate demand without a worker",
  { timeout: scaledBudget(120_000) },
  (mode, { scratch }) => {
    const options = demandFixture(scratch);
    using first = nativeInventoryFixture({ ...options, referenceDemand: { ...options.referenceDemand, mode } });
    const original = required(first.sourceCorpus().getSourceFile("source.ts"));
    const expected = first.references(original.getVariableDeclarationOrThrow("value").getNameNode(), "tsconfig.json", original).map(span);
    expect(expected.length).toBeGreaterThan(0);
    const queries = options.referenceDemand.queries;
    for (const selected of [[required(queries[0])], [required(queries[1])], [...queries].reverse(), [...queries, ...queries], []]) {
      const workers: string[] = [];
      using reused = nativeInventoryFixture({ ...options, referenceDemand: { mode: "closed", queries: selected } }, { workers, failWorker: true });
      expect(workers).toEqual([]);
      expect(reused.generation).toBe(first.generation);
      const source = required(reused.sourceCorpus().getSourceFile("source.ts"));
      expect(reused.references(source.getVariableDeclarationOrThrow("value").getNameNode(), "tsconfig.json", source).map(span)).toEqual(expected);
      expect(reused.references(source.getVariableDeclarationOrThrow("isolated").getNameNode(), "tsconfig.json", source)).toEqual([]);
    }
    expect(first.references(original.getVariableDeclarationOrThrow("value").getNameNode(), "tsconfig.json", original).map(span)).toEqual(expected);
  },
);

test("omitted reference demand extracts a closed empty slice rather than declaration unions", { timeout: scaledBudget(60_000) }, ({ scratch }) => {
  const options = demandFixture(scratch);
  const requests: InventoryBuildRequest[] = [];
  using inventory = nativeInventoryFixture({ root: scratch, programs: options.programs, families: ["references"] }, { requests });
  expect(requests.map((request) => request.referenceDemand)).toEqual([{ mode: "closed", queries: [] }]);
  using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  const partition = required(readInventoryGeneration(db, inventory.generation)[0]);
  expect(partition.referenceMode).toBe("closed");
  expect(db.prepare("SELECT COUNT(*) AS count FROM inventory_reference WHERE partition=?").get(partition.id)?.["count"]).toBe(0);
  const source = required(inventory.sourceCorpus().getSourceFile("source.ts"));
  expect(() => inventory.references(source.getVariableDeclarationOrThrow("value"))).toThrow("requires complete reference coverage");
  expect(() => inventory.references(source.getVariableDeclarationOrThrow("value").getNameNode(), "tsconfig.json", source)).toThrow("coverage is unavailable");
});

test.for(["closed", "complete"] as const)(
  "a %s reference partition rebuilds missing exact pairs without publishing failed answers",
  { timeout: scaledBudget(120_000) },
  (mode, { scratch }) => {
    const options = demandFixture(scratch);
    using first = nativeInventoryFixture({ ...options, referenceDemand: { ...options.referenceDemand, mode } });
    const source = required(first.sourceCorpus().getSourceFile("source.ts"));
    const consumer = required(first.sourceCorpus().getSourceFile("consumer.ts"));
    const value = source.getVariableDeclarationOrThrow("value").getNameNode();
    const expected = first.references(value, "tsconfig.json", source).map(span);
    const pair = required(options.referenceDemand.queries[0]);
    for (const query of [
      { ...pair, node: span(source.getVariableDeclarationOrThrow("missing").getNameNode()) },
      { ...pair, root: span(consumer) },
    ]) {
      const workers: string[] = [];
      expect(() => nativeInventoryFixture({ ...options, referenceDemand: { mode: "closed", queries: [query] } }, { workers, failWorker: true })).toThrow(
        "injected native worker exit",
      );
      expect(workers).toEqual(["tsconfig.json"]);
      expect(first.references(value, "tsconfig.json", source).map(span)).toEqual(expected);
    }
    const workers: string[] = [];
    using same = nativeInventoryFixture(options, { workers, failWorker: true });
    expect(workers).toEqual([]);
    expect(same.generation).toBe(first.generation);
  },
);

test("a closed reference partition cannot satisfy complete declaration-union demand", { timeout: scaledBudget(60_000) }, ({ scratch }) => {
  const options = demandFixture(scratch);
  using first = nativeInventoryFixture(options);
  expect(() => nativeInventoryFixture({ ...options, referenceDemand: { mode: "complete", queries: [] } }, { failWorker: true })).toThrow(
    "injected native worker exit",
  );
  using same = nativeInventoryFixture(options, { failWorker: true });
  expect(same.generation).toBe(first.generation);
});

test("identical importer and query spans in another native program do not borrow stored coverage", { timeout: scaledBudget(60_000) }, ({ scratch }) => {
  const options = demandFixture(scratch);
  writeFileSync(
    join(scratch, "tsconfig.tests-dom.json"),
    JSON.stringify({ compilerOptions: { noLib: true, types: [], strict: true }, files: ["source.ts", "consumer.ts"] }),
  );
  using first = nativeInventoryFixture(options);
  const other = required(createSemanticWorkspace({ root: scratch }).program("tsconfig.tests-dom.json")).descriptor;
  const workers: string[] = [];
  expect(() =>
    nativeInventoryFixture(
      {
        ...options,
        programs: [other],
        referenceDemand: { mode: "closed", queries: options.referenceDemand.queries.map((query) => ({ ...query, program: other.id })) },
      },
      { workers, failWorker: true },
    ),
  ).toThrow("injected native worker exit");
  expect(workers).toEqual([other.id]);
  using same = nativeInventoryFixture(options, { failWorker: true });
  expect(same.generation).toBe(first.generation);
});

test("covered reference demand still invalidates dependency changes while a pinned generation retains its answer", { timeout: scaledBudget(120_000) }, ({
  scratch,
}) => {
  const options = demandFixture(scratch);
  using first = nativeInventoryFixture(options);
  const source = required(first.sourceCorpus().getSourceFile("source.ts"));
  const value = source.getVariableDeclarationOrThrow("value").getNameNode();
  const expected = first.references(value, "tsconfig.json", source).map(span);
  expect(expected.length).toBeGreaterThan(0);
  writeFileSync(join(scratch, "consumer.ts"), "import {value} from './source'; export const consumed=value; export const extra=value;");
  const narrower = { ...options, referenceDemand: { mode: "closed" as const, queries: [required(options.referenceDemand.queries[0])] } };
  expect(() => nativeInventoryFixture(narrower, { failWorker: true })).toThrow("injected native worker exit");
  const workers: string[] = [];
  using changed = nativeInventoryFixture(narrower, { workers });
  expect(workers).toEqual(["tsconfig.json"]);
  expect(changed.generation).toBeGreaterThan(first.generation);
  const current = required(changed.sourceCorpus().getSourceFile("source.ts"));
  const currentValue = current.getVariableDeclarationOrThrow("value").getNameNode();
  expect(changed.references(currentValue, "tsconfig.json", current)).toHaveLength(expected.length + 1);
  expect(first.references(value, "tsconfig.json", source).map(span)).toEqual(expected);
  changed[Symbol.dispose]();
  expect(() => changed.references(currentValue, "tsconfig.json", current)).toThrow("disposed");
});
