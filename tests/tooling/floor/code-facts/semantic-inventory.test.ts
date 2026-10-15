// @subject tooling/src/floor/code-facts/semantic-inventory-records.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { StatementSync } from "node:sqlite";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { inventoryConsumerClass } from "@orb/tooling/floor/code-facts/inventory-consumers";
import { createSemanticInventory } from "@orb/tooling/floor/code-facts/semantic-inventory";
import type { InventoryBuildRequest, InventoryPartition, StoredInventoryPartition } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import { INVENTORY_FORMAT, inventoryFamilies } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import {
  inventoryGenerationPrograms,
  latestInventoryGeneration,
  latestInventoryPartitions,
  openInventoryDatabase,
  publishInventoryGeneration,
  readInventoryGeneration,
} from "@orb/tooling/floor/code-facts/semantic-inventory-database";
import { descriptorVersion, inputVersion } from "@orb/tooling/floor/code-facts/semantic-inventory-inputs";
import { readCompilerPrograms } from "@orb/tooling/floor/compiler/compiler-programs";
import { extractInventoryPartition } from "@orb/tooling/floor/compiler/semantic-inventory-extract";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { Project } from "ts-morph";
import { vi } from "vitest";
import {
  readInventoryBindings,
  readInventoryBrands,
  readInventoryCasts,
  readInventoryExports,
  readInventoryInputs,
  readInventoryModules,
  readInventoryReferences,
  readInventorySources,
  readInventoryWitnesses,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";

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
    families: inventoryFamilies(request.families),
    casts: [],
    brands: [],
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

function completePartition(database: ReturnType<typeof openInventoryDatabase>, stored: StoredInventoryPartition): InventoryPartition {
  const { id, ...metadata } = stored;
  return {
    ...metadata,
    inputs: [...readInventoryInputs(database, id)],
    casts: stored.families.includes("cast-relations") ? [...readInventoryCasts(database, id)] : [],
    brands: stored.families.includes("id-brands") ? [...readInventoryBrands(database, id)] : [],
    sources: [...readInventorySources(database, id)],
    exports: [...readInventoryExports(database, id)],
    modules: [...readInventoryModules(database, id)],
    bindings: [...readInventoryBindings(database, id)],
    references: [...readInventoryReferences(database, id)],
    witnesses: [...readInventoryWitnesses(database, id)],
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
  expect(
    readInventoryGeneration(database, previous.generation).flatMap((row) =>
      row.program === "tsconfig.a.json" ? [...readInventorySources(database, row.id)] : [],
    )[0]?.text,
  ).toContain("a=1");
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

test("native partition storage never serializes or decodes a whole fact population", ({ scratch }) => {
  initialize(scratch);
  const descriptor = readCompilerPrograms(scratch)[0];
  if (descriptor === undefined) {
    throw new Error("native storage fixture descriptor missing");
  }
  const request = { root: scratch, descriptor, destination: join(scratch, "bounded.sqlite") };
  const native = partition(request);
  const declaration = native.exports[0]?.declarations[0];
  if (declaration === undefined) {
    throw new Error("native storage fixture declaration missing");
  }
  const source = native.sources[0];
  const exported = native.exports[0];
  if (source === undefined || exported === undefined) {
    throw new Error("native storage fixture source missing");
  }
  source.text += `\n/*${'\u0000\ud800"\\'.repeat(20_000)}*/\n`;
  exported.declarations.push(...Array.from({ length: 4000 }, () => declaration));
  native.references.push(...Array.from({ length: 4000 }, () => ({ declaration, reference: declaration, consumerClass: "product" as const })));
  const stringify = JSON.stringify;
  const parse = JSON.parse;
  const limit = 262_144;
  const encoding = vi.spyOn(JSON, "stringify").mockImplementation((value, replacer, space) => {
    const text = stringify(value, replacer, space);
    if (text.length > limit) {
      throw new RangeError("whole-population serialization exceeds the bounded keeper limit");
    }
    return text;
  });
  const decoding = vi.spyOn(JSON, "parse").mockImplementation((text, reviver) => {
    if (text.length > limit) {
      throw new RangeError("whole-population decoding exceeds the bounded keeper limit");
    }
    return parse(text, reviver);
  });
  try {
    using database = openInventoryDatabase(request.destination);
    database.exec("BEGIN IMMEDIATE");
    const generation = publishInventoryGeneration(database, [native]);
    database.exec("COMMIT");
    expect(readInventoryGeneration(database, generation).map((row) => completePartition(database, row))).toStrictEqual([native]);
  } finally {
    decoding.mockRestore();
    encoding.mockRestore();
  }
});

test("parent publication and pinned queries never eagerly decode the complete reference family", ({ scratch }) => {
  initialize(scratch);
  const buildPartition = (request: InventoryBuildRequest): void => {
    const facts = partition(request);
    const declaration = facts.exports[0]?.declarations[0];
    if (declaration === undefined) {
      throw new Error("native lazy-reader fixture declaration missing");
    }
    facts.references.push(...Array.from({ length: 4000 }, () => ({ declaration, reference: declaration, consumerClass: "product" as const })));
    using staging = openInventoryDatabase(request.destination);
    staging.exec("BEGIN IMMEDIATE");
    publishInventoryGeneration(staging, [facts]);
    staging.exec("COMMIT");
  };
  let referenceQueries = 0;
  const observe = (statement: StatementSync): void => {
    if (statement.sourceSQL.includes("inventory_reference r")) {
      referenceQueries++;
      if (!statement.sourceSQL.includes("r.declaration=")) {
        throw new Error("parent attempted whole-reference materialization");
      }
    }
  };
  const iterate = StatementSync.prototype.iterate;
  const all = StatementSync.prototype.all;
  const iteration = vi.spyOn(StatementSync.prototype, "iterate").mockImplementation(function (this: StatementSync, ...args) {
    observe(this);
    return iterate.apply(this, args);
  });
  const materialization = vi.spyOn(StatementSync.prototype, "all").mockImplementation(function (this: StatementSync, ...args) {
    observe(this);
    return all.apply(this, args);
  });
  try {
    using stored = createSemanticInventory({ root: scratch, buildPartition });
    expect(referenceQueries).toBe(0);
    const declaration = stored.sourceCorpus().getSourceFile("a.ts")?.getVariableDeclarationOrThrow("a");
    if (declaration === undefined) {
      throw new Error("pinned declaration missing");
    }
    expect(stored.references(declaration)).toHaveLength(1);
    expect(referenceQueries).toBeGreaterThan(0);
    stored[Symbol.dispose]();
    expect(() => stored.sourceCorpus().getSourceFiles()).toThrow("disposed");
    expect(() => stored[Symbol.dispose]()).not.toThrow();
  } finally {
    materialization.mockRestore();
    iteration.mockRestore();
  }
});

for (const legacyFormat of [1, 2, 3, 4, 5]) {
  test(`format ${String(legacyFormat)} adoption preserves the last generation across failure and publishes only a complete replacement`, ({ scratch }) => {
    initialize(scratch);
    const path = join(scratch, ".cache/semantic-inventory.sqlite");
    const descriptor = readCompilerPrograms(scratch)[0];
    if (descriptor === undefined) {
      throw new Error("legacy fixture descriptor missing");
    }
    const legacyPayload = legacyFormat === 1 ? JSON.stringify({ ...partition({ root: scratch, descriptor, destination: path }), format: legacyFormat }) : "";
    {
      using database = openInventoryDatabase(path);
      database.prepare("INSERT INTO inventory_partition(id,program,format,payload) VALUES('legacy','tsconfig.a.json',?,?)").run(legacyFormat, legacyPayload);
      if (legacyFormat >= 2) {
        database
          .prepare(
            "INSERT INTO inventory_descriptor(partition,program,descriptorVersion,compilerOptionsJson,workerPid) VALUES('legacy','tsconfig.a.json',?,?,NULL)",
          )
          .run(descriptorVersion(descriptor), JSON.stringify(descriptor.commandLine.options));
      }
      database.exec(
        `INSERT INTO inventory_generation(id,format) VALUES(1,${String(legacyFormat)}); INSERT INTO inventory_member(generation,program,partition) VALUES(1,'tsconfig.a.json','legacy');`,
      );
    }
    expect(() =>
      createSemanticInventory({
        root: scratch,
        buildPartition: () => {
          throw new Error("new-format worker failed");
        },
      }),
    ).toThrow("new-format worker failed");
    using observer = openInventoryDatabase(path);
    expect(observer.prepare("SELECT payload FROM inventory_partition WHERE id='legacy'").get()).toEqual({ payload: legacyPayload });
    expect(observer.prepare("SELECT program,descriptorVersion,compilerOptionsJson FROM inventory_descriptor WHERE partition='legacy'").get()).toEqual(
      legacyFormat >= 2
        ? { program: "tsconfig.a.json", descriptorVersion: descriptorVersion(descriptor), compilerOptionsJson: JSON.stringify(descriptor.commandLine.options) }
        : undefined,
    );
    expect(observer.prepare("SELECT id,format FROM inventory_generation").all()).toEqual([{ id: 1, format: legacyFormat }]);
    using current = createSemanticInventory({ root: scratch, buildPartition: stage });
    expect(current.generation).toBe(2);
    expect(current.programs).toEqual(["tsconfig.a.json", "tsconfig.b.json"]);
    expect(observer.prepare("SELECT payload FROM inventory_partition WHERE id='legacy'").get()).toEqual({ payload: legacyPayload });
    expect(observer.prepare("SELECT program,descriptorVersion,compilerOptionsJson FROM inventory_descriptor WHERE partition='legacy'").get()).toEqual(
      legacyFormat >= 2
        ? { program: "tsconfig.a.json", descriptorVersion: descriptorVersion(descriptor), compilerOptionsJson: JSON.stringify(descriptor.commandLine.options) }
        : undefined,
    );
    expect(observer.prepare("SELECT id,format FROM inventory_generation ORDER BY id").all()).toEqual([
      { id: 1, format: legacyFormat },
      { id: 2, format: INVENTORY_FORMAT },
    ]);
  });
}

test("malformed staged records refuse publication and preserve pinned prior readers", ({ scratch }) => {
  initialize(scratch);
  using previous = createSemanticInventory({ root: scratch, buildPartition: stage });
  write(scratch, "a.ts", "export const changed=3;\n");
  const malformed = (request: InventoryBuildRequest): void => {
    stage(request);
    using database = openInventoryDatabase(request.destination);
    database.exec("PRAGMA ignore_check_constraints=ON; UPDATE inventory_source SET authored=2;");
  };
  expect(() => createSemanticInventory({ root: scratch, buildPartition: malformed })).toThrow("CHECK constraint failed");
  using observer = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  expect(latestInventoryGeneration(observer)).toBe(previous.generation);
  expect(previous.sourceCorpus().getSourceFile("a.ts")?.getFullText()).toContain("a=1");
});

test("indexed records round-trip every native partition field and raw reference row in order", ({ scratch }) => {
  initialize(scratch);
  write(scratch, "a.ts", "export const alive=1; export function read(){return alive;} export interface Shape {value:number}\n");
  write(
    scratch,
    "b.ts",
    "import {alive as alias,read,type Shape} from './a'; export {alive as renamed} from './a'; export const value:Shape={value:alias+read()}; const witness='alive' satisfies keyof typeof import('./a'); export const checked=witness; export const later=import('./a').then(m=>m.alive);\n",
  );
  const descriptor = readCompilerPrograms(scratch).find((program) => program.id === "tsconfig.b.json");
  if (descriptor === undefined) {
    throw new Error("native round-trip descriptor missing");
  }
  const destination = join(scratch, ".cache/native.sqlite");
  using database = openInventoryDatabase(destination);
  const native = extractInventoryPartition({ root: scratch, descriptor, destination });
  for (const facts of [native.sources, native.exports, native.modules, native.bindings, native.references, native.witnesses]) {
    expect(facts.length).toBeGreaterThan(0);
  }
  database.exec("BEGIN IMMEDIATE");
  const generation = publishInventoryGeneration(database, [native]);
  database.exec("COMMIT");
  expect(readInventoryGeneration(database, generation).map((row) => completePartition(database, row))).toStrictEqual([native]);
});

test("inventory corpus ownership releases pinned storage on normal and exceptional scope exit", ({ scratch }) => {
  initialize(scratch);
  using normal = createSemanticInventory({ root: scratch, buildPartition: stage });
  {
    using corpus = normal.sourceCorpus();
    expect(corpus.getSourceFiles()).toHaveLength(2);
  }
  expect(() => normal.sourceCorpus().getSourceFiles()).toThrow("disposed");
  using exceptional = createSemanticInventory({ root: scratch, buildPartition: stage });
  expect(() => {
    using corpus = exceptional.sourceCorpus();
    expect(corpus.getSourceFiles()).toHaveLength(2);
    throw new Error("consumer failed");
  }).toThrow("consumer failed");
  expect(() => exceptional.sourceCorpus().getSourceFiles()).toThrow("disposed");
});

test("native escaped literal names and unresolved specifiers survive indexed storage as exact UTF-16", ({ scratch }) => {
  initialize(scratch);
  const literal = String.raw`\ud800\u0000\"\\\udfff`;
  const value = JSON.parse(`"${literal}"`);
  write(scratch, "a.ts", `const value=1; export {value as "${literal}"};\n`);
  write(
    scratch,
    "b.ts",
    `const witness="${literal}" satisfies keyof typeof import('./a'); export const checked=witness; export const later=import("${literal}");\n`,
  );
  const descriptor = readCompilerPrograms(scratch).find((program) => program.id === "tsconfig.b.json");
  if (descriptor === undefined) {
    throw new Error("native UTF-16 fixture descriptor missing");
  }
  const destination = join(scratch, ".cache/utf16.sqlite");
  const native = extractInventoryPartition({ root: scratch, descriptor, destination });
  expect(native.exports.some((fact) => fact.name === value)).toBe(true);
  expect(native.witnesses.some((fact) => fact.name === value)).toBe(true);
  expect(native.modules.some((fact) => fact.specifier === value && fact.target === null)).toBe(true);
  using database = openInventoryDatabase(destination);
  database.exec("BEGIN IMMEDIATE");
  const generation = publishInventoryGeneration(database, [native]);
  database.exec("COMMIT");
  expect(readInventoryGeneration(database, generation).map((row) => completePartition(database, row))).toStrictEqual([native]);
});

test("all scalar metadata and indexed keys preserve UTF-16 without hash collisions or encoded-order drift", ({ scratch }) => {
  const value = '\ud800\0"\\\udfff';
  const node = { file: value, start: 0, end: 1, kind: 80 };
  const native: InventoryPartition = {
    families: inventoryFamilies(undefined),
    casts: [],
    brands: [],
    format: INVENTORY_FORMAT,
    program: value,
    descriptorVersion: value,
    compilerOptionsJson: JSON.stringify({ paths: { [value]: [value] } }),
    configPaths: [value],
    projectReferences: [value],
    roots: [value],
    nativeRoots: [value],
    inputs: [{ path: value, kind: "exists", version: value }],
    sources: [{ file: value, path: value, text: value, authored: true, consumerClass: "product" }],
    exports: [{ file: value, name: value, declarations: [node, node] }],
    modules: [{ node, target: value, specifier: value, dynamic: true, declarations: [node] }],
    bindings: [{ node, symbols: { lexical: [node], origins: [node] } }],
    witnesses: [{ node, name: value, declarations: [node] }],
    references: [{ declaration: node, reference: node, consumerClass: "product" }],
  };
  using database = openInventoryDatabase(join(scratch, "scalar.sqlite"));
  database.exec("BEGIN IMMEDIATE");
  const generation = publishInventoryGeneration(database, [native, { ...native, program: '"' }, { ...native, program: "\n" }]);
  database.exec("COMMIT");
  const stored = readInventoryGeneration(database, generation);
  expect(stored.map((entry) => entry.program)).toEqual(["\n", '"', value].toSorted());
  expect(inventoryGenerationPrograms(database, generation)).toEqual(stored.map((entry) => entry.program));
  const row = latestInventoryPartitions(database).get(value);
  if (row === undefined) {
    throw new Error("UTF-16 program identity missing");
  }
  expect(completePartition(database, row)).toStrictEqual(native);
  expect([...readInventoryExports(database, row.id, value)]).toStrictEqual(native.exports);
  expect([...readInventoryModules(database, row.id, node)]).toStrictEqual(native.modules);
  expect([...readInventoryBindings(database, row.id, node)]).toStrictEqual(native.bindings);
  expect([...readInventoryWitnesses(database, row.id, node)]).toStrictEqual(native.witnesses);
  expect([...readInventoryReferences(database, row.id, node)]).toStrictEqual(native.references);
  database.exec("BEGIN IMMEDIATE");
  const changed = publishInventoryGeneration(database, [
    { ...native, modules: [{ node, target: value.toWellFormed(), specifier: value, dynamic: true, declarations: [node] }] },
  ]);
  database.exec("COMMIT");
  expect(readInventoryGeneration(database, changed)[0]?.id).not.toBe(row.id);
  expect(completePartition(database, row)).toStrictEqual(native);
});
