import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { inventoryConsumerClass } from "@orb/tooling/floor/code-facts/inventory-consumers";
import { createSemanticInventory } from "@orb/tooling/floor/code-facts/semantic-inventory";
import type { InventoryBuildRequest, InventoryPartition } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import { INVENTORY_FORMAT } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import {
  latestInventoryGeneration,
  openInventoryDatabase,
  publishInventoryGeneration,
  readInventoryGeneration,
} from "@orb/tooling/floor/code-facts/semantic-inventory-database";
import { descriptorVersion, inputVersion } from "@orb/tooling/floor/code-facts/semantic-inventory-inputs";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { Project } from "ts-morph";

function write(root: string, path: string, text: string): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, text);
}

function initialize(root: string): void {
  write(root, ".gitignore", ".cache/\n");
  write(root, "tsconfig.a.json", JSON.stringify({ files: ["a.ts"], compilerOptions: { noLib: true, types: [] } }));
  write(root, "tsconfig.b.json", JSON.stringify({ files: ["b.ts"], compilerOptions: { noLib: true, types: [] } }));
  write(root, "a.ts", "export const a=1;\n");
  write(root, "b.ts", "export const b=2;\n");
  execFixtureGit(root, ["init", "-q"]);
}

function partition(request: InventoryBuildRequest): InventoryPartition {
  const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true, useInMemoryFileSystem: true });
  const sources = request.descriptor.files.map((path) => {
    const file = join(request.root, path);
    return { file, path: file, consumerClass: inventoryConsumerClass(file), text: readFileSync(file, "utf8"), authored: true };
  });
  const exports = sources.flatMap((source) => {
    const sf = project.createSourceFile(source.file, source.text);
    return sf.getVariableDeclarations().map((declaration) => ({
      file: source.file,
      name: declaration.getName(),
      declarations: [{ file: source.file, start: declaration.getStart(), end: declaration.getEnd(), kind: declaration.getKind() }],
    }));
  });
  const inputs = [...request.descriptor.configPaths.map((path) => join(request.root, path)), ...sources.map((source) => source.file)].map((path) => ({
    path,
    kind: "file" as const,
    version: inputVersion(path, "file"),
  }));
  return {
    format: INVENTORY_FORMAT,
    program: request.descriptor.id,
    descriptorVersion: descriptorVersion(request.descriptor),
    compilerOptionsJson: JSON.stringify(request.descriptor.commandLine.options),
    configPaths: [...request.descriptor.configPaths],
    projectReferences: [...request.descriptor.references],
    roots: sources.map((source) => source.file),
    nativeRoots: sources.map((source) => source.path),
    inputs,
    sources,
    exports,
    modules: [],
    bindings: [],
    references: [],
    witnesses: [],
  };
}

function stage(request: InventoryBuildRequest): void {
  using database = openInventoryDatabase(request.destination);
  database.exec("BEGIN IMMEDIATE");
  publishInventoryGeneration(database, [partition(request)]);
  database.exec("COMMIT");
}

test("unchanged and independently invalidated partitions reuse without worker construction", ({ scratch }) => {
  initialize(scratch);
  const builds: string[] = [];
  const buildPartition = (request: InventoryBuildRequest): void => {
    builds.push(request.descriptor.id);
    stage(request);
  };
  using first = createSemanticInventory({ root: scratch, buildPartition });
  expect(builds).toEqual(["tsconfig.a.json", "tsconfig.b.json"]);
  builds.length = 0;
  using same = createSemanticInventory({ root: scratch, buildPartition });
  expect(same.generation).toBe(first.generation);
  expect(builds).toEqual([]);
  write(scratch, "a.ts", "export const changed=3;\n");
  using changed = createSemanticInventory({ root: scratch, buildPartition });
  expect(builds).toEqual(["tsconfig.a.json"]);
  expect(changed.sourceCorpus().getSourceFile("a.ts")?.getVariableDeclaration("changed")).toBeDefined();
  expect(first.sourceCorpus().getSourceFile("a.ts")?.getVariableDeclaration("a")).toBeDefined();
});

test("failed or wrong workers retain the committed generation but refuse the current verdict", ({ scratch }) => {
  initialize(scratch);
  using previous = createSemanticInventory({ root: scratch, buildPartition: stage });
  write(scratch, "a.ts", "export const changed=3;\n");
  expect(() =>
    createSemanticInventory({
      root: scratch,
      buildPartition: () => {
        throw new Error("worker failed");
      },
    }),
  ).toThrow("worker failed");
  const wrong = (request: InventoryBuildRequest): void => {
    using db = openInventoryDatabase(request.destination);
    publishInventoryGeneration(db, [{ ...partition(request), program: "wrong" }]);
  };
  expect(() => createSemanticInventory({ root: scratch, buildPartition: wrong })).toThrow("wrong partition");
  using database = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  expect(latestInventoryGeneration(database)).toBe(previous.generation);
  expect(readInventoryGeneration(database, previous.generation).find((row) => row.program === "tsconfig.a.json")?.sources[0]?.text).toContain("a=1");
});

test("a changed reused world refuses complete publication while pinned readers see the prior generation", ({ scratch }) => {
  initialize(scratch);
  using previous = createSemanticInventory({ root: scratch, buildPartition: stage });
  write(scratch, "b.ts", "export const changedB=3;\n");
  const changeDuringBuild = (request: InventoryBuildRequest): void => {
    using reader = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    expect(latestInventoryGeneration(reader)).toBe(previous.generation);
    expect(previous.sourceCorpus().getSourceFile("a.ts")?.getFullText()).toContain("a=1");
    stage(request);
    write(scratch, "a.ts", "export const changedA=4;\n");
  };
  expect(() => createSemanticInventory({ root: scratch, buildPartition: changeDuringBuild })).toThrow("inputs changed during extraction");
  using database = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  expect(latestInventoryGeneration(database)).toBe(previous.generation);
  using complete = createSemanticInventory({ root: scratch, buildPartition: stage });
  expect(complete.generation).toBeGreaterThan(previous.generation);
  expect(complete.sourceCorpus().getSourceFile("a.ts")?.getFullText()).toContain("changedA");
  expect(complete.sourceCorpus().getSourceFile("b.ts")?.getFullText()).toContain("changedB");
  expect(previous.sourceCorpus().getSourceFile("a.ts")?.getFullText()).toContain("a=1");
});
