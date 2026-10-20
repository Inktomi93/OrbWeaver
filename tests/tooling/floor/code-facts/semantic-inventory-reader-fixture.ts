// Two-world owned-reader fixture over hand-captured export facts; no compiler worker runs.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { inventoryConsumerClass } from "@orb/tooling/floor/code-facts/inventory-consumers";
import type { InventoryBuildRequest, InventoryPartition } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import { INVENTORY_FORMAT, inventoryFamilies } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import {
  beginInventoryWrite,
  openInventoryDatabase,
  publishInventoryGeneration,
  readInventoryGeneration,
} from "@orb/tooling/floor/code-facts/semantic-inventory-database";
import { descriptorVersion, inputVersion } from "@orb/tooling/floor/code-facts/semantic-inventory-inputs";
import { readCompilerPrograms } from "@orb/tooling/floor/compiler/compiler-programs";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { Project } from "ts-morph";
import { acquireInventoryReadLease } from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { ownedInventoryReader } from "../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts";

export function write(root: string, path: string, text: string): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, text);
}

export function initialize(root: string): void {
  write(root, ".gitignore", ".cache/\n");
  write(root, "tsconfig.a.json", JSON.stringify({ files: ["a.ts"], compilerOptions: { noLib: true, types: [] } }));
  write(root, "tsconfig.b.json", JSON.stringify({ files: ["b.ts"], compilerOptions: { noLib: true, types: [] } }));
  write(root, "a.ts", "export const a=1;\n");
  write(root, "b.ts", "export const b=2;\n");
  execFixtureGit(root, ["init", "-q"]);
}

export function partition(request: InventoryBuildRequest): InventoryPartition {
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

export function readerFixture(root: string, capture = partition): ReturnType<typeof ownedInventoryReader> {
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
