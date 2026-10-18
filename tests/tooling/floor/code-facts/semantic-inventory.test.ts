// @subject tooling/src/floor/code-facts/semantic-inventory-records.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { StatementSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { inventoryConsumerClass } from "@orb/tooling/floor/code-facts/inventory-consumers";
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
  latestInventoryPartitions,
  openInventoryDatabase,
  publishInventoryGeneration,
  readInventoryGeneration,
} from "@orb/tooling/floor/code-facts/semantic-inventory-database";
import { descriptorVersion, inputVersion } from "@orb/tooling/floor/code-facts/semantic-inventory-inputs";
import { readCompilerPrograms } from "@orb/tooling/floor/compiler/compiler-programs";
import { LEGACY_TEST_WORLD_PROGRAMS } from "@orb/tooling/floor/compiler/project-worlds";
import { extractInventoryPartition } from "@orb/tooling/floor/compiler/semantic-inventory-extract";
import { createSemanticWorkspace } from "@orb/tooling/floor/compiler/ts-workspace";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { Project, SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import {
  acquireInventoryReadLease,
  readInventoryBindings,
  readInventoryBrands,
  readInventoryExports,
  readInventoryInputs,
  readInventoryInvocationEvidence,
  readInventoryModules,
  readInventoryReferenceQueries,
  readInventoryReferences,
  readInventorySources,
  readInventoryWitnesses,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { inventoryReader, ownedInventoryReader } from "../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts";
import { runNicedSync } from "../../../../tooling/src/floor/process/proc.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeInventoryFixture } from "../compiler/native-inventory-fixture.ts";
import { copyNativeInventoryImplementation } from "../compiler/native-inventory-tree.ts";
import { NATIVE_PUBLICATION_CASES } from "../compiler/native-publication-cases.ts";

const publicationExpected = {
  "independent-worlds": {
    sameGeneration: true,
    warmWorkers: [],
    workerStarts: ["tsconfig.a.json"],
    changedText: "export const changedA=4;\n",
    pinnedText: "export const a=1;\n",
  },
  "wrong-worker": { error: expect.stringMatching(/wrong partition/u), injections: 1, latestUnchanged: true, pinnedText: "export const a=1;\n" },
  "reused-world-drift": {
    error: expect.stringMatching(/inputs changed during extraction/u),
    injections: 1,
    latestUnchanged: true,
    pinnedText: "export const a=1;\n",
  },
  "malformed-stage": { error: expect.stringMatching(/CHECK constraint failed/u), injections: 1, latestUnchanged: true, pinnedText: "export const a=1;\n" },
  "mixed-stage": { error: expect.stringMatching(/mixed source versions/u), injections: 1, latestUnchanged: true, pinnedText: "export const a=1;\n" },
  "post-pin": {
    error: expect.stringMatching(/injected read pin failure/u),
    injections: 1,
    published: true,
    latest: 1,
    connections: 1,
    closed: true,
    checkpointBusy: 0,
    programs: ["tsconfig.a.json", "tsconfig.b.json"],
  },
  "post-metadata": {
    error: expect.stringMatching(/injected pinned metadata failure/u),
    injections: 1,
    published: true,
    latest: 1,
    connections: 1,
    closed: true,
    checkpointBusy: 0,
    programs: ["tsconfig.a.json", "tsconfig.b.json"],
  },
  "post-inputs": {
    error: expect.stringMatching(/inputs changed during extraction/u),
    injections: 1,
    published: true,
    latest: 1,
    connections: 1,
    closed: true,
    checkpointBusy: 0,
    programs: ["tsconfig.a.json", "tsconfig.b.json"],
  },
  "member-duplicate": {
    error: expect.stringMatching(/read acquisition failed: native inventory generation member program differs/u),
    membershipError: expect.stringMatching(/member program differs/u),
    injections: 1,
    latest: 1,
    connections: 1,
    closed: true,
    checkpointBusy: 0,
    restoredSame: true,
    restoredFiles: ["a.ts", "b.ts"],
  },
  "member-swapped": {
    error: expect.stringMatching(/read acquisition failed: native inventory generation member program differs/u),
    membershipError: expect.stringMatching(/member program differs/u),
    injections: 1,
    latest: 1,
    connections: 1,
    closed: true,
    checkpointBusy: 0,
    restoredSame: true,
    restoredFiles: ["a.ts", "b.ts"],
  },
  "concurrent-publisher": { error: null, injections: 1, selectedGeneration: 1, selectedExport: true, latest: 2 },
  "shape-writer": {
    called: true,
    writerTransaction: true,
    writerQueryOnly: { ["query_only"]: 0 },
    catalogText: "export const a=1;\n",
    selectedText: "export const a=1;\n",
    readerTransaction: true,
    readerQueryOnly: { ["query_only"]: 1 },
  },
  "lazy-reference-metadata": { before: 0, nonempty: true, queried: true, disposed: expect.stringMatching(/disposed/u) },
} satisfies Record<(typeof NATIVE_PUBLICATION_CASES)[number], object>;

test.for(NATIVE_PUBLICATION_CASES)("observed native publication preserves %s", { timeout: scaledBudget(120_000) }, (mode, { scratch, repoRoot }) => {
  const implementation = copyNativeInventoryImplementation(scratch, repoRoot);
  const root = join(scratch, "subject");
  mkdirSync(root);
  initialize(root);
  const entry = fileURLToPath(new URL("../compiler/native-publication-cases.ts", import.meta.url));
  const bootstrap = join(implementation, "tooling/src/floor/compiler/semantic-inventory-runtime.ts");
  const resultPath = join(scratch, "result.json");
  const completed = runNicedSync(process.execPath, ["--import", bootstrap, entry, mode, implementation, root, resultPath], { timeout: scaledBudget(110_000) });
  expect(completed.errorCode).toBeUndefined();
  expect(completed.status, completed.stderr).toBe(0);
  expect(JSON.parse(readFileSync(resultPath, "utf8"))).toMatchObject({ mode, ...publicationExpected[mode] });
});

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
    referenceMode: "complete",
    referenceQueries: [],
    available: sources.map((source) => source.file),
    format: INVENTORY_FORMAT,
    families: request.intent === "membership" ? [] : inventoryFamilies(request.families),
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
    referenceQueries: [...readInventoryReferenceQueries(database, id)],
    witnesses: [...readInventoryWitnesses(database, id)],
  };
}

function readerFixture(root: string, capture = partition): ReturnType<typeof ownedInventoryReader> {
  const db = openInventoryDatabase(join(root, ".cache/reader-fixture.sqlite"));
  try {
    beginInventoryWrite(db);
    const generation = publishInventoryGeneration(
      db,
      readCompilerPrograms(root).map((descriptor) => capture({ root, descriptor, destination: "" })),
    );
    db.exec("COMMIT");
    const partitions = readInventoryGeneration(db, generation);
    return ownedInventoryReader(root, generation, acquireInventoryReadLease(db, generation, partitions), { db, dispose: () => db.close() });
  } catch (error) {
    db.close();
    throw error;
  }
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

test("materialized reader sources reuse canonical SDK lookup without sharing carrier identities", ({ scratch }) => {
  initialize(scratch);
  write(scratch, "tsconfig.b.json", JSON.stringify({ files: ["a.ts", "b.ts"], compilerOptions: { noLib: true, types: [] } }));
  const alias = join(scratch, "alias-a.ts");
  write(scratch, "alias-a.ts", "export const a=1;\n");
  const capture = (request: InventoryBuildRequest): InventoryPartition => {
    const facts = partition(request);
    for (const source of facts.sources) {
      if (source.file === join(scratch, "a.ts")) {
        source.path = alias;
      }
    }
    return facts;
  };
  using reader = readerFixture(scratch, capture);
  using other = readerFixture(scratch);
  const corpus = reader.sourceCorpus();
  const file = join(scratch, "a.ts");
  const lookup = vi.spyOn(Project.prototype, "getSourceFile");
  try {
    const source = corpus.getSourceFile(file);
    expect(source?.getFullText()).toBe("export const a=1;\n");
    for (const path of ["a.ts", "./a.ts", file, "./nested/../a.ts", alias]) {
      expect(corpus.getSourceFile(path)).toBe(source);
    }
    expect(lookup).toHaveBeenCalledExactlyOnceWith(file);
    if (source === undefined) {
      throw new Error("materialized source missing");
    }
    const importer = corpus.getSourceFile("b.ts");
    const joined = reader.exports(source).get("a")?.[0];
    const single = reader.exports(source, importer).get("a")?.[0];
    expect(joined?.getText()).toBe("a=1");
    expect(single?.getText()).toBe("a=1");
    expect(joined?.getSourceFile()).not.toBe(source);
    expect(single?.getSourceFile()).not.toBe(joined?.getSourceFile());
    expect(other.sourceCorpus().getSourceFile(file)).not.toBe(source);
  } finally {
    lookup.mockRestore();
  }
});

test("materialized source lookup observes removal, external replacement, misses and disposal", ({ scratch }) => {
  initialize(scratch);
  using reader = readerFixture(scratch);
  const corpus = reader.sourceCorpus();
  const file = join(scratch, "a.ts");
  const source = corpus.getSourceFile(file);
  if (source === undefined) {
    throw new Error("materialized lifecycle source missing");
  }
  const carrier = source.getProject();
  source.forget();
  const recovered = corpus.getSourceFile(file);
  expect(recovered).not.toBe(source);
  expect(recovered?.getFullText()).toBe("export const a=1;\n");
  if (recovered === undefined) {
    throw new Error("forgotten source was not rematerialized");
  }
  expect(carrier.removeSourceFile(recovered)).toBe(true);
  const replacement = carrier.createSourceFile(file, "export const replacement=2;\n");
  expect(corpus.getSourceFile(file)).toBe(replacement);
  expect(corpus.getSourceFile(file)?.getFullText()).toBe("export const replacement=2;\n");
  expect(() => reader.sameNode(replacement, replacement)).toThrow("source/epoch");
  replacement.forget();
  const restored = corpus.getSourceFile(file);
  expect(restored?.getFullText()).toBe("export const a=1;\n");
  const absent = join(scratch, "absent.ts");
  expect(corpus.getSourceFile(absent)).toBeUndefined();
  const external = carrier.createSourceFile(absent, "export const external=3;");
  expect(corpus.getSourceFile(absent)).toBe(external);
  external.forget();
  expect(corpus.getSourceFile(absent)).toBeUndefined();
  const read = (): ReturnType<typeof corpus.getSourceFile> => corpus.getSourceFile(file);
  reader[Symbol.dispose]();
  expect(restored?.wasForgotten()).toBe(true);
  expect(() => read()).toThrow("disposed");
});

test("materialized source lookup follows same-text and changed-text overwrite epochs", ({ scratch }) => {
  initialize(scratch);
  using reader = readerFixture(scratch);
  const source = reader.sourceCorpus().getSourceFile("a.ts");
  if (source === undefined) {
    throw new Error("overwrite source missing");
  }
  const first = reader.exports(source).get("a")?.[0];
  if (first === undefined) {
    throw new Error("overwrite declaration missing");
  }
  const captured = first.getSourceFile();
  const epoch = captured.compilerNode;
  const carrier = captured.getProject();
  expect(carrier.createSourceFile(captured.getFilePath(), captured.getFullText(), { overwrite: true })).toBe(captured);
  expect(captured.compilerNode).not.toBe(epoch);
  expect(first.wasForgotten()).toBe(true);
  const next = reader.exports(source).get("a")?.[0];
  expect(next?.getText()).toBe("a=1");
  expect(next).not.toBe(first);
  expect(next?.getSourceFile()).toBe(captured);
  const text = "export const changed=4;\n";
  expect(source.getProject().createSourceFile(source.getFilePath(), text, { overwrite: true })).toBe(source);
  expect(reader.sourceCorpus().getSourceFile("a.ts")).toBe(source);
  expect(source.getFullText()).toBe(text);
  expect(() => reader.sameNode(source, source)).toThrow("source/epoch");
});

test("materialized source lookup follows public moves and overwritten destinations", ({ scratch }) => {
  initialize(scratch);
  using reader = readerFixture(scratch);
  const corpus = reader.sourceCorpus();
  const source = corpus.getSourceFile("a.ts");
  if (source === undefined) {
    throw new Error("move source missing");
  }
  const moved = join(scratch, "moved.ts");
  expect(source.move(moved)).toBe(source);
  const replacement = corpus.getSourceFile("a.ts");
  expect(replacement).not.toBe(source);
  expect(replacement?.getFullText()).toBe("export const a=1;\n");
  expect(corpus.getSourceFile(moved)).toBe(source);
  expect(replacement?.move(moved, { overwrite: true })).toBe(replacement);
  expect(source.wasForgotten()).toBe(true);
  expect(corpus.getSourceFile(moved)).toBe(replacement);
  expect(corpus.getSourceFile("a.ts")).not.toBe(replacement);
});

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

test("pinned queries never eagerly decode a complete detached reference family", ({ scratch }) => {
  initialize(scratch);
  const capture = (request: InventoryBuildRequest): InventoryPartition => {
    const facts = partition(request);
    const declaration = facts.exports[0]?.declarations[0];
    if (declaration === undefined) {
      throw new Error("native lazy-reader fixture declaration missing");
    }
    facts.references.push(...Array.from({ length: 4000 }, () => ({ declaration, reference: declaration, consumerClass: "product" as const })));
    return facts;
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
    using stored = readerFixture(scratch, capture);
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
    expect(() => nativeInventoryFixture({ root: scratch }, { failWorker: true })).toThrow("injected native worker exit");
    using observer = openInventoryDatabase(path);
    expect(observer.prepare("SELECT payload FROM inventory_partition WHERE id='legacy'").get()).toEqual({ payload: legacyPayload });
    expect(observer.prepare("SELECT program,descriptorVersion,compilerOptionsJson FROM inventory_descriptor WHERE partition='legacy'").get()).toEqual(
      legacyFormat >= 2
        ? { program: "tsconfig.a.json", descriptorVersion: descriptorVersion(descriptor), compilerOptionsJson: JSON.stringify(descriptor.commandLine.options) }
        : undefined,
    );
    expect(observer.prepare("SELECT id,format FROM inventory_generation").all()).toEqual([{ id: 1, format: legacyFormat }]);
    using current = nativeInventoryFixture({ root: scratch });
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
  using normal = readerFixture(scratch);
  {
    using corpus = normal.sourceCorpus();
    expect(corpus.getSourceFiles()).toHaveLength(2);
  }
  expect(() => normal.sourceCorpus().getSourceFiles()).toThrow("disposed");
  using exceptional = readerFixture(scratch);
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
    referenceMode: "complete",
    referenceQueries: [],
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
  using first = readerFixture(scratch);
  expect(first.sourceCorpus().getSourceFile("a.ts")?.getFullText()).toContain("a=1");
  write(scratch, "a.ts", "export const changedA=3;\n");
  write(scratch, "b.ts", "export const changedB=4;\n");
  using second = readerFixture(scratch);
  expect(second.generation).toBeGreaterThan(first.generation);
  using db = openInventoryDatabase(join(scratch, ".cache/reader-fixture.sqlite"));
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

function initializeLegacyWorlds(root: string): void {
  initialize(root);
  for (const [world, config] of Object.entries(LEGACY_TEST_WORLD_PROGRAMS)) {
    const file = `tests/legacy/${world}/case.test.ts`;
    write(root, file, "export const legacy=1;");
    write(root, config, JSON.stringify({ files: [file], compilerOptions: { noLib: true, types: [] } }));
  }
}

test("legacy analysis eligibility retains compiler programs but omits their semantic partitions", { timeout: scaledBudget(60_000) }, ({ scratch }) => {
  initializeLegacyWorlds(scratch);
  const programs = readCompilerPrograms(scratch);
  expect(programs.map(({ id }) => id)).toEqual(expect.arrayContaining(Object.values(LEGACY_TEST_WORLD_PROGRAMS)));
  const built: string[] = [];
  using reader = nativeInventoryFixture({ root: scratch }, { workers: built });
  expect(built.toSorted()).toEqual(["tsconfig.a.json", "tsconfig.b.json"]);
  expect(reader.programs).toEqual(["tsconfig.a.json", "tsconfig.b.json"]);
});

test("legacy analysis eligibility rejects explicit legacy demand before worker creation", ({ scratch }) => {
  initializeLegacyWorlds(scratch);
  const programs = readCompilerPrograms(scratch);
  const workspace = createSemanticWorkspace({ root: scratch });
  expect(workspace.programs.map(({ descriptor }) => descriptor.id)).toEqual(["tsconfig.a.json", "tsconfig.b.json"]);
  for (const config of Object.values(LEGACY_TEST_WORLD_PROGRAMS)) {
    const descriptor = programs.find((program) => program.config === config);
    if (descriptor === undefined) {
      throw new Error("the neutral legacy compiler owner disappeared");
    }
    const built: string[] = [];
    expect(() => workspace.program(config)).toThrow("execution and typecheck only");
    expect(() => nativeInventoryFixture({ root: scratch, programs: [descriptor] }, { workers: built })).toThrow("execution and typecheck only");
    expect(built).toEqual([]);
    expect(() => createSemanticWorkspace({ root: scratch, programs: [descriptor] })).toThrow("execution and typecheck only");
    expect(() => extractInventoryPartition({ root: scratch, descriptor, destination: join(scratch, "unused.sqlite") })).toThrow("execution and typecheck only");
  }
});

test("legacy analysis eligibility publishes a new exact generation without relabeling old all-world snapshots", ({ scratch }) => {
  initializeLegacyWorlds(scratch);
  const path = join(scratch, ".cache", "semantic-inventory.sqlite");
  using db = openInventoryDatabase(path);
  const descriptors = readCompilerPrograms(scratch);
  const all = descriptors.map((descriptor) => partition({ root: scratch, descriptor, destination: "" }));
  beginInventoryWrite(db);
  const historical = publishInventoryGeneration(db, all);
  db.exec("COMMIT");
  const historicalPartitions = readInventoryGeneration(db, historical);
  using old = ownedInventoryReader(scratch, historical, acquireInventoryReadLease(db, historical, historicalPartitions), { db, dispose: () => undefined });
  const oldPrograms = descriptors.map(({ id }) => id).toSorted();
  const oldPartitions = readInventoryGeneration(db, historical).map(({ id }) => id);
  const built: string[] = [];
  using current = nativeInventoryFixture({ root: scratch }, { workers: built });
  expect(current.generation).not.toBe(historical);
  expect(current.programs).toEqual(["tsconfig.a.json", "tsconfig.b.json"]);
  expect(built.toSorted()).toEqual(["tsconfig.a.json", "tsconfig.b.json"]);
  expect(old.programs).toEqual(oldPrograms);
  expect(readInventoryGeneration(db, historical).map(({ id }) => id)).toEqual(oldPartitions);
  using latest = openInventoryDatabase(path);
  expect(readInventoryGeneration(latest, current.generation).map(({ program }) => program)).toEqual(["tsconfig.a.json", "tsconfig.b.json"]);
});
