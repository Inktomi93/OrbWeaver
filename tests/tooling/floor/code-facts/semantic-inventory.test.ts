// @subject tooling/src/floor/code-facts/semantic-inventory-records.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync, StatementSync } from "node:sqlite";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { inventoryConsumerClass } from "@orb/tooling/floor/code-facts/inventory-consumers";
import { createSemanticInventory } from "@orb/tooling/floor/code-facts/semantic-inventory";
import type {
  InventoryBuildRequest,
  InventoryInvocationQuery,
  InventoryPartition,
  StoredInventoryPartition,
} from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import { INVENTORY_FORMAT, inventoryFamilies, invocationQuerySchema } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import {
  beginInventoryWrite,
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
import { Project, SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import {
  acquireInventoryReadLease,
  readInventoryBindings,
  readInventoryBrands,
  readInventoryCasts,
  readInventoryExports,
  readInventoryInputs,
  readInventoryInvocationEvidence,
  readInventoryModules,
  readInventoryReferences,
  readInventorySources,
  readInventoryWitnesses,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { inventoryReader, ownedInventoryReader } from "../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts";

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
    intent: request.intent ?? "facts",
    available: sources.map((source) => source.file),
    format: INVENTORY_FORMAT,
    families: request.intent === "membership" ? [] : inventoryFamilies(request.families),
    casts: [],
    brands: [],
    memberOrigins: [],
    callableDeclarations: [],
    computedNames: [],
    globalOrigins: [],
    globalBindings: [],
    invocationEvidence: [],
    declarationOutputs: [],
    runtimeExports: [],
    shapes: [],
    pairs: [],
    program: request.descriptor.id,
    descriptorVersion: descriptorVersion(request.descriptor),
    compilerOptionsJson: JSON.stringify(request.descriptor.commandLine.options),
    configPaths: [...request.descriptor.configPaths],
    projectReferences: [...request.descriptor.references],
    roots: sources.map((source) => source.file),
    nativeRoots: sources.map((source) => source.path),
    inputs,
    sources,
    exports: request.intent === "membership" ? [] : exports,
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
    memberOrigins: [],
    callableDeclarations: [],
    computedNames: [],
    globalOrigins: [],
    globalBindings: [],
    invocationEvidence: [],
    declarationOutputs: [],
    runtimeExports: [],
    shapes: [],
    pairs: [],
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

function invocationMetadataPartitions(root: string): InventoryPartition[] {
  return readCompilerPrograms(root).map((descriptor) => {
    const captured = partition({ root, descriptor, destination: "", families: ["invocation-evidence"] });
    const source = captured.sources[0];
    if (source === undefined) {
      throw new Error("invocation metadata source missing");
    }
    return {
      ...captured,
      exports: [],
      invocationEvidence: [0, 1].map((start) => ({
        query: { mode: "value" as const, facets: [], arguments: [], node: { file: source.file, start, end: start + 1, kind: 80 } },
        invocation: null,
        callee: null,
        profiles: [],
        sources: [],
      })),
    };
  });
}

test("pinned invocation metadata retains only demanded row identities and observes mutable caller queries", ({ scratch }) => {
  initialize(scratch);
  const data = invocationMetadataPartitions(scratch);
  const databasePath = join(scratch, "invocation.sqlite");
  using writer = openInventoryDatabase(databasePath);
  const generation = publishInventoryGeneration(writer, data);
  const partitions = readInventoryGeneration(writer, generation);
  const queries = data.flatMap((captured) =>
    captured.invocationEvidence.map((fact) => ({
      id: partitions.find((entry) => entry.program === captured.program)?.id,
      fact,
    })),
  );
  using db = openInventoryDatabase(databasePath);
  using lease = acquireInventoryReadLease(db, generation, partitions);
  const parses = vi.spyOn(invocationQuerySchema, "parse");
  const released: number[][] = [];
  const clear = Set.prototype.clear;
  const disposal = vi.spyOn(Set.prototype, "clear").mockImplementation(function (this: Set<number>) {
    released.push([...this]);
    clear.call(this);
  });
  try {
    for (let pass = 0; pass < 4; pass++) {
      for (const { id, fact } of queries) {
        if (id === undefined) {
          throw new Error("invocation metadata partition missing");
        }
        parses.mockClear();
        const facts = [...lease.invocationEvidence(id, fact.query)];
        expect(facts).toEqual([fact]);
        expect(parses).toHaveBeenCalledTimes(pass === 0 ? 2 : 1);
      }
    }
    const fact = data[0]?.invocationEvidence[0];
    const id = partitions.find((entry) => entry.program === data[0]?.program)?.id;
    if (fact === undefined || id === undefined) {
      throw new Error("mutable invocation metadata query missing");
    }
    const query: InventoryInvocationQuery = { ...fact.query, node: { ...fact.query.node }, facets: [], arguments: [] };
    const [returned] = lease.invocationEvidence(id, query);
    if (returned === undefined) {
      throw new Error("mutable invocation metadata result missing");
    }
    returned.query.facets.push("module");
    expect([...lease.invocationEvidence(id, query)]).toEqual([fact]);
    query.facets.push("module");
    expect([...lease.invocationEvidence(id, query)]).toEqual([]);
    query.facets.length = 0;
    query.node.kind++;
    expect([...lease.invocationEvidence(id, query)]).toEqual([]);
    query.node.kind--;
    query.arguments.push({ index: 0, facets: [] }, { index: 0, facets: [] });
    expect(() => [...lease.invocationEvidence(id, query)]).toThrow("argument projection is ambiguous");
    query.arguments.length = 0;
    expect([...lease.invocationEvidence(id, query)]).toEqual([fact]);
    expect(() => [...lease.invocationEvidence("foreign", query)]).toThrow("partition is unavailable");
    lease[Symbol.dispose]();
    disposal.mockRestore();
    expect(released).toEqual([
      [0, 1],
      [0, 1],
    ]);
    expect(() => [...lease.invocationEvidence(id, query)]).toThrow("lease has been released");
  } finally {
    disposal.mockRestore();
    parses.mockRestore();
  }
});

test("invocation query validation refuses corrupt unread rows after another ordinal is admitted", ({ scratch }) => {
  initialize(scratch);
  const data = invocationMetadataPartitions(scratch);
  const databasePath = join(scratch, "invocation.sqlite");
  using writer = openInventoryDatabase(databasePath);
  const generation = publishInventoryGeneration(writer, data);
  const partitions = readInventoryGeneration(writer, generation);
  const fact = data[0]?.invocationEvidence[0];
  const id = partitions.find((entry) => entry.program === data[0]?.program)?.id;
  const other = data[0]?.invocationEvidence[1];
  if (other === undefined || fact === undefined || id === undefined) {
    throw new Error("invocation metadata corruption control missing");
  }
  expect([...readInventoryInvocationEvidence(writer, id, other.query)]).toEqual([other]);
  const node = writer.prepare("SELECT node FROM inventory_invocation_evidence WHERE partition=? AND ordinal=1").get(id)?.["node"];
  if (typeof node !== "number") {
    throw new Error("invocation metadata root control missing");
  }
  for (const [change, restore, message] of [
    [
      "UPDATE inventory_invocation_evidence SET node=(SELECT node FROM inventory_invocation_evidence WHERE partition=? AND ordinal=0) WHERE partition=? AND ordinal=1",
      "UPDATE inventory_invocation_evidence SET node=? WHERE partition=? AND ordinal=1",
      "root span is foreign",
    ],
    [
      "UPDATE inventory_invocation_atom SET text='\"invocation\"' WHERE partition=? AND owner=1 AND key='\"mode\"'",
      "UPDATE inventory_invocation_atom SET text='\"value\"' WHERE partition=? AND owner=1 AND key='\"mode\"'",
      "root span is foreign",
    ],
    [
      "UPDATE inventory_invocation_atom SET number=81 WHERE partition=? AND owner=1 AND key='\"kind\"'",
      "UPDATE inventory_invocation_atom SET number=80 WHERE partition=? AND owner=1 AND key='\"kind\"'",
      "query identity is stale",
    ],
    [
      "UPDATE inventory_invocation_evidence SET atomCount=atomCount+1 WHERE partition=? AND ordinal=1",
      "UPDATE inventory_invocation_evidence SET atomCount=atomCount-1 WHERE partition=? AND ordinal=1",
      "fact graph is incomplete",
    ],
  ] as const) {
    writer.prepare(change).run(...(change.includes("SELECT node") ? [id, id] : [id]));
    try {
      expect(() => [...readInventoryInvocationEvidence(writer, id, other.query)]).toThrow(message);
      using corrupted = openInventoryDatabase(databasePath);
      using fresh = acquireInventoryReadLease(corrupted, generation, partitions);
      expect([...fresh.invocationEvidence(id, fact.query)]).toEqual([fact]);
      expect(() => [...fresh.invocationEvidence(id, other.query)]).toThrow(message);
    } finally {
      writer.prepare(restore).run(...(restore.includes("node=?") ? [node, id] : [id]));
    }
    expect([...readInventoryInvocationEvidence(writer, id, other.query)]).toEqual([other]);
  }
});

test("owned replay refuses a declaration available only in another native partition", ({ scratch }) => {
  initialize(scratch);
  const descriptors = readCompilerPrograms(scratch);
  const first = descriptors.find((entry) => entry.id === "tsconfig.a.json");
  const second = descriptors.find((entry) => entry.id === "tsconfig.b.json");
  if (first === undefined || second === undefined) {
    throw new Error("partition membership descriptors missing");
  }
  const base = partition({ root: scratch, descriptor: first, destination: "", families: ["invocation-evidence", "global-origins", "computed-names"] });
  const other = partition({ root: scratch, descriptor: second, destination: "", intent: "membership", families: [] });
  const source = base.sources[0];
  const declaration = base.exports[0]?.declarations[0];
  const foreignFile = join(scratch, "b.ts");
  if (source === undefined || declaration === undefined) {
    throw new Error("partition membership declarations missing");
  }
  const node = { ...declaration, end: declaration.start + 1, kind: SyntaxKind.Identifier };
  const captured: InventoryPartition = {
    ...base,
    exports: [],
    bindings: [{ node, symbols: { lexical: [{ ...declaration, file: foreignFile }], origins: [] } }],
    globalBindings: [node],
    invocationEvidence: [
      {
        query: { mode: "value", facets: [], arguments: [], node: { file: source.file, start: 0, end: source.text.length, kind: SyntaxKind.SourceFile } },
        callee: null,
        invocation: null,
        profiles: [],
        sources: [{ file: source.file, bindings: 1, computed: [] }],
      },
    ],
  };
  const path = join(scratch, "partition-membership.sqlite");
  using db = openInventoryDatabase(path);
  const generation = publishInventoryGeneration(db, [captured, other]);
  const partitions = readInventoryGeneration(db, generation);
  using privateDb = openInventoryDatabase(path);
  using lease = acquireInventoryReadLease(privateDb, generation, partitions);
  using reader = ownedInventoryReader(scratch, generation, lease, { db: privateDb, dispose: () => undefined });
  expect(reader.sourceCorpus().getSourceFile(foreignFile)).toBeDefined();
  const original = reader.sourceCorpus().getSourceFile(source.file);
  if (original === undefined) {
    throw new Error("partition membership query source missing");
  }
  expect(() => reader.invocationEvidence(original, first.id, { mode: "value", facets: [], arguments: [] })).toThrow("source is outside its native closure");
});

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

for (const legacyFormat of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
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
            "INSERT INTO inventory_descriptor(partition,program,descriptorVersion,compilerOptionsJson,workerPid,intent) VALUES('legacy','tsconfig.a.json',?,?,NULL,'facts')",
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
    memberOrigins: [],
    callableDeclarations: [],
    computedNames: [],
    globalOrigins: [],
    globalBindings: [],
    invocationEvidence: [],
    declarationOutputs: [],
    runtimeExports: [],
    shapes: [],
    pairs: [],
    intent: "facts",
    available: [value],
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

test("owned inventory snapshots retain old unread data across publication and external corruption", ({ scratch }) => {
  initialize(scratch);
  using first = createSemanticInventory({ root: scratch, buildPartition: stage });
  expect(first.sourceCorpus().getSourceFile("a.ts")?.getFullText()).toContain("a=1");
  write(scratch, "a.ts", "export const changedA=3;\n");
  write(scratch, "b.ts", "export const changedB=4;\n");
  using second = createSemanticInventory({ root: scratch, buildPartition: stage });
  expect(second.generation).toBeGreaterThan(first.generation);
  using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  const partitions = readInventoryGeneration(db, first.generation);
  const selected = partitions.find((row) => row.program === "tsconfig.b.json");
  if (selected === undefined) {
    throw new Error("unread old-world partition is missing");
  }
  db.prepare("UPDATE inventory_text SET value=? WHERE partition=?").run(JSON.stringify("corrupted"), selected.id);
  expect(first.sourceCorpus().getSourceFile("b.ts")?.getFullText()).toContain("b=2");
  expect(second.sourceCorpus().getSourceFile("b.ts")?.getFullText()).toContain("changedB");
  using borrowed = inventoryReader(scratch, first.generation, partitions, { db, dispose: () => undefined });
  expect(() => borrowed.sourceCorpus().getSourceFile("b.ts")).toThrow("source text version differs");
  first[Symbol.dispose]();
  second[Symbol.dispose]();
  expect(db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get()).toMatchObject({ busy: 0 });
});

test("owned inventory preflight metadata failures preserve the prior published generation", ({ scratch }) => {
  initialize(scratch);
  using previous = createSemanticInventory({ root: scratch, buildPartition: stage });
  write(scratch, "b.ts", "export const changed=3;\n");
  const malformed = (request: InventoryBuildRequest): void => {
    const facts = partition(request);
    if (request.descriptor.id === "tsconfig.b.json") {
      const file = join(scratch, "a.ts");
      facts.sources.push({ file, path: file, text: "export const mixed=0;", authored: true, consumerClass: "product" });
      facts.available.push(file);
    }
    using db = openInventoryDatabase(request.destination);
    beginInventoryWrite(db);
    publishInventoryGeneration(db, [facts]);
    db.exec("COMMIT");
  };
  expect(() => createSemanticInventory({ root: scratch, buildPartition: malformed })).toThrow("mixed source versions");
  using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  expect(latestInventoryGeneration(db)).toBe(previous.generation);
  expect(db.prepare("PRAGMA wal_checkpoint(PASSIVE)").get()).toMatchObject({ busy: 0 });
});

test.for(["pin", "metadata", "inputs"] as const)(
  "owned inventory postpublication %s failure releases acquisition without erasing publication",
  (failure, { scratch }) => {
    initialize(scratch);
    const path = join(scratch, ".cache/semantic-inventory.sqlite");
    const connections = new Set<DatabaseSync>();
    let published = false;
    let pinned = false;
    const execute = DatabaseSync.prototype.exec;
    const prepare = DatabaseSync.prototype.prepare;
    const execution = vi.spyOn(DatabaseSync.prototype, "exec").mockImplementation(function (this: DatabaseSync, sql: string): void {
      const owned = this.location() === path;
      if (owned) {
        connections.add(this);
      }
      if (owned && published && sql === "BEGIN" && failure === "pin") {
        throw new Error("injected read pin failure");
      }
      execute.call(this, sql);
      if (owned && sql === "COMMIT" && this.prepare("SELECT id FROM inventory_generation LIMIT 1").get() !== undefined) {
        published = true;
        if (failure === "inputs") {
          write(scratch, "a.ts", "export const gapMutation=3;\n");
        }
      }
      if (owned && published && sql === "BEGIN") {
        pinned = true;
      }
    });
    const preparation = vi.spyOn(DatabaseSync.prototype, "prepare").mockImplementation(function (this: DatabaseSync, ...args) {
      if (this.location() === path && pinned && failure === "metadata" && args[0].includes("SELECT ordinal,file,path,consumerClass")) {
        throw new Error("injected pinned metadata failure");
      }
      return prepare.apply(this, args);
    });
    try {
      expect(() => createSemanticInventory({ root: scratch, buildPartition: stage })).toThrow(
        { inputs: "inputs changed during extraction", pin: "injected read pin failure", metadata: "injected pinned metadata failure" }[failure],
      );
    } finally {
      preparation.mockRestore();
      execution.mockRestore();
    }
    expect(published).toBe(true);
    expect(connections.size).toBe(1);
    expect([...connections].every((connection) => !connection.isOpen)).toBe(true);
    using db = openInventoryDatabase(path);
    expect(latestInventoryGeneration(db)).toBe(1);
    expect(readInventoryGeneration(db, 1).map(({ program }) => program)).toEqual(["tsconfig.a.json", "tsconfig.b.json"]);
    expect(db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get()).toMatchObject({ busy: 0 });
  },
);

test.for(["duplicate", "swapped"] as const)("owned inventory handoff refuses %s native-world membership mappings", (mapping, { scratch }) => {
  initialize(scratch);
  const path = join(scratch, ".cache/semantic-inventory.sqlite");
  const connections = new Set<DatabaseSync>();
  let accepted: readonly StoredInventoryPartition[] = [];
  let corrupted = false;
  const execute = DatabaseSync.prototype.exec;
  const publication = vi.spyOn(DatabaseSync.prototype, "exec").mockImplementation(function (this: DatabaseSync, sql: string): void {
    const owned = this.location() === path;
    if (owned && !corrupted) {
      connections.add(this);
    }
    execute.call(this, sql);
    if (owned && sql === "COMMIT" && !corrupted && this.prepare("SELECT id FROM inventory_generation LIMIT 1").get() !== undefined) {
      accepted = readInventoryGeneration(this, 1);
      const [first, second] = accepted;
      if (first === undefined || second === undefined) {
        throw new Error("handoff requires two accepted native worlds");
      }
      corrupted = true;
      using writer = openInventoryDatabase(path);
      beginInventoryWrite(writer);
      writer.prepare("UPDATE inventory_member SET partition=? WHERE generation=1 AND partition=?").run(first.id, second.id);
      if (mapping === "swapped") {
        writer.prepare("UPDATE inventory_member SET partition=? WHERE generation=1 AND program=?").run(second.id, JSON.stringify(first.program));
      }
      writer.exec("COMMIT");
    }
  });
  let acquired: ReturnType<typeof createSemanticInventory> | undefined;
  try {
    expect(() => {
      acquired = createSemanticInventory({ root: scratch, buildPartition: stage });
    }).toThrow("native inventory read acquisition failed: native inventory generation member program differs from its partition");
  } finally {
    publication.mockRestore();
    acquired?.[Symbol.dispose]();
  }
  expect(corrupted).toBe(true);
  expect(connections.size).toBe(1);
  expect([...connections].every((connection) => !connection.isOpen)).toBe(true);
  using db = openInventoryDatabase(path);
  expect(latestInventoryGeneration(db)).toBe(1);
  expect(() => readInventoryGeneration(db, 1)).toThrow("native inventory generation member program differs from its partition");
  beginInventoryWrite(db);
  for (const selected of accepted) {
    db.prepare("UPDATE inventory_member SET partition=? WHERE generation=1 AND program=?").run(selected.id, JSON.stringify(selected.program));
  }
  db.exec("COMMIT");
  expect(readInventoryGeneration(db, 1)).toStrictEqual(accepted);
  using restored = inventoryReader(scratch, 1, accepted, { db, dispose: () => undefined });
  expect(
    restored
      .sourceCorpus()
      .getSourceFiles()
      .map((source) => source.getBaseName())
      .toSorted(),
  ).toEqual(["a.ts", "b.ts"]);
  expect(db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get()).toMatchObject({ busy: 0 });
});

test("owned inventory handoff pins its chosen generation instead of a concurrent publisher latest", ({ scratch }) => {
  initialize(scratch);
  const path = join(scratch, ".cache/semantic-inventory.sqlite");
  const descriptors = readCompilerPrograms(scratch);
  let raced = false;
  const execute = DatabaseSync.prototype.exec;
  const publication = vi.spyOn(DatabaseSync.prototype, "exec").mockImplementation(function (this: DatabaseSync, sql: string): void {
    const owned = this.location() === path;
    execute.call(this, sql);
    if (owned && sql === "COMMIT" && !raced && this.prepare("SELECT id FROM inventory_generation LIMIT 1").get() !== undefined) {
      raced = true;
      using writer = openInventoryDatabase(path);
      beginInventoryWrite(writer);
      publishInventoryGeneration(
        writer,
        descriptors.map((descriptor) => ({
          ...partition({ root: scratch, descriptor, destination: "unused" }),
          intent: "membership" as const,
          families: [],
          exports: [],
        })),
      );
      writer.exec("COMMIT");
    }
  });
  let acquired: ReturnType<typeof createSemanticInventory>;
  try {
    acquired = createSemanticInventory({ root: scratch, buildPartition: stage });
  } finally {
    publication.mockRestore();
  }
  using inventory = acquired;
  expect(raced).toBe(true);
  expect(inventory.generation).toBe(1);
  const declaration = inventory.sourceCorpus().getSourceFile("a.ts")?.getVariableDeclarationOrThrow("a");
  if (declaration === undefined) {
    throw new Error("selected generation declaration is missing");
  }
  expect(inventory.exports(declaration.getSourceFile()).has("a")).toBe(true);
  using db = openInventoryDatabase(path);
  expect(latestInventoryGeneration(db)).toBe(2);
});

test("owned inventory shape preparation borrows the staged writer without query-only conversion", ({ scratch }) => {
  initialize(scratch);
  const path = join(scratch, ".cache/semantic-inventory.sqlite");
  const source = new Project({ useInMemoryFileSystem: true }).createSourceFile(join(scratch, "a.ts"), readFileSync(join(scratch, "a.ts"), "utf8"));
  const connections: DatabaseSync[] = [];
  const prepare = DatabaseSync.prototype.prepare;
  const observation = vi.spyOn(DatabaseSync.prototype, "prepare").mockImplementation(function (this: DatabaseSync, ...args) {
    if (this.location() === path && !connections.includes(this)) {
      connections.push(this);
    }
    return prepare.apply(this, args);
  });
  let called = false;
  let acquired: ReturnType<typeof createSemanticInventory>;
  try {
    acquired = createSemanticInventory({
      root: scratch,
      buildPartition: stage,
      shapePlan: {
        sources: [source],
        prepare: (catalog) => {
          called = true;
          const connection = connections.find((db) => db.isOpen);
          if (connection === undefined) {
            throw new Error("shape writer connection missing");
          }
          expect(connection.isTransaction).toBe(true);
          expect(connection.prepare("PRAGMA query_only").get()).toEqual({ ["query_only"]: 0 });
          connection.exec("SAVEPOINT shapeCallback");
          expect(catalog.sourceCorpus().getSourceFile("a.ts")?.getFullText()).toContain("a=1");
          connection.exec("ROLLBACK TO shapeCallback;RELEASE shapeCallback");
          return [];
        },
      },
    });
  } finally {
    observation.mockRestore();
  }
  using inventory = acquired;
  expect(inventory.sourceCorpus().getSourceFile("a.ts")?.getFullText()).toContain("a=1");
  expect(called).toBe(true);
  const connection = connections.find((db) => db.isOpen);
  if (connection === undefined) {
    throw new Error("owned shape final connection missing");
  }
  expect(connection.isTransaction).toBe(true);
  expect(connection.prepare("PRAGMA query_only").get()).toEqual({ ["query_only"]: 1 });
});
