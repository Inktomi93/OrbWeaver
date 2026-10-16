import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import { ID_BRAND_HOME } from "../../../../tooling/src/floor/code-facts/id-brand.ts";
import { createSemanticInventory } from "../../../../tooling/src/floor/code-facts/semantic-inventory.ts";
import type { InventorySpan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import {
  latestInventoryGeneration,
  openInventoryDatabase,
  readInventoryGeneration,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts";
import { inputsCurrent, inventoryAuthoredFiles } from "../../../../tooling/src/floor/code-facts/semantic-inventory-inputs.ts";
import { readInventoryBrands, readInventoryInputs } from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { inventoryString } from "../../../../tooling/src/floor/code-facts/semantic-inventory-records.ts";
import { readCompilerPrograms } from "../../../../tooling/src/floor/compiler/compiler-programs.ts";
import { inventoryFileSystem } from "../../../../tooling/src/floor/compiler/semantic-inventory-filesystem.ts";
import { runInventoryPartitionWorker } from "../../../../tooling/src/floor/compiler/semantic-inventory-worker-run.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { scaledBudget } from "../../_load-budget.ts";

const ENTRY = "packages/server/src/ids.ts";
const PROGRAM = "tsconfig.json";
function span(node: Node): InventorySpan {
  return { file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() };
}
function setup(root: string): {
  readonly options: Parameters<typeof createSemanticInventory>[0];
  readonly source: import("ts-morph").SourceFile;
  readonly targets: readonly import("ts-morph").TypeNode[];
  readonly alias: import("ts-morph").TypeNode;
} {
  const put = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  put(".gitignore", ".cache/\n");
  put(
    PROGRAM,
    JSON.stringify({ compilerOptions: { noLib: true, types: [], strict: true, module: "ESNext", moduleResolution: "Bundler" }, files: [ENTRY, ID_BRAND_HOME] }),
  );
  put(
    ID_BRAND_HOME,
    "declare const brand:unique symbol;export type Branded<P extends string>=string & {readonly [brand]:P};export type TypeIdOf<P extends string>=Branded<P>;export type ChatId=TypeIdOf<'chat'>;export declare function brandedId<T>():T;",
  );
  put(
    ENTRY,
    "import {brandedId,type TypeIdOf} from '../../kit/src/ids/index';export type Default=TypeIdOf<'default'>;export const selected=brandedId<TypeIdOf<'chat'>>();export const plain=brandedId<string>();export const unrequested=brandedId<TypeIdOf<'other'>>();",
  );
  execFixtureGit(root, ["init", "-q"]);
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const source = project.addSourceFileAtPath(join(root, ENTRY));
  return {
    source,
    targets: source.getDescendantsOfKind(SyntaxKind.CallExpression).flatMap((call) => call.getTypeArguments()),
    alias: source.getTypeAliasOrThrow("Default").getTypeNodeOrThrow(),
    options: { root, programs: readCompilerPrograms(root), families: ["id-brands"] },
  };
}

test(
  "exact brand nominations preserve default rows, null, deduplication, reuse and source lifetimes",
  ({ scratch }) => {
    const fixture = setup(scratch);
    const [selected, plain, unrequested] = fixture.targets;
    if (selected === undefined || plain === undefined || unrequested === undefined) {
      throw new Error("brand demand controls are missing");
    }
    using original = createSemanticInventory(fixture.options);
    expect(original.idBrand(fixture.alias, PROGRAM)).toBe('"default"');
    expect(() => original.idBrand(selected, PROGRAM)).toThrow("span is unavailable");
    const queries = [selected, plain, fixture.alias, selected].map((node) => ({ program: PROGRAM, node: span(node) }));
    const options = { ...fixture.options, idBrandQueries: queries };
    using current = createSemanticInventory(options);
    expect(current.idBrand(selected, PROGRAM)).toBe('"chat"');
    expect(current.idBrand(plain, PROGRAM)).toBeNull();
    expect(current.idBrand(fixture.alias, PROGRAM)).toBe('"default"');
    expect(() => current.idBrand(unrequested, PROGRAM)).toThrow("span is unavailable");
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    for (const partition of readInventoryGeneration(db, current.generation)) {
      const rows = [...readInventoryBrands(db, partition.id, span(fixture.alias))];
      expect(rows).toHaveLength(1);
    }
    using reused = createSemanticInventory({
      ...options,
      buildPartition: (): never => {
        throw new Error("unchanged exact brand demand rebuilt");
      },
    });
    expect(reused.generation).toBe(current.generation);
    expect(() => createSemanticInventory({ ...options, idBrandQueries: [{ program: "foreign", node: span(selected) }] })).toThrow("admitted native programs");
    const foreign = new Project({ useInMemoryFileSystem: true })
      .createSourceFile("/foreign.ts", "type Foreign=string;")
      .getTypeAliasOrThrow("Foreign")
      .getTypeNodeOrThrow();
    expect(() => current.idBrand(foreign, PROGRAM)).toThrow();
    fixture.source.addStatements("export const changed=1;");
    expect(() => current.idBrand(selected, PROGRAM)).toThrow("source/epoch is not admitted");
    current[Symbol.dispose]();
    expect(() => current.idBrand(selected, PROGRAM)).toThrow("disposed");
  },
  scaledBudget(30_000),
);

test(
  "missing exact brand coverage, invalid nominees and helper changes never publish a replacement generation",
  ({ scratch }) => {
    const fixture = setup(scratch);
    const [selected] = fixture.targets;
    if (selected === undefined) {
      throw new Error("brand publication control is missing");
    }
    using original = createSemanticInventory(fixture.options);
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    const options = { ...fixture.options, idBrandQueries: [{ program: PROGRAM, node: span(selected) }] };
    expect(() =>
      createSemanticInventory({
        ...options,
        buildPartition: (request) => {
          runInventoryPartitionWorker(request);
          using staging = openInventoryDatabase(request.destination);
          const removed = staging
            .prepare("DELETE FROM inventory_brand WHERE node IN (SELECT ordinal FROM inventory_span WHERE file=? AND start=? AND end=? AND kind=?)")
            .run(inventoryString(span(selected).file), selected.getStart(), selected.getEnd(), selected.getKind());
          expect(Number(removed.changes)).toBe(1);
        },
      }),
    ).toThrow("incomplete id-brand coverage");
    expect(latestInventoryGeneration(db)).toBe(original.generation);
    expect(original.idBrand(fixture.alias, PROGRAM)).toBe('"default"');
    expect(() =>
      createSemanticInventory({ ...options, idBrandQueries: [{ program: PROGRAM, node: { ...span(selected), start: selected.getStart() + 1 } }] }),
    ).toThrow("query span is unavailable");
    expect(latestInventoryGeneration(db)).toBe(original.generation);
    const helper = fileURLToPath(new URL("../../../../tooling/src/floor/code-facts/id-brand.ts", import.meta.url));
    const changed = inventoryFileSystem(new Project({ skipAddingFilesFromTsConfig: true }).getFileSystem(), {
      root: scratch,
      files: [{ path: helper, text: readFileSync(helper, "utf8") + "\n" }],
      deleted: [],
    });
    for (const partition of readInventoryGeneration(db, original.generation)) {
      const inputs = [...readInventoryInputs(db, partition.id)];
      expect(inputs.some((input) => input.path === helper && input.kind === "file")).toBe(true);
      expect(inputsCurrent(inputs, { authored: inventoryAuthoredFiles(scratch), fileSystem: changed })).toBe(false);
    }
    expect(() => createSemanticInventory({ ...options, fileSystem: changed })).toThrow("inputs changed during extraction");
    expect(latestInventoryGeneration(db)).toBe(original.generation);
  },
  scaledBudget(30_000),
);

test("an ID-only warm generation rebuilds and refuses publication after its query-span helper changes", ({ scratch }) => {
  const fixture = setup(scratch);
  const selected = fixture.targets[0];
  if (selected === undefined) {
    throw new Error("ID-only helper invalidation control is missing");
  }
  const options = { ...fixture.options, idBrandQueries: [{ program: PROGRAM, node: span(selected) }] };
  using initial = createSemanticInventory(options);
  using warm = createSemanticInventory({
    ...options,
    buildPartition: (): never => {
      throw new Error("unchanged ID-only generation rebuilt");
    },
  });
  expect(warm.generation).toBe(initial.generation);
  const helper = fileURLToPath(new URL("../../../../tooling/src/floor/compiler/drizzle-inventory-extract.ts", import.meta.url));
  const changed = inventoryFileSystem(new Project({ skipAddingFilesFromTsConfig: true }).getFileSystem(), {
    root: scratch,
    files: [{ path: helper, text: readFileSync(helper, "utf8") + "\n" }],
    deleted: [],
  });
  let builds = 0;
  expect(() =>
    createSemanticInventory({
      ...options,
      fileSystem: changed,
      buildPartition: (request) => {
        builds += 1;
        runInventoryPartitionWorker(request);
      },
    }),
  ).toThrow("inputs changed during extraction");
  expect(builds).toBe(1);
  using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  expect(latestInventoryGeneration(db)).toBe(initial.generation);
  expect(initial.idBrand(selected, PROGRAM)).toBe('"chat"');
});
