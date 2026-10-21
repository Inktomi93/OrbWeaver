import { mkdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { InventoryBuildRequest, InventorySpan } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import { openInventoryDatabase, readInventoryGeneration } from "@orb/tooling/floor/code-facts/semantic-inventory-database";
import {
  canonicalInventoryPath,
  descriptorVersion,
  inputsCurrent,
  inputVersion,
  inventoryAuthoredFiles,
} from "@orb/tooling/floor/code-facts/semantic-inventory-inputs";
import { readCompilerPrograms } from "@orb/tooling/floor/compiler/compiler-programs";
import { extractInventoryPartition } from "@orb/tooling/floor/compiler/semantic-inventory-extract";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { Program, Project, SourceFile, ts } from "ts-morph";
import { vi } from "vitest";
import { z } from "zod";
import type {
  InventoryInput,
  InventoryPartition,
  StoredInventoryPartition,
  StoredInventorySource,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import {
  readInventoryInputs,
  readInventoryReferences,
  readInventorySourceMetadata,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { extractWithoutReferenceWrappers, fixtureValue, implementationRoot, nativeInputCase, redirectFixture } from "./_semantic-inventory-extract-support.ts";
import { nativeInventoryFixture } from "./native-inventory-fixture.ts";

function capturedMetadata(
  db: ReturnType<typeof openInventoryDatabase>,
  generation: number,
): StoredInventoryPartition & {
  readonly inputs: InventoryInput[];
  readonly sources: StoredInventorySource[];
  readonly references: InventoryPartition["references"];
} {
  const partition = fixtureValue(readInventoryGeneration(db, generation)[0]);
  return {
    ...partition,
    inputs: [...readInventoryInputs(db, partition.id)],
    sources: [...readInventorySourceMetadata(db, partition.id)],
    references: [...readInventoryReferences(db, partition.id)],
  };
}

function nativeSpan(node: ts.Node): InventorySpan {
  return { file: canonicalInventoryPath(node.getSourceFile().fileName), start: node.getStart(), end: node.getEnd(), kind: node.kind };
}

test.for(["identical", "different", "symlink", "overlay", "js-depth"] as const)(
  "native authored inputs cover every positive and negative membership decision including sources absent from bootstrap metadata: %s",
  (variant, { scratch }) => {
    let request = redirectFixture(scratch, variant === "overlay" || variant === "js-depth" ? "symlink" : variant);
    const consumer = join(scratch, "consumer.ts");
    const added = join(scratch, "virtual.ts");
    if (variant === "js-depth") {
      for (const name of ["depth-a", "depth-b"]) {
        mkdirSync(join(scratch, "node_modules", name));
        writeFileSync(join(scratch, "node_modules", name, "package.json"), JSON.stringify({ name, version: "1.0.0", main: "index.js" }));
      }
      writeFileSync(join(scratch, "node_modules/depth-a/index.js"), "export {value} from 'depth-b';\n");
      writeFileSync(join(scratch, "node_modules/depth-b/index.js"), "export const value=7;\n");
      writeFileSync(consumer, "import {value} from 'depth-a'; export const use=value;\n");
      writeFileSync(
        join(scratch, "tsconfig.json"),
        JSON.stringify({
          files: ["consumer.ts"],
          compilerOptions: { noLib: true, types: [], allowJs: true, maxNodeModuleJsDepth: 1, module: "ESNext", moduleResolution: "Bundler" },
        }),
      );
      request = { ...request, descriptor: fixtureValue(readCompilerPrograms(scratch)[0]) };
    }
    const projected: InventoryBuildRequest =
      variant === "overlay"
        ? {
            ...request,
            overlay: {
              authoredAddedPaths: [added],
              root: scratch,
              files: [
                { path: consumer, text: `${readFileSync(consumer, "utf8")}\nimport {virtual} from './virtual'; export const useVirtual=virtual;\n` },
                { path: added, text: "export const virtual=7;\n" },
              ],
              deleted: [],
            },
          }
        : request;
    const membership = new Map<string, boolean>();
    const has = Set.prototype.has;
    // The authored set alone contains these physical configuration and source identities; native file sets exclude the Git policy file.
    const observation = vi.spyOn(Set.prototype, "has").mockImplementation(function (this: Set<string>, value: string): boolean {
      const result = has.call(this, value);
      if (has.call(this, consumer) && has.call(this, join(scratch, "tsconfig.json")) && has.call(this, join(scratch, ".gitignore"))) {
        membership.set(value, result);
      }
      return result;
    });
    let partition: ReturnType<typeof extractInventoryPartition>;
    try {
      partition = extractInventoryPartition(projected);
    } finally {
      observation.mockRestore();
    }
    expect(membership.get(consumer)).toBe(true);
    expect(membership.get(join(scratch, variant === "js-depth" ? "node_modules/depth-b/index.js" : "node_modules/left/node_modules/shared/index.d.ts"))).toBe(
      false,
    );
    expect(membership.get(added)).toBe(variant === "overlay" ? true : undefined);
    expect(partition.inputs.filter((input) => input.kind === "authored")).toEqual(
      [...membership]
        .map(([path, authored]) => ({ path, kind: "authored", version: String(authored) }))
        .toSorted((left, right) => left.path.localeCompare(right.path)),
    );
    expect(partition.sources.some((source) => source.file === join(scratch, "node_modules/depth-b/index.js"))).toBe(false);
  },
);

test("Git admission of an ignored native import rebuilds authored facts without changing native inputs or the pinned reader", ({ scratch }) => {
  writeFileSync(join(scratch, ".gitignore"), ".cache/\ndeps/\n");
  mkdirSync(join(scratch, "deps"));
  const dependency = join(scratch, "deps/value.ts");
  writeFileSync(dependency, "export const value=1; export const local=value;\n");
  writeFileSync(join(scratch, "consumer.ts"), "import {value} from './deps/value'; export const use=value;\n");
  writeFileSync(
    join(scratch, "tsconfig.json"),
    JSON.stringify({ files: ["consumer.ts"], compilerOptions: { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler" } }),
  );
  execFixtureGit(scratch, ["init", "-q"]);
  const descriptor = fixtureValue(readCompilerPrograms(scratch)[0]);
  const workers: string[] = [];
  using previous = nativeInventoryFixture({ root: scratch, referenceDemand: { mode: "complete", queries: [] } }, { workers });
  using metadata = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  const original = capturedMetadata(metadata, previous.generation);
  expect(original.sources.find((source) => source.file === dependency)?.authored).toBe(false);
  const previousSource = fixtureValue(previous.sourceCorpus().getSourceFile(dependency));
  const previousValue = previousSource.getVariableDeclarationOrThrow("value");
  expect(() => previous.references(previousValue)).toThrow("unsupported for non-authored origin");
  execFixtureGit(scratch, ["add", "-f", "deps/value.ts"]);
  expect(descriptorVersion(fixtureValue(readCompilerPrograms(scratch)[0]))).toBe(descriptorVersion(descriptor));
  const context = { authored: inventoryAuthoredFiles(scratch) };
  expect(
    inputsCurrent(
      original.inputs.filter((input) => input.kind !== "authored"),
      context,
    ),
  ).toBe(true);
  expect(inputsCurrent(original.inputs, context)).toBe(false);
  using current = nativeInventoryFixture({ root: scratch, referenceDemand: { mode: "complete", queries: [] } }, { workers });
  expect(workers).toHaveLength(2);
  expect(capturedMetadata(metadata, current.generation).sources.find((source) => source.file === dependency)?.authored).toBe(true);
  const currentValue = fixtureValue(current.sourceCorpus().getSourceFile(dependency)).getVariableDeclarationOrThrow("value");
  expect(current.references(currentValue).map((node) => node.getSourceFile().getFilePath())).toContain(join(scratch, "consumer.ts"));
  expect(() => previous.references(previousValue)).toThrow("unsupported for non-authored origin");
});

test("Git admission of a language-service-only JS declaration invalidates its recorded negative membership", ({ scratch }) => {
  writeFileSync(join(scratch, ".gitignore"), ".cache/\nnode_modules/\n");
  for (const name of ["depth-a", "depth-b"]) {
    mkdirSync(join(scratch, "node_modules", name), { recursive: true });
    writeFileSync(join(scratch, "node_modules", name, "package.json"), JSON.stringify({ name, version: "1.0.0", main: "index.js" }));
  }
  writeFileSync(join(scratch, "node_modules/depth-a/index.js"), "export {value} from 'depth-b';\n");
  const dependency = join(scratch, "node_modules/depth-b/index.js");
  writeFileSync(dependency, "export const value=7;\n");
  writeFileSync(join(scratch, "consumer.ts"), "import {value} from 'depth-a'; export const use=value;\n");
  writeFileSync(
    join(scratch, "tsconfig.json"),
    JSON.stringify({
      files: ["consumer.ts"],
      compilerOptions: { noLib: true, types: [], allowJs: true, maxNodeModuleJsDepth: 1, module: "ESNext", moduleResolution: "Bundler" },
    }),
  );
  execFixtureGit(scratch, ["init", "-q"]);
  const descriptor = fixtureValue(readCompilerPrograms(scratch)[0]);
  const workers: string[] = [];
  using previous = nativeInventoryFixture({ root: scratch, referenceDemand: { mode: "complete", queries: [] } }, { workers });
  using metadata = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  const original = capturedMetadata(metadata, previous.generation);
  expect(original.sources.some((source) => source.file === dependency)).toBe(false);
  expect(original.inputs.find((input) => input.path === dependency && input.kind === "authored")?.version).toBe("false");
  execFixtureGit(scratch, ["add", "-f", "node_modules/depth-b/index.js"]);
  const context = { authored: inventoryAuthoredFiles(scratch) };
  expect(descriptorVersion(fixtureValue(readCompilerPrograms(scratch)[0]))).toBe(descriptorVersion(descriptor));
  expect(
    inputsCurrent(
      original.inputs.filter((input) => input.kind !== "authored"),
      context,
    ),
  ).toBe(true);
  expect(inputsCurrent(original.inputs, context)).toBe(false);
  using current = nativeInventoryFixture({ root: scratch, referenceDemand: { mode: "complete", queries: [] } }, { workers });
  expect(workers).toHaveLength(2);
  const updated = capturedMetadata(metadata, current.generation);
  expect(updated.sources.some((source) => source.file === dependency)).toBe(false);
  expect(updated.inputs.find((input) => input.path === dependency && input.kind === "authored")?.version).toBe("true");
  expect(updated.references.some((entry) => entry.declaration.file === dependency)).toBe(true);
  expect(current.generation).toBeGreaterThan(previous.generation);
});

test.for(["toward", "away", "add", "remove"] as const)(
  "authored aliases invalidate native membership without becoming unrelated filesystem dependencies: %s",
  (change, { scratch }) => {
    writeFileSync(join(scratch, ".gitignore"), ".cache/\ndeps/\n");
    mkdirSync(join(scratch, "deps"));
    mkdirSync(join(scratch, "notes"));
    const dependency = join(scratch, "deps/value.ts");
    const text = "export const value=1; export const local=value;\n";
    writeFileSync(dependency, text);
    writeFileSync(join(scratch, "deps/other.ts"), text);
    writeFileSync(join(scratch, "consumer.ts"), "import {value} from './deps/value'; export const use=value;\n");
    writeFileSync(
      join(scratch, "tsconfig.json"),
      JSON.stringify({ files: ["consumer.ts"], compilerOptions: { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler" } }),
    );
    const alias = join(scratch, "notes/authored.txt");
    const before = change === "away" || change === "remove";
    if (change !== "add") {
      symlinkSync(before ? "../deps/value.ts" : "../deps/other.ts", alias);
    }
    execFixtureGit(scratch, ["init", "-q"]);
    const descriptor = fixtureValue(readCompilerPrograms(scratch)[0]);
    const workers: string[] = [];
    using previous = nativeInventoryFixture({ root: scratch, referenceDemand: { mode: "complete", queries: [] } }, { workers });
    using metadata = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    const original = capturedMetadata(metadata, previous.generation);
    expect(original.sources.find((source) => source.file === dependency)?.authored).toBe(before);
    expect(original.inputs.some((input) => input.path === alias)).toBe(false);
    if (change !== "add") {
      unlinkSync(alias);
    }
    if (change !== "remove") {
      symlinkSync(before ? "../deps/other.ts" : "../deps/value.ts", alias);
    }
    expect(descriptorVersion(fixtureValue(readCompilerPrograms(scratch)[0]))).toBe(descriptorVersion(descriptor));
    const context = { authored: inventoryAuthoredFiles(scratch) };
    expect(
      inputsCurrent(
        original.inputs.filter((input) => input.kind !== "authored"),
        context,
      ),
    ).toBe(true);
    expect(inputsCurrent(original.inputs, context)).toBe(false);
    using current = nativeInventoryFixture({ root: scratch, referenceDemand: { mode: "complete", queries: [] } }, { workers });
    expect(workers).toHaveLength(2);
    expect(capturedMetadata(metadata, current.generation).sources.find((source) => source.file === dependency)?.authored).toBe(!before);
    const previousValue = fixtureValue(previous.sourceCorpus().getSourceFile(dependency)).getVariableDeclarationOrThrow("value");
    const currentValue = fixtureValue(current.sourceCorpus().getSourceFile(dependency)).getVariableDeclarationOrThrow("value");
    const admitted = before ? previous : current;
    const excluded = before ? current : previous;
    expect(admitted.references(before ? previousValue : currentValue).length).toBeGreaterThan(0);
    expect(() => excluded.references(before ? currentValue : previousValue)).toThrow("unsupported for non-authored origin");
  },
);

test("removing an unrelated authored document reuses the same native partition without reading stored source text", { timeout: scaledBudget(240_000) }, ({
  scratch,
}) => {
  writeFileSync(join(scratch, ".gitignore"), ".cache/\n");
  mkdirSync(join(scratch, "notes"));
  const document = join(scratch, "notes/unrelated.txt");
  writeFileSync(document, "Unrelated authored text.\n");
  writeFileSync(join(scratch, "consumer.ts"), "export const value=1; export const use=value;\n");
  writeFileSync(join(scratch, "tsconfig.json"), JSON.stringify({ files: ["consumer.ts"], compilerOptions: { noLib: true, types: [] } }));
  execFixtureGit(scratch, ["init", "-q"]);
  expect(JSON.parse(nativeInputCase("unrelated-document", implementationRoot, scratch))).toMatchObject({
    absentInput: true,
    workers: 0,
    textReads: 0,
    sameGeneration: true,
  });
});

test("authored alias mutation after publication rolls back before commit and preserves the pinned reader", { timeout: scaledBudget(240_000) }, ({
  scratch,
}) => {
  writeFileSync(join(scratch, ".gitignore"), ".cache/\ndeps/\n");
  mkdirSync(join(scratch, "deps"));
  for (const name of ["value", "other"]) {
    writeFileSync(join(scratch, `deps/${name}.ts`), "export const value=1; export const local=value;\n");
  }
  const alias = join(scratch, "authored.txt");
  symlinkSync("deps/value.ts", alias);
  const consumer = join(scratch, "consumer.ts");
  const original = "import {value} from './deps/value'; export const use=value;\n";
  writeFileSync(consumer, original);
  writeFileSync(
    join(scratch, "tsconfig.json"),
    JSON.stringify({ files: ["consumer.ts"], compilerOptions: { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler" } }),
  );
  execFixtureGit(scratch, ["init", "-q"]);
  const result = nativeInputCase("authored-publication-race", implementationRoot, scratch);
  expect(JSON.parse(result)).toMatchObject({
    refusal: expect.stringContaining("inputs changed during extraction"),
    workerStages: 1,
    publications: 1,
    latestUnchanged: true,
    pinnedText: original,
  });
  expect(z.object({ pinnedReferences: z.number() }).parse(JSON.parse(result)).pinnedReferences).toBeGreaterThan(0);
});

test.for(["identical", "different", "symlink"] as const)(
  "native package redirects preserve admitted origins and physical metadata: %s",
  (variant, { scratch }) => {
    const request = redirectFixture(scratch, variant);
    const left = join(scratch, "node_modules/left/node_modules/shared/index.d.ts");
    const right = join(scratch, "node_modules/right/node_modules/shared/index.d.ts");
    const other = join(scratch, "node_modules/other/node_modules/shared/index.d.ts");
    let host: Project | undefined;
    let bootstrap: ts.Program | undefined;
    const sourceReads: string[] = [];
    const wrappers = new Set<SourceFile>();
    const released = new Map<string, SourceFile>();
    const forget = SourceFile.prototype.forget;
    const cleanup = vi.spyOn(SourceFile.prototype, "forget").mockImplementation(function (this: SourceFile) {
      released.set(this.getFilePath(), this);
      forget.call(this);
    });
    const resolveDependencies = Project.prototype.resolveSourceFileDependencies;
    const resolution = vi.spyOn(Project.prototype, "resolveSourceFileDependencies").mockImplementation(function (this: Project) {
      const result = resolveDependencies.call(this);
      host = this;
      bootstrap = this.getProgram().compilerObject;
      const admitted = fixtureValue(bootstrap.getSourceFile(right));
      const cached = this.getSourceFileOrThrow(right);
      expect(admitted).not.toBe(cached.compilerNode);
      expect(admitted.endOfFileToken).toBe(fixtureValue(bootstrap.getSourceFile(left)).endOfFileToken);
      expect(cached.getFullText()).toBe(readFileSync(right, "utf8"));
      return result;
    });
    const readExports = SourceFile.prototype.getExportedDeclarations;
    const exports = vi.spyOn(SourceFile.prototype, "getExportedDeclarations").mockImplementation(function (this: SourceFile) {
      const program = fixtureValue(fixtureValue(host).getLanguageService().compilerObject.getProgram());
      expect(this.compilerNode).toBe(program.getSourceFile(this.getFilePath()));
      sourceReads.push(this.getFilePath());
      wrappers.add(this);
      return readExports.call(this);
    });
    const bootstrapChecker = vi.spyOn(Program.prototype, "getTypeChecker").mockImplementation(() => {
      throw new Error("redirect mapping hydrated the bootstrap checker");
    });
    try {
      const { partition, queries } = extractWithoutReferenceWrappers(request, () => {
        expect([...wrappers].every((source) => source.wasForgotten())).toBe(true);
      });
      const program = fixtureValue(fixtureValue(host).getLanguageService().compilerObject.getProgram());
      const checker = program.getTypeChecker();
      const admitted = fixtureValue(program.getSourceFile(right));
      const original = fixtureValue(fixtureValue(bootstrap).getSourceFile(right));
      expect(admitted).not.toBe(original);
      expect(admitted.statements).toBe(original.statements);
      expect(admitted.endOfFileToken).toBe(original.endOfFileToken);
      expect(program.getCompilerOptions()).toEqual(request.descriptor.commandLine.options);
      expect(partition.nativeRoots).toEqual([join(scratch, "consumer.ts")]);
      expect(partition.roots).toEqual(partition.nativeRoots);
      expect(partition.sources.map((source) => source.path)).toEqual(
        fixtureValue(bootstrap)
          .getSourceFiles()
          .map((source) => source.fileName),
      );
      expect(sourceReads).toEqual(partition.sources.map((source) => source.path));
      expect(new Set(program.getRootFileNames())).toEqual(new Set(partition.sources.map((source) => source.path)));
      for (const path of [left, right, other]) {
        const source = fixtureValue(program.getSourceFile(path));
        const symbol = fixtureValue(checker.getSymbolAtLocation(source));
        const value = fixtureValue(checker.getExportsOfModule(symbol).find((entry) => entry.getName() === "value"));
        const declarations = fixtureValue(value.getDeclarations()).map(nativeSpan);
        expect(partition.exports.find((entry) => entry.file === path && entry.name === "value")?.declarations).toEqual(declarations);
        expect(declarations[0]?.file).toBe(path === other ? other : left);
        expect(partition.sources.find((entry) => entry.path === path)?.text).toBe(readFileSync(path, "utf8"));
        expect(partition.inputs).toContainEqual(expect.objectContaining({ path, kind: "file", version: inputVersion(path, "file") }));
      }
      expect(partition.exports.some((entry) => entry.file === right && entry.name === "unrelated")).toBe(false);
      const origin = fixtureValue(partition.exports.find((entry) => entry.file === right && entry.name === "value")?.declarations[0]);
      expect(partition.witnesses[0]?.declarations).toEqual([origin]);
      expect(partition.bindings.some((entry) => entry.symbols.origins.some((declaration) => JSON.stringify(declaration) === JSON.stringify(origin)))).toBe(
        true,
      );
      expect(partition.modules.find((entry) => entry.specifier === "./absent")).toMatchObject({ target: null, declarations: [] });
      expect(partition.inputs.some((input) => input.path === join(scratch, "absent.ts") && input.version === "false")).toBe(true);
      expect(queries.every((query) => query.startsWith(`[${JSON.stringify(join(scratch, "consumer.ts"))},`))).toBe(true);
      expect(partition.references.every((entry) => entry.declaration.file === join(scratch, "consumer.ts"))).toBe(true);
      const extra = program.getSourceFiles().filter((source) => !sourceReads.includes(source.fileName));
      expect(extra.some((source) => source.fileName === join(scratch, "node_modules/linked/inner.d.ts"))).toBe(variant === "symlink");
      for (const source of extra) {
        expect(fixtureValue(bootstrap).getSourceFiles()).toContain(source.endOfFileToken.getSourceFile());
      }
      expect(new Set(released.keys())).toEqual(new Set(program.getSourceFiles().map((source) => source.fileName)));
      expect([...released.values()].every((source) => source.wasForgotten())).toBe(true);
      expect(bootstrapChecker).not.toHaveBeenCalled();
    } finally {
      cleanup.mockRestore();
      bootstrapChecker.mockRestore();
      exports.mockRestore();
      resolution.mockRestore();
    }
  },
);

test.for(["identical", "different"] as const)("authored package copies refuse another physical syntax origin: %s", (variant, { scratch }) => {
  const request = redirectFixture(scratch, variant);
  const path = "node_modules/right/node_modules/shared/index.d.ts";
  execFixtureGit(scratch, ["add", "-f", path]);
  expect(() => extractInventoryPartition(request)).toThrow(`native inventory authored source selects a different syntax origin: ${join(scratch, path)}`);
});

test.for(["separate-parse", "statements", "eof", "text", "filename", "missing"] as const)(
  "native source mapping refuses non-equivalent admission and releases standalone wrappers: %s",
  (difference, { scratch }) => {
    writeFileSync(join(scratch, "tsconfig.json"), JSON.stringify({ files: ["base.ts", "other.ts"], compilerOptions: { noLib: true, types: [] } }));
    writeFileSync(join(scratch, "base.ts"), "export const value=1; export const use=value;\n");
    writeFileSync(join(scratch, "other.ts"), "export const other=2;\n");
    execFixtureGit(scratch, ["init", "-q"]);
    const descriptor = fixtureValue(readCompilerPrograms(scratch)[0]);
    const path = join(scratch, "base.ts");
    const restores: (() => void)[] = [];
    const hostSources = new Set<SourceFile>();
    const forgotten = new Set<SourceFile>();
    const resolveDependencies = Project.prototype.resolveSourceFileDependencies;
    const resolution = vi.spyOn(Project.prototype, "resolveSourceFileDependencies").mockImplementation(function (this: Project) {
      const result = resolveDependencies.call(this);
      for (const source of this.getSourceFiles()) {
        hostSources.add(source);
      }
      const program = this.getProgram().compilerObject;
      const original = fixtureValue(program.getSourceFile(path));
      const detached = ts.createSourceFile(path, original.text, ts.ScriptTarget.Latest, true);
      if (difference !== "separate-parse" && difference !== "statements") {
        Object.defineProperty(detached, "statements", { value: original.statements });
      }
      if (difference !== "separate-parse" && difference !== "eof") {
        Object.defineProperty(detached, "endOfFileToken", { value: original.endOfFileToken });
      }
      if (difference === "text") {
        Object.defineProperty(detached, "text", { value: `${original.text}\n` });
      }
      const sources = program.getSourceFiles().map((source) => (source === original ? detached : source));
      const observation = vi.spyOn(program, "getSourceFiles").mockReturnValue(sources);
      restores.push(() => observation.mockRestore());
      return result;
    });
    const getLanguageService = Project.prototype.getLanguageService;
    const service = vi.spyOn(Project.prototype, "getLanguageService").mockImplementation(function (this: Project) {
      const result = getLanguageService.call(this);
      if (difference === "missing" || difference === "filename") {
        const program = fixtureValue(result.compilerObject.getProgram());
        const getSourceFile = program.getSourceFile.bind(program);
        const observation = vi.spyOn(program, "getSourceFile").mockImplementation((file) => {
          if (file === path) {
            return difference === "missing" ? undefined : getSourceFile(join(scratch, "other.ts"));
          }
          return getSourceFile(file);
        });
        restores.push(() => observation.mockRestore());
      }
      return result;
    });
    const forget = SourceFile.prototype.forget;
    const cleanup = vi.spyOn(SourceFile.prototype, "forget").mockImplementation(function (this: SourceFile) {
      forgotten.add(this);
      forget.call(this);
    });
    try {
      expect(() => extractInventoryPartition({ root: scratch, descriptor, destination: join(scratch, "unused.sqlite") })).toThrow(
        `native inventory source is not shared with its language-service Program: ${path}`,
      );
      expect(forgotten.size).toBe(2);
      expect([...forgotten].every((source) => source.wasForgotten())).toBe(true);
      expect([...hostSources].every((source) => !source.wasForgotten())).toBe(true);
    } finally {
      cleanup.mockRestore();
      service.mockRestore();
      resolution.mockRestore();
      for (const restore of restores) {
        restore();
      }
    }
  },
);
