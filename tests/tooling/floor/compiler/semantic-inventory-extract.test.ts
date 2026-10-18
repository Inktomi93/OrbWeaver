import { existsSync, mkdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { InventoryBuildRequest, InventorySpan } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import { latestInventoryGeneration, openInventoryDatabase, readInventoryGeneration } from "@orb/tooling/floor/code-facts/semantic-inventory-database";
import {
  canonicalInventoryPath,
  contentVersion,
  descriptorVersion,
  inputsCurrent,
  inputVersion,
  inventoryAuthoredFiles,
} from "@orb/tooling/floor/code-facts/semantic-inventory-inputs";
import { readCompilerPrograms } from "@orb/tooling/floor/compiler/compiler-programs";
import { extractInventoryPartition } from "@orb/tooling/floor/compiler/semantic-inventory-extract";
import { createSemanticWorkspace, nativeCompilerSourceFiles } from "@orb/tooling/floor/compiler/ts-workspace";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { DocumentSpan, LanguageService, Node, Program, Project, SourceFile, SyntaxKind, TypeChecker, ts } from "ts-morph";
import { vi } from "vitest";
import { z } from "zod";
import type {
  InventoryInput,
  InventoryPartition,
  StoredInventoryPartition,
  StoredInventorySource,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { inputSchema } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import {
  readInventoryInputs,
  readInventoryReferences,
  readInventorySourceMetadata,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { runNicedSync } from "../../../../tooling/src/floor/process/proc.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeInventoryFixture } from "./native-inventory-fixture.ts";
import { copyNativeInventoryImplementation } from "./native-inventory-tree.ts";
import { instrumentNativeQueryWorker, NATIVE_QUERY_MUTATIONS } from "./native-query-mutation.ts";

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

function nativeInputCase(mode: string, implementation: string, root: string): string {
  const result = join(root, ".cache/native-input-currentness-result.json");
  mkdirSync(dirname(result), { recursive: true });
  const entry = fileURLToPath(new URL("./native-input-currentness-cases.ts", import.meta.url));
  const bootstrap = join(implementation, "tooling/src/floor/compiler/semantic-inventory-runtime.ts");
  const completed = runNicedSync(process.execPath, ["--import", bootstrap, entry, mode, implementation, root, result], {
    timeout: scaledBudget(180_000),
  });
  expect(completed.errorCode).toBeUndefined();
  expect(completed.status, completed.stderr).toBe(0);
  return readFileSync(result, "utf8");
}

const implementationRoot = fileURLToPath(new URL("../../../../", import.meta.url));

function span(node: Node): InventorySpan {
  return { file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() };
}

function fixtureValue<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("required native query fixture value missing");
  }
  return value;
}

function redirectFixture(root: string, variant: "identical" | "different" | "symlink"): InventoryBuildRequest {
  const write = (path: string, text: string): void => {
    const absolute = join(root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, text);
  };
  write(".gitignore", "node_modules/\n.cache/\n");
  write(
    "tsconfig.json",
    JSON.stringify({
      files: ["consumer.ts"],
      compilerOptions: { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler", preserveSymlinks: variant === "symlink" },
    }),
  );
  for (const side of ["left", "right", "other"]) {
    write(`node_modules/${side}/package.json`, JSON.stringify({ name: side, version: "1.0.0", types: "index.d.ts" }));
    write(`node_modules/${side}/index.d.ts`, "export {value as value, inner} from 'shared';\n");
    const shared = `node_modules/${side}/node_modules/shared`;
    write(`${shared}/package.json`, JSON.stringify({ name: "shared", version: side === "other" ? "2.0.0" : "1.0.0", types: "index.d.ts" }));
    write(
      `${shared}/index.d.ts`,
      `${variant === "different" && side === "right" ? "export declare const unrelated: string;\n" : ""}export declare const value: ${side === "other" ? "2" : "1"}; export {inner} from './inner';\n`,
    );
    write(`${shared}/inner.d.ts`, "export declare const inner: number;\n");
  }
  if (variant === "symlink") {
    symlinkSync("left/node_modules/shared", join(root, "node_modules/linked"));
  }
  write(
    "consumer.ts",
    [
      "import {value as left} from 'left'; import {value as right} from 'right'; import {value as other} from 'other';",
      "import {absent} from './absent'; export const missing=absent;",
      "export const use=left+right+other; export const witness='value' satisfies keyof typeof import('right');",
      variant === "symlink" ? "import {inner} from 'linked'; export const linked=inner;" : "",
    ].join("\n"),
  );
  execFixtureGit(root, ["init", "-q"]);
  return { root, descriptor: fixtureValue(readCompilerPrograms(root)[0]), destination: join(root, "unused.sqlite") };
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
  using previous = nativeInventoryFixture({ root: scratch }, { workers });
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
  using current = nativeInventoryFixture({ root: scratch }, { workers });
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
  using previous = nativeInventoryFixture({ root: scratch }, { workers });
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
  using current = nativeInventoryFixture({ root: scratch }, { workers });
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
    using previous = nativeInventoryFixture({ root: scratch }, { workers });
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
    using current = nativeInventoryFixture({ root: scratch }, { workers });
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
        expect(partition.inputs).toContainEqual({ path, kind: "file", version: inputVersion(path, "file") });
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

function extractWithoutReferenceWrappers(
  request: InventoryBuildRequest,
  beforeQuery?: (service: ts.LanguageService) => void,
  observePass?: (pass: ts.ReadonlyReferencePass) => void,
): { partition: ReturnType<typeof extractInventoryPartition>; queries: string[] } {
  const queries: string[] = [];
  const restoreQueries: (() => void)[] = [];
  const observed = new Set<LanguageService>();
  const getLanguageService = Project.prototype.getLanguageService;
  const observation = vi.spyOn(Project.prototype, "getLanguageService").mockImplementation(function (this: Project) {
    const service = getLanguageService.call(this);
    if (!observed.has(service)) {
      observed.add(service);
      const createPass = service.compilerObject.createReadonlyReferencePass.bind(service.compilerObject);
      const passCreation = vi.spyOn(service.compilerObject, "createReadonlyReferencePass").mockImplementation(() => {
        const pass = createPass();
        observePass?.(pass);
        const nativeFind = pass.findReferences.bind(pass);
        const query = vi.spyOn(pass, "findReferences").mockImplementation((file, position, options) => {
          expect(options).toEqual({ includeDefinitionDisplay: false });
          beforeQuery?.(service.compilerObject);
          queries.push(JSON.stringify([file, position]));
          return nativeFind(file, position, options);
        });
        restoreQueries.push(() => query.mockRestore());
        return pass;
      });
      restoreQueries.push(() => passCreation.mockRestore());
    }
    return service;
  });
  const wrappers = vi.spyOn(LanguageService.prototype, "findReferences").mockImplementation(() => {
    throw new Error("reference wrappers retain source-file modification subscriptions");
  });
  const materialization = vi.spyOn(DocumentSpan.prototype, "getNode").mockImplementation(() => {
    throw new Error("reference spans must not materialize DocumentSpan nodes");
  });
  try {
    const partition = extractInventoryPartition(request);
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.length).toBe(new Set(queries).size);
    expect(wrappers).not.toHaveBeenCalled();
    expect(materialization).not.toHaveBeenCalled();
    return { partition, queries };
  } finally {
    materialization.mockRestore();
    wrappers.mockRestore();
    for (const restore of restoreQueries) {
      restore();
    }
    observation.mockRestore();
  }
}

test("inventory facts share the reference checker while both native Programs retain their roots and sources", ({ scratch }) => {
  writeFileSync(
    join(scratch, "tsconfig.json"),
    JSON.stringify({ files: ["consumer.ts"], compilerOptions: { lib: ["es2022"], types: [], module: "ESNext", moduleResolution: "Bundler" } }),
  );
  writeFileSync(join(scratch, "base.ts"), "export const value=1; export interface Shape {value:number}\n");
  writeFileSync(
    join(scratch, "consumer.ts"),
    "import {value as alias,type Shape} from './base'; export const use:Shape={value:alias}; export const witness='value' satisfies keyof typeof import('./base'); export const later=import('./base').then(m=>m.value);\n",
  );
  execFixtureGit(scratch, ["init", "-q"]);
  const descriptor = fixtureValue(readCompilerPrograms(scratch)[0]);
  let host: Project | undefined;
  let hostProgram: ts.Program | undefined;
  let hostRoots: readonly string[] | undefined;
  let referenceProgram: ts.Program | undefined;
  let referenceRoots: readonly string[] | undefined;
  const hostSources = new Map<string, ts.SourceFile>();
  const sourceReadOrder: string[] = [];
  const readCheckers = new Set<ts.TypeChecker>();
  const resolveDependencies = Project.prototype.resolveSourceFileDependencies;
  const resolution = vi.spyOn(Project.prototype, "resolveSourceFileDependencies").mockImplementation(function (this: Project) {
    const result = resolveDependencies.call(this);
    host = this;
    hostProgram = this.getProgram().compilerObject;
    hostRoots = [...hostProgram.getRootFileNames()];
    for (const source of hostProgram.getSourceFiles()) {
      hostSources.set(source.fileName, source);
    }
    return result;
  });
  const getExports = TypeChecker.prototype.getExportsOfModule;
  const exports = vi.spyOn(TypeChecker.prototype, "getExportsOfModule").mockImplementation(function (this: TypeChecker, symbol) {
    readCheckers.add(this.compilerObject);
    return getExports.call(this, symbol);
  });
  const getType = TypeChecker.prototype.getTypeAtLocation;
  const types = vi.spyOn(TypeChecker.prototype, "getTypeAtLocation").mockImplementation(function (this: TypeChecker, node) {
    readCheckers.add(this.compilerObject);
    return getType.call(this, node);
  });
  const readExports = SourceFile.prototype.getExportedDeclarations;
  const sourceReads = vi.spyOn(SourceFile.prototype, "getExportedDeclarations").mockImplementation(function (this: SourceFile) {
    const program = fixtureValue(fixtureValue(host).getLanguageService().compilerObject.getProgram());
    referenceProgram ??= program;
    referenceRoots ??= [...program.getRootFileNames()];
    expect(this.compilerNode).toBe(program.getSourceFile(this.getFilePath()));
    expect(this.compilerNode).toBe(hostSources.get(this.getFilePath()));
    sourceReadOrder.push(this.getFilePath());
    return readExports.call(this);
  });
  const bootstrapChecker = vi.spyOn(Program.prototype, "getTypeChecker").mockImplementation(() => {
    throw new Error("inventory facts hydrated the bootstrap Program checker");
  });
  try {
    const { partition } = extractWithoutReferenceWrappers({ root: scratch, descriptor, destination: join(scratch, "unused.sqlite") }, (service) => {
      const program = fixtureValue(service.getProgram());
      expect(program).toBe(referenceProgram);
      expect(program.getRootFileNames()).toEqual(referenceRoots);
      expect([...readCheckers]).toEqual([program.getTypeChecker()]);
      expect(program.getCompilerOptions()).toEqual(descriptor.commandLine.options);
      expect(fixtureValue(hostProgram).getRootFileNames()).toEqual(hostRoots);
      for (const [file, source] of hostSources) {
        expect(program.getSourceFile(file)).toBe(source);
        expect(fixtureValue(hostProgram).getSourceFile(file)).toBe(source);
      }
    });
    expect(bootstrapChecker).not.toHaveBeenCalled();
    expect(exports).toHaveBeenCalled();
    expect(types).toHaveBeenCalled();
    expect(partition.nativeRoots).toEqual(hostRoots);
    expect(partition.sources.map((source) => source.path)).toEqual([...hostSources.keys()]);
    expect(sourceReadOrder).toEqual([...hostSources.keys()]);
    expect(partition.compilerOptionsJson).toBe(JSON.stringify(descriptor.commandLine.options));
    expect(partition.witnesses).toHaveLength(1);
    expect(partition.witnesses[0]?.declarations).toEqual(
      partition.exports.find((entry) => entry.file === join(scratch, "base.ts") && entry.name === "value")?.declarations,
    );
    expect(partition.references.some((entry) => entry.reference.file === join(scratch, "consumer.ts"))).toBe(true);
  } finally {
    bootstrapChecker.mockRestore();
    sourceReads.mockRestore();
    types.mockRestore();
    exports.mockRestore();
    resolution.mockRestore();
  }
});

test("standalone source wrappers release when native fact extraction throws", ({ scratch }) => {
  writeFileSync(join(scratch, "tsconfig.json"), JSON.stringify({ files: ["base.ts"], compilerOptions: { noLib: true, types: [] } }));
  writeFileSync(join(scratch, "base.ts"), "export const value=1;\n");
  execFixtureGit(scratch, ["init", "-q"]);
  const descriptor = fixtureValue(readCompilerPrograms(scratch)[0]);
  const wrappers = new Set<Node>();
  const sources = new Map<SourceFile, ts.SourceFile>();
  const resolveDependencies = Project.prototype.resolveSourceFileDependencies;
  const resolution = vi.spyOn(Project.prototype, "resolveSourceFileDependencies").mockImplementation(function (this: Project) {
    const result = resolveDependencies.call(this);
    for (const source of this.getSourceFiles()) {
      sources.set(source, source.compilerNode);
    }
    return result;
  });
  const failure = new Error("native fact read failed");
  const exports = vi.spyOn(SourceFile.prototype, "getExportedDeclarations").mockImplementation(function (this: SourceFile) {
    wrappers.add(this);
    for (const statement of this.getStatements()) {
      wrappers.add(statement);
    }
    throw failure;
  });
  try {
    expect(() => extractInventoryPartition({ root: scratch, descriptor, destination: join(scratch, "unused.sqlite") })).toThrow(failure);
    expect(wrappers.size).toBeGreaterThan(1);
    expect([...wrappers].every((node) => node.wasForgotten())).toBe(true);
    for (const [source, native] of sources) {
      expect(source.wasForgotten()).toBe(false);
      expect(source.compilerNode).toBe(native);
    }
  } finally {
    exports.mockRestore();
    resolution.mockRestore();
  }
});

test("source and bootstrap wrappers release before native reference queries without losing cross-source declarations", ({ scratch }) => {
  writeFileSync(
    join(scratch, "tsconfig.json"),
    JSON.stringify({ files: ["barrel.ts", "consumer.ts"], compilerOptions: { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler" } }),
  );
  writeFileSync(join(scratch, "base.ts"), "export const value=1; export function read(){return value;}\n");
  writeFileSync(join(scratch, "barrel.ts"), "export {value, value as renamed, read} from './base';\n");
  writeFileSync(join(scratch, "consumer.ts"), "import {value,renamed,read} from './barrel'; export const result=value+renamed+read();\n");
  execFixtureGit(scratch, ["init", "-q"]);
  const descriptor = fixtureValue(readCompilerPrograms(scratch)[0]);
  const wrappers = new Set<Node>();
  const sources = new Set<SourceFile>();
  const hostSources = new Map<SourceFile, ts.SourceFile>();
  const declarationWrappers = new Map<string, Set<Node>>();
  let crossSourceDeclarations = 0;
  let bootstrap: Node | undefined;
  let identifiers = 0;
  let queries = 0;
  const resolveDependencies = Project.prototype.resolveSourceFileDependencies;
  const resolution = vi.spyOn(Project.prototype, "resolveSourceFileDependencies").mockImplementation(function (this: Project) {
    const result = resolveDependencies.call(this);
    for (const source of this.getSourceFiles()) {
      hostSources.set(source, source.compilerNode);
    }
    const declaration = this.getSourceFileOrThrow(join(scratch, "base.ts")).getVariableDeclarationOrThrow("value");
    bootstrap = declaration;
    wrappers.add(declaration);
    wrappers.add(declaration.getNameNode());
    return result;
  });
  const getSymbol = Node.prototype.getSymbol;
  const symbols = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
    if (Node.isIdentifier(this)) {
      identifiers++;
      wrappers.add(this);
    }
    return getSymbol.call(this);
  });
  const getParent = Node.prototype.getParent;
  const parents = vi.spyOn(Node.prototype, "getParent").mockImplementation(function (this: Node) {
    const parent = getParent.call(this);
    if (parent !== undefined && !Node.isSourceFile(parent)) {
      wrappers.add(parent);
    }
    return parent;
  });
  const getExports = SourceFile.prototype.getExportedDeclarations;
  const exports = vi.spyOn(SourceFile.prototype, "getExportedDeclarations").mockImplementation(function (this: SourceFile) {
    sources.add(this);
    const result = getExports.call(this);
    for (const declarations of result.values()) {
      for (const declaration of declarations) {
        if (Node.isSourceFile(declaration)) {
          continue;
        }
        wrappers.add(declaration);
        const key = JSON.stringify(span(declaration));
        const observed = declarationWrappers.get(key) ?? new Set<Node>();
        observed.add(declaration);
        declarationWrappers.set(key, observed);
        if (declaration.getSourceFile() !== this) {
          crossSourceDeclarations++;
        }
      }
    }
    return result;
  });
  try {
    const { partition } = extractWithoutReferenceWrappers({ root: scratch, descriptor, destination: join(scratch, "unused.sqlite") }, () => {
      queries++;
      expect(fixtureValue(bootstrap).wasForgotten()).toBe(true);
      expect(identifiers).toBeGreaterThan(0);
      expect(crossSourceDeclarations).toBeGreaterThan(0);
      expect([...declarationWrappers.values()].some((nodes) => nodes.size > 1)).toBe(true);
      expect([...wrappers].every((node) => node.wasForgotten())).toBe(true);
      expect([...sources].every((source) => source.wasForgotten())).toBe(true);
      for (const [source, native] of hostSources) {
        expect(source.wasForgotten()).toBe(false);
        expect(source.compilerNode).toBe(native);
      }
    });
    expect(queries).toBeGreaterThan(0);
    const origin = fixtureValue(partition.exports.find((entry) => entry.file === join(scratch, "base.ts") && entry.name === "value")?.declarations[0]);
    expect(
      partition.exports
        .filter((entry) => entry.file === join(scratch, "barrel.ts") && ["value", "renamed"].includes(entry.name))
        .map((entry) => entry.declarations),
    ).toEqual([[origin], [origin]]);
    const references = partition.references.filter((entry) => JSON.stringify(entry.declaration) === JSON.stringify(origin));
    expect(references.length).toBeGreaterThan(0);
    expect(references.some((entry) => entry.reference.file === join(scratch, "consumer.ts"))).toBe(true);
  } finally {
    exports.mockRestore();
    parents.mockRestore();
    symbols.mockRestore();
    resolution.mockRestore();
  }
});

test("native reference queries execute once without wrappers and preserve declaration and name facts", ({ scratch }) => {
  writeFileSync(join(scratch, ".gitignore"), ".cache/\n");
  writeFileSync(
    join(scratch, "tsconfig.json"),
    JSON.stringify({ files: ["base.ts", "consumer.ts"], compilerOptions: { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler" } }),
  );
  writeFileSync(
    join(scratch, "base.ts"),
    "export const alive=1; const local=alive; export function helper(parameter:number){ return parameter+local; } export default function(){return local; } export const {value: extracted}={value:alive};\n",
  );
  writeFileSync(join(scratch, "consumer.ts"), "import defaultFn,{alive as alias, helper} from './base'; export const read=alias+helper(1)+defaultFn();\n");
  execFixtureGit(scratch, ["init", "-q"]);
  const descriptor = fixtureValue(readCompilerPrograms(scratch)[0]);
  const { partition } = extractWithoutReferenceWrappers({ root: scratch, descriptor, destination: join(scratch, "unused.sqlite") });
  const native = fixtureValue(createSemanticWorkspace({ root: scratch }).program("tsconfig.json"));
  const base = fixtureValue(native.sourceFile("base.ts"));
  const consumer = fixtureValue(native.sourceFile("consumer.ts"));
  const declarations = [
    base.getVariableDeclarationOrThrow("alive"),
    base.getVariableDeclarationOrThrow("local"),
    base.getFunctionOrThrow("helper"),
    base.getFunctionOrThrow("helper").getParameters()[0],
    base.getFunctions().find((declaration) => declaration.isDefaultExport()),
    base.getDescendantsOfKind(SyntaxKind.BindingElement).find((node) => node.getText() === "value: extracted"),
  ];
  for (const candidate of declarations) {
    const declaration = fixtureValue(candidate);
    const nodes: Node[] = [declaration];
    const name = Node.hasName(declaration) ? declaration.getNameNode() : undefined;
    if (name !== undefined && Node.isReferenceFindable(name)) {
      nodes.push(name);
    }
    for (const node of nodes) {
      if (!Node.isReferenceFindable(node)) {
        throw new Error("native parity fixture reference node missing");
      }
      const expected = node.findReferencesAsNodes().map(span);
      const stored = partition.references.filter((entry) => JSON.stringify(entry.declaration) === JSON.stringify(span(node))).map((entry) => entry.reference);
      expect(stored).toEqual(expected);
    }
  }
  const alias = fixtureValue(consumer.getImportDeclarationOrThrow("./base").getNamedImports()[0]?.getAliasNode());
  const symbol = alias.getSymbol();
  expect(partition.bindings.find((entry) => JSON.stringify(entry.node) === JSON.stringify(span(alias)))?.symbols).toEqual({
    lexical: (symbol?.getDeclarations() ?? []).map(span),
    origins: (symbol?.getAliasedSymbol()?.getDeclarations() ?? []).map(span),
  });
});

test("native reference span order survives aliases, namespaces, type and value uses, and token references", ({ scratch }) => {
  writeFileSync(join(scratch, ".gitignore"), ".cache/\n");
  writeFileSync(
    join(scratch, "tsconfig.json"),
    JSON.stringify({
      files: ["base.ts", "named.ts", "barrel.ts", "consumer.ts"],
      compilerOptions: { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler" },
    }),
  );
  writeFileSync(
    join(scratch, "base.ts"),
    [
      "export const alive=1;",
      "export class Thing { value=alive; }",
      "export interface Shape { 'tag': number }",
      "export namespace Group { export const value=alive; }",
      "export const {value: extracted}={value:alive};",
      "export default function(){return extracted;}",
    ].join("\n"),
  );
  writeFileSync(join(scratch, "named.ts"), "export default function named(){return 1;}\n");
  writeFileSync(join(scratch, "barrel.ts"), "export {alive as renamed, alive as 'alive-name', Thing, Shape, Group, extracted} from './base';\n");
  writeFileSync(
    join(scratch, "consumer.ts"),
    [
      "import defaultFn,{alive} from './base';",
      "import named from './named';",
      "import {renamed as alias, 'alive-name' as quoted, Thing, type Shape, Group, extracted} from './barrel';",
      "import * as namespace from './base';",
      "/** {@link alive} */",
      "export const object={alive};",
      "export const instance:Thing=new Thing();",
      "export const shape:Shape={tag:alive};",
      "export const read=alias+quoted+namespace.alive+Group.value+extracted+shape['tag']+shape.tag+defaultFn()+named();",
    ].join("\n"),
  );
  execFixtureGit(scratch, ["init", "-q"]);
  const descriptor = fixtureValue(readCompilerPrograms(scratch)[0]);
  const { partition, queries } = extractWithoutReferenceWrappers({ root: scratch, descriptor, destination: join(scratch, "unused.sqlite") });
  const native = fixtureValue(createSemanticWorkspace({ root: scratch }).program("tsconfig.json"));
  const declarations = new Map(partition.references.map(({ declaration }) => [JSON.stringify(declaration), declaration]));
  for (const [key, declaration] of declarations) {
    const sf = fixtureValue(native.sourceFile(declaration.file));
    const leaf = fixtureValue(sf.getDescendantAtPos(declaration.start));
    const node = fixtureValue([sf, leaf, ...leaf.getAncestors()].find((candidate) => JSON.stringify(span(candidate)) === key));
    if (!Node.isReferenceFindable(node)) {
      throw new Error("stored reference declaration is not native reference-findable");
    }
    expect(partition.references.filter((entry) => JSON.stringify(entry.declaration) === key).map((entry) => entry.reference)).toEqual(
      node.findReferencesAsNodes().map(span),
    );
  }
  const base = fixtureValue(native.sourceFile("base.ts"));
  const consumer = fixtureValue(native.sourceFile("consumer.ts"));
  const alive = base.getVariableDeclarationOrThrow("alive");
  const aliveReferences = partition.references.filter((entry) => JSON.stringify(entry.declaration) === JSON.stringify(span(alive)));
  expect(aliveReferences.map(({ reference }) => reference)).toEqual(alive.findReferencesAsNodes().map(span));
  expect(
    aliveReferences.some(({ reference }) => reference.file === consumer.getFilePath() && reference.start === consumer.getFullText().indexOf("alive} */")),
  ).toBe(true);
  const property = fixtureValue(base.getInterfaceOrThrow("Shape").getProperties()[0]);
  expect(partition.references.filter((entry) => JSON.stringify(entry.declaration) === JSON.stringify(span(property))).map((entry) => entry.reference)).toEqual(
    property.findReferencesAsNodes().map(span),
  );
  expect(property.findReferencesAsNodes().some(Node.isStringLiteral)).toBe(true);
  const imported = consumer.getImportDeclarationOrThrow("./base");
  expect(partition.modules.find((entry) => JSON.stringify(entry.node) === JSON.stringify(span(imported)))?.target).toBe(base.getFilePath());
  expect(queries).toContain(JSON.stringify([base.getFilePath(), base.getFunctions()[0]?.getDefaultKeywordOrThrow().getStart()]));
});

test("many aliases preserve every native reference without retaining wrapper results", ({ scratch }) => {
  const aliases = Array.from({ length: 48 }, (_, index) => `alias${String(index)}`);
  writeFileSync(
    join(scratch, "tsconfig.json"),
    JSON.stringify({ files: ["base.ts", "consumer.ts"], compilerOptions: { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler" } }),
  );
  writeFileSync(join(scratch, "base.ts"), "export const value=1;\n");
  writeFileSync(
    join(scratch, "consumer.ts"),
    `${aliases.map((name) => `import {value as ${name}} from './base';`).join("\n")}\nexport const uses=[${aliases.join(",")}];\n`,
  );
  execFixtureGit(scratch, ["init", "-q"]);
  const descriptor = fixtureValue(readCompilerPrograms(scratch)[0]);
  const { partition } = extractWithoutReferenceWrappers({ root: scratch, descriptor, destination: join(scratch, "unused.sqlite") });
  const native = fixtureValue(createSemanticWorkspace({ root: scratch }).program("tsconfig.json"));
  const consumer = fixtureValue(native.sourceFile("consumer.ts"));
  const value = fixtureValue(native.sourceFile("base.ts")).getVariableDeclarationOrThrow("value");
  const expected = value.findReferencesAsNodes().map(span);
  expect(expected.length).toBeGreaterThan(aliases.length);
  expect(partition.references.filter((entry) => JSON.stringify(entry.declaration) === JSON.stringify(span(value))).map((entry) => entry.reference)).toEqual(
    expected,
  );
  const imports = consumer.getImportDeclarations().flatMap((declaration) => declaration.getNamedImports());
  expect(imports).toHaveLength(aliases.length);
  for (const declaration of imports) {
    const alias = fixtureValue(declaration.getAliasNode());
    const binding = fixtureValue(partition.bindings.find((entry) => JSON.stringify(entry.node) === JSON.stringify(span(alias))));
    expect(binding.symbols.origins).toEqual([span(value)]);
  }
});

test("native reference projection retains an enclosing width-match instead of an exact identifier span", ({ scratch }) => {
  writeFileSync(
    join(scratch, "tsconfig.json"),
    JSON.stringify({ files: ["base.ts"], compilerOptions: { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler" } }),
  );
  writeFileSync(join(scratch, "base.ts"), "export const foo=1;\nconst x=foo + 1111111111111111111111111;\n");
  execFixtureGit(scratch, ["init", "-q"]);
  const descriptor = fixtureValue(readCompilerPrograms(scratch)[0]);
  const { partition } = extractWithoutReferenceWrappers({ root: scratch, descriptor, destination: join(scratch, "unused.sqlite") });
  const native = fixtureValue(createSemanticWorkspace({ root: scratch }).program("tsconfig.json"));
  const base = fixtureValue(native.sourceFile("base.ts"));
  const foo = base.getVariableDeclarationOrThrow("foo");
  const expression = base.getVariableDeclarationOrThrow("x").getInitializerOrThrow();
  expect(Node.isBinaryExpression(expression)).toBe(true);
  const expected = foo.findReferencesAsNodes().map(span);
  expect(expected).toEqual([span(expression)]);
  for (const declaration of [foo, foo.getNameNode()]) {
    expect(
      partition.references.filter((entry) => JSON.stringify(entry.declaration) === JSON.stringify(span(declaration))).map((entry) => entry.reference),
    ).toEqual(expected);
  }
});

test("identical physical spans share one extraction-local payload across facts and native reference queries", ({ scratch }) => {
  writeFileSync(
    join(scratch, "tsconfig.json"),
    JSON.stringify({ files: ["consumer.ts"], compilerOptions: { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler" } }),
  );
  writeFileSync(join(scratch, "base.ts"), "export const value=1; export interface Shape {value:number}\n");
  writeFileSync(join(scratch, "barrel.ts"), "export {value,value as renamed,type Shape} from './base';\n");
  writeFileSync(
    join(scratch, "consumer.ts"),
    "import {value,renamed,type Shape} from './barrel'; export const use:Shape={value:renamed+value}; export const witness='value' satisfies keyof typeof import('./base'); export const later=import('./base').then(m=>m.value);\n",
  );
  execFixtureGit(scratch, ["init", "-q"]);
  const descriptor = fixtureValue(readCompilerPrograms(scratch)[0]);
  const request = { root: scratch, descriptor, destination: join(scratch, "unused.sqlite") };
  const { partition, queries } = extractWithoutReferenceWrappers(request);
  const spans = [
    ...partition.exports.flatMap((entry) => entry.declarations),
    ...partition.modules.flatMap((entry) => [entry.node, ...entry.declarations]),
    ...partition.bindings.flatMap((entry) => [entry.node, ...entry.symbols.lexical, ...entry.symbols.origins]),
    ...partition.witnesses.flatMap((entry) => [entry.node, ...entry.declarations]),
    ...partition.references.flatMap((entry) => [entry.declaration, entry.reference]),
  ];
  const physical = new Map<string, InventorySpan>();
  for (const current of spans) {
    const key = JSON.stringify(current);
    const existing = physical.get(key) ?? current;
    expect(current).toBe(existing);
    expect(Object.isFrozen(current)).toBe(true);
    physical.set(key, existing);
  }
  expect(spans.length - physical.size).toBeGreaterThan(physical.size);
  const again = extractWithoutReferenceWrappers(request);
  expect(again.queries).toEqual(queries);
  expect(again.partition).toEqual(partition);
  const origin = fixtureValue(partition.exports.find((entry) => entry.name === "value")?.declarations[0]);
  const nextOrigin = fixtureValue(again.partition.exports.find((entry) => entry.name === "value")?.declarations[0]);
  expect(nextOrigin).not.toBe(origin);
});

test("physical span reuse observes symlink retargeting and changed bytes between extractions", ({ scratch }) => {
  writeFileSync(join(scratch, "tsconfig.json"), JSON.stringify({ files: ["link.ts"], compilerOptions: { noLib: true, types: [] } }));
  writeFileSync(join(scratch, "first.ts"), "export const first=1; export const use=first;\n");
  writeFileSync(join(scratch, "second.ts"), "export const second=2; export const use=second;\n");
  symlinkSync("first.ts", join(scratch, "link.ts"));
  execFixtureGit(scratch, ["init", "-q"]);
  const descriptor = fixtureValue(readCompilerPrograms(scratch)[0]);
  const request = { root: scratch, descriptor, destination: join(scratch, "unused.sqlite") };
  const { partition: first } = extractWithoutReferenceWrappers(request);
  const original = JSON.stringify(first);
  expect(first.exports.find((entry) => entry.name === "first")?.file).toBe(join(scratch, "first.ts"));
  expect(inputsCurrent(first.inputs, { authored: inventoryAuthoredFiles(scratch) })).toBe(true);
  unlinkSync(join(scratch, "link.ts"));
  symlinkSync("second.ts", join(scratch, "link.ts"));
  expect(inputsCurrent(first.inputs, { authored: inventoryAuthoredFiles(scratch) })).toBe(false);
  const { partition: second } = extractWithoutReferenceWrappers(request);
  expect(second.exports.find((entry) => entry.name === "second")?.file).toBe(join(scratch, "second.ts"));
  expect(second.exports.some((entry) => entry.name === "first")).toBe(false);
  expect(inputsCurrent(second.inputs, { authored: inventoryAuthoredFiles(scratch) })).toBe(true);
  writeFileSync(join(scratch, "second.ts"), "export const changed=3; export const use=changed;\n");
  expect(inputsCurrent(second.inputs, { authored: inventoryAuthoredFiles(scratch) })).toBe(false);
  const { partition: changed } = extractWithoutReferenceWrappers(request);
  expect(changed.exports.find((entry) => entry.name === "changed")?.file).toBe(join(scratch, "second.ts"));
  expect(changed.exports.some((entry) => entry.name === "second")).toBe(false);
  expect(inputsCurrent(changed.inputs, { authored: inventoryAuthoredFiles(scratch) })).toBe(true);
  expect(JSON.stringify(first)).toBe(original);
});

test("physical filename resolution is bounded by distinct paths rather than repeated native spans", async ({ scratch }) => {
  writeFileSync(
    join(scratch, "tsconfig.json"),
    JSON.stringify({ files: ["consumer.ts"], compilerOptions: { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler" } }),
  );
  writeFileSync(join(scratch, "base.ts"), "export const value=1; export interface Shape {value:number}\n");
  writeFileSync(join(scratch, "consumer.ts"), "import {value,type Shape} from './base'; export const use:Shape={value:value+value};\n");
  writeFileSync(join(scratch, "unloaded.txt"), "This authored path is never read by the native compiler.\n");
  execFixtureGit(scratch, ["init", "-q"]);
  const descriptor = fixtureValue(readCompilerPrograms(scratch)[0]);
  const inventoryInputs = await import("@orb/tooling/floor/code-facts/semantic-inventory-inputs");
  const canonical = vi.spyOn(inventoryInputs, "canonicalInventoryPath");
  try {
    const partition = extractInventoryPartition({ root: scratch, descriptor, destination: join(scratch, "unused.sqlite") });
    expect(partition.bindings.length).toBeGreaterThan(5);
    expect(partition.references.length).toBeGreaterThan(5);
    expect(canonical).toHaveBeenCalled();
    const paths = canonical.mock.calls.map(([path]) => path);
    for (const path of new Set(paths)) {
      expect(paths.filter((candidate) => candidate === path).length, path).toBeLessThanOrEqual(2);
      if (path === join(scratch, "unloaded.txt")) {
        continue;
      }
      expect(
        partition.inputs.some((input) => input.path === path),
        path,
      ).toBe(true);
    }
    expect(partition.inputs.some((input) => input.path === join(scratch, "unloaded.txt"))).toBe(false);
    expect(inputsCurrent(partition.inputs, { authored: inventoryAuthoredFiles(scratch) })).toBe(true);
  } finally {
    canonical.mockRestore();
  }
});

test.for(NATIVE_QUERY_MUTATIONS)(
  "instrumented native queries refuse physical identity drift without replacing the pinned generation: %s",
  { timeout: scaledBudget(240_000) },
  (change, { scratch, repoRoot }) => {
    const authoredAlias = change === "authored-alias-retarget";
    writeFileSync(join(scratch, ".gitignore"), `.cache/\nmissing.ts\n${authoredAlias ? "first/\nsecond/\n" : ""}`);
    writeFileSync(
      join(scratch, "tsconfig.json"),
      JSON.stringify({
        files: ["consumer.ts"],
        compilerOptions: { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler", preserveSymlinks: true },
      }),
    );
    for (const directory of ["first", "second"]) {
      mkdirSync(join(scratch, directory));
      writeFileSync(join(scratch, directory, "dep.ts"), "export const value=1; export const use=value;\n");
    }
    const directoryLink = change === "directory-retarget";
    let linkName = directoryLink ? "linked" : "dep.ts";
    let stem = directoryLink ? "linked/dep" : "dep";
    if (change === "appear") {
      stem = "missing";
    }
    if (authoredAlias) {
      linkName = "authored-alias.txt";
      stem = "first/dep";
    }
    const link = join(scratch, linkName);
    symlinkSync(directoryLink ? "first" : "first/dep.ts", link);
    const specifier = `./${stem}`;
    const dependency = authoredAlias ? link : join(scratch, `${stem}.ts`);
    const text = `import {value} from '${specifier}'; export const read=value;\n`;
    writeFileSync(join(scratch, "consumer.ts"), text);
    execFixtureGit(scratch, ["init", "-q"]);
    const implementation = copyNativeInventoryImplementation(join(scratch, ".cache"), repoRoot);
    instrumentNativeQueryWorker(implementation, scratch, change);
    const result = nativeInputCase(change, implementation, scratch);
    expect(JSON.parse(result)).toMatchObject({
      refusal: expect.stringContaining(change === "dangling" ? "repository inventory symlink cannot be resolved: dep.ts" : "inputs changed during extraction"),
      inputRefusal: expect.stringContaining(
        change === "dangling" ? "repository inventory symlink cannot be resolved: dep.ts" : "recorded native dependency changed",
      ),
      workerStages: 1,
      mutation: { changed: true },
      latestUnchanged: true,
      pinnedText: text,
    });
    const captured = z.object({ captured: z.array(inputSchema), firstIdentity: z.string() }).parse(JSON.parse(result));
    expect(captured.captured.find((input) => input.path === join(scratch, "first/dep.ts") && input.kind === "authored")?.version).toBe(
      change === "appear" ? undefined : "true",
    );
    expect(captured.captured.find((input) => input.path === dependency && input.kind === "exists")).toEqual(
      authoredAlias ? undefined : { path: dependency, kind: "exists", version: captured.firstIdentity },
    );
  },
);

test("readonly native reference pass reuses only the complete invariant import scan", () => {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { noLib: true, types: [], module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler },
  });
  const base = project.createSourceFile("/base.ts", "export const first=1; export const second=2;\n");
  project.createSourceFile("/consumer.ts", "import {first,second} from './base'; export const use=first+second;\n");
  project.createSourceFile("/unrelated-base.ts", "export const untouched=3;\n");
  project.createSourceFile("/unrelated.ts", "import {untouched} from './unrelated-base'; export const other=untouched;\n");
  const service = project.getLanguageService().compilerObject;
  const program = fixtureValue(service.getProgram());
  const checker = program.getTypeChecker();
  const unrelated = fixtureValue(program.getSourceFile("/unrelated.ts"));
  const declaration = fixtureValue(unrelated.statements.find(ts.isImportDeclaration));
  const getSymbol = checker.getSymbolAtLocation.bind(checker);
  let importScans = 0;
  const lookup = vi.spyOn(checker, "getSymbolAtLocation").mockImplementation((node) => {
    if (node === declaration.moduleSpecifier) {
      importScans++;
    }
    return getSymbol(node);
  });
  const pass = service.createReadonlyReferencePass();
  try {
    const first = pass.findReferences(base.getFilePath(), base.getFullText().indexOf("first"));
    const second = pass.findReferences(base.getFilePath(), base.getFullText().indexOf("second"));
    expect(first?.flatMap((group) => group.references).some((reference) => reference.fileName === "/consumer.ts")).toBe(true);
    expect(second?.flatMap((group) => group.references).some((reference) => reference.fileName === "/consumer.ts")).toBe(true);
    expect(importScans).toBe(1);
    importScans = 0;
    expect(service.findReferences(base.getFilePath(), base.getFullText().indexOf("first"))).toEqual(first);
    expect(service.findReferences(base.getFilePath(), base.getFullText().indexOf("second"))).toEqual(second);
    expect(importScans).toBe(2);
  } finally {
    pass.dispose();
    lookup.mockRestore();
    service.dispose();
  }
});

function nativeReferenceFixture(mode: ts.LanguageServiceMode = ts.LanguageServiceMode.Semantic): {
  service: ts.LanguageService;
  cancel: (value: boolean) => void;
  update: (file: string, text: string) => void;
  reverseRoots: () => void;
  strict: () => void;
} {
  const files = new Map([
    ["/base.ts", "export const first=1; export const second=2;\n"],
    ["/consumer.ts", "import {first,second} from './base'; export const use=first+second;\n"],
    ["/unrelated-base.ts", "export const untouched=3;\n"],
    ["/unrelated.ts", "import {untouched} from './unrelated-base'; export const other=untouched;\n"],
  ]);
  let version = 0;
  let cancelled = false;
  let reversed = false;
  let options: ts.CompilerOptions = { noLib: true, types: [], module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler };
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => options,
    getCurrentDirectory: () => "/",
    getDefaultLibFileName: () => "/lib.d.ts",
    getProjectVersion: () => String(version),
    getScriptFileNames: () => (reversed ? [...files.keys()].toReversed() : [...files.keys()]),
    getScriptVersion: () => String(version),
    getScriptSnapshot: (file) => {
      const text = files.get(file);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    readFile: (file) => files.get(file),
    fileExists: (file) => files.has(file),
    getCancellationToken: () => ({ isCancellationRequested: () => cancelled }),
  };
  return {
    service: ts.createLanguageService(host, undefined, mode),
    cancel: (value): void => {
      cancelled = value;
    },
    update: (file, text): void => {
      files.set(file, text);
      version++;
    },
    reverseRoots: (): void => {
      reversed = !reversed;
      version++;
    },
    strict: (): void => {
      options = { ...options, strict: true };
      version++;
    },
  };
}

test("readonly native results avoid repeated computation without sharing mutable answers", () => {
  const { service } = nativeReferenceFixture();
  const source = fixtureValue(service.getProgram()?.getSourceFile("/base.ts"));
  const position = source.text.indexOf("first");
  const oracle = fixtureValue(service.findReferences(source.fileName, position));
  const pass = service.createReadonlyReferencePass();
  const lookup = vi.spyOn(source, "getChildren");
  try {
    const miss = fixtureValue(pass.findReferences(source.fileName, position));
    expect(miss).toStrictEqual(oracle);
    expect(lookup.mock.calls.length).toBeGreaterThan(0);
    const definition = fixtureValue(miss[0]).definition;
    definition.textSpan.start++;
    definition.name = "caller mutation";
    definition.displayParts.push({ text: "caller mutation", kind: "text" });
    const reference = fixtureValue(fixtureValue(miss[0]).references[0]);
    reference.textSpan.length++;
    reference.isDefinition = reference.isDefinition !== true;
    reference.isWriteAccess = !reference.isWriteAccess;
    reference.isInString = true;
    const context = fixtureValue(definition.contextSpan);
    context.start++;
    fixtureValue(definition.displayParts[0]).text = "caller mutation";
    fixtureValue(miss[0]).references.reverse();
    miss.reverse();
    lookup.mockClear();
    const hit = fixtureValue(pass.findReferences(source.fileName, position, { includeDefinitionDisplay: true }));
    expect(hit).toStrictEqual(oracle);
    expect(lookup.mock.calls.length).toBe(0);
    fixtureValue(hit[0]).references.length = 0;
    fixtureValue(hit[0]).definition.displayParts.length = 0;
    hit.length = 0;
    expect(pass.findReferences(source.fileName, position)).toStrictEqual(oracle);
    lookup.mockClear();
    expect(service.findReferences(source.fileName, position)).toStrictEqual(oracle);
    expect(lookup.mock.calls.length).toBeGreaterThan(0);
  } finally {
    lookup.mockRestore();
    pass.dispose();
    service.dispose();
  }
});

test("readonly native result keys preserve source, position and normalized presentation", () => {
  const { service } = nativeReferenceFixture();
  const source = fixtureValue(service.getProgram()?.getSourceFile("/base.ts"));
  const first = source.text.indexOf("first");
  const second = source.text.indexOf("second");
  const rich = service.findReferences(source.fileName, first);
  const lean = service.findReferences(source.fileName, first, { includeDefinitionDisplay: false });
  expect(rich).not.toEqual(lean);
  const pass = service.createReadonlyReferencePass();
  const lookup = vi.spyOn(source, "getChildren");
  try {
    expect(pass.findReferences(source.fileName, first)).toEqual(rich);
    lookup.mockClear();
    expect(pass.findReferences(source.fileName, first, { includeDefinitionDisplay: false })).toEqual(lean);
    expect(lookup.mock.calls.length).toBeGreaterThan(0);
    lookup.mockClear();
    expect(pass.findReferences(source.fileName, first, { includeDefinitionDisplay: true })).toEqual(rich);
    expect(pass.findReferences(source.fileName, first, { includeDefinitionDisplay: false })).toEqual(lean);
    expect(lookup.mock.calls.length).toBe(0);
    expect(pass.findReferences(source.fileName, second)).toEqual(service.findReferences(source.fileName, second));
    expect(pass.findReferences("/consumer.ts", first)).toEqual(service.findReferences("/consumer.ts", first));
    expect(() => pass.findReferences("/missing.ts", first)).toThrow();
  } finally {
    lookup.mockRestore();
    pass.dispose();
    service.dispose();
  }
});

test("readonly native undefined results consume bounded entries and saturation remains native", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  project.createSourceFile("/empty.ts", " ".repeat(4097));
  const service = project.getLanguageService().compilerObject;
  const source = fixtureValue(service.getProgram()?.getSourceFile("/empty.ts"));
  const pass = service.createReadonlyReferencePass();
  const lookup = vi.spyOn(source, "getChildren");
  try {
    for (let position = 0; position < 4097; position++) {
      expect(pass.findReferences(source.fileName, position)).toBeUndefined();
    }
    lookup.mockClear();
    expect(pass.findReferences(source.fileName, 0)).toBeUndefined();
    expect(lookup.mock.calls.length).toBe(0);
    expect(pass.findReferences(source.fileName, 4096)).toBeUndefined();
    expect(lookup.mock.calls.length).toBeGreaterThan(0);
    lookup.mockClear();
    expect(service.findReferences(source.fileName, 0)).toBeUndefined();
    expect(lookup.mock.calls.length).toBeGreaterThan(0);
  } finally {
    lookup.mockRestore();
    pass.dispose();
    service.dispose();
  }
});

test("readonly native results retain repeated physical-path strings once without losing later small answers", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const file = join(process.cwd(), "packages/server/src/domain/chat/engine/engine.ts");
  project.createSourceFile(
    file,
    Array.from({ length: 1800 }, (_, index) => `export const value${index}=1; export const use${index}=value${index};`).join("\n"),
  );
  const service = project.getLanguageService().compilerObject;
  const source = fixtureValue(service.getProgram()?.getSourceFile(file));
  const positions = source.statements.flatMap((statement) =>
    ts.isVariableStatement(statement)
      ? statement.declarationList.declarations
          .filter((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text.startsWith("value"))
          .map((declaration) => declaration.name.getStart(source))
      : [],
  );
  const options = { includeDefinitionDisplay: false };
  const expected = positions.map((position) => service.findReferences(file, position, options));
  const pass = service.createReadonlyReferencePass();
  const traversal = vi.spyOn(source, "getChildren");
  try {
    for (const [index, position] of positions.entries()) {
      expect(pass.findReferences(file, position, options)).toStrictEqual(expected[index]);
    }
    traversal.mockClear();
    expect(pass.findReferences(file, fixtureValue(positions.at(-1)), options)).toStrictEqual(expected.at(-1));
    expect(traversal.mock.calls.length).toBe(0);
  } finally {
    traversal.mockRestore();
    pass.dispose();
    service.dispose();
  }
});

test("readonly native string ownership detaches admissions and only copies mutable containers on hits", () => {
  const { service } = nativeReferenceFixture();
  const source = fixtureValue(service.getProgram()?.getSourceFile("/base.ts"));
  const position = source.text.indexOf("first");
  const pass = service.createReadonlyReferencePass();
  const copy = vi.spyOn(globalThis, "structuredClone");
  try {
    const miss = pass.findReferences(source.fileName, position);
    const detachments = copy.mock.calls.length;
    expect(detachments).toBeGreaterThan(0);
    expect(copy.mock.calls.every(([value]) => typeof value === "string")).toBe(true);
    expect(new Set(copy.mock.calls.map(([value]) => value)).size).toBe(detachments);
    const hit = pass.findReferences(source.fileName, position);
    expect(hit).toStrictEqual(miss);
    expect(hit).not.toBe(miss);
    expect(copy.mock.calls.length).toBe(detachments);
  } finally {
    copy.mockRestore();
    pass.dispose();
    service.dispose();
  }
});

test("readonly native string admission is atomic and distinct strings still exhaust the unchanged allowance", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const files = ["a", "b"].map((letter) => `/${letter.repeat(600_000)}.ts`);
  for (const file of files) {
    project.createSourceFile(file, "export const value=1; export const use=value;");
  }
  const service = project.getLanguageService().compilerObject;
  const first = fixtureValue(service.getProgram()?.getSourceFile(fixtureValue(files[0])));
  const second = fixtureValue(service.getProgram()?.getSourceFile(fixtureValue(files[1])));
  const position = first.text.indexOf("value");
  const options = { includeDefinitionDisplay: false };
  const expected = contentVersion(JSON.stringify(fixtureValue(service.findReferences(second.fileName, position, options))));
  const pass = service.createReadonlyReferencePass();
  const secondTraversal = vi.spyOn(second, "getChildren");
  const firstTraversal = vi.spyOn(first, "getChildren");
  const failure = new Error("private native clone failed");
  const copy = vi.spyOn(globalThis, "structuredClone").mockImplementationOnce(() => {
    throw failure;
  });
  try {
    expect(() => pass.findReferences(first.fileName, position, options)).toThrow(failure);
    expect(contentVersion(JSON.stringify(fixtureValue(pass.findReferences(second.fileName, position, options))))).toBe(expected);
    const completedDetachments = copy.mock.calls.length;
    expect(completedDetachments).toBeGreaterThan(1);
    secondTraversal.mockClear();
    expect(contentVersion(JSON.stringify(fixtureValue(pass.findReferences(second.fileName, position, options))))).toBe(expected);
    expect(secondTraversal.mock.calls.length).toBe(0);
    firstTraversal.mockClear();
    expect(pass.findReferences(first.fileName, position, options)?.length).toBe(1);
    firstTraversal.mockClear();
    expect(pass.findReferences(first.fileName, position, options)?.length).toBe(1);
    expect(firstTraversal.mock.calls.length).toBeGreaterThan(0);
    expect(copy.mock.calls.length).toBe(completedDetachments);
  } finally {
    copy.mockRestore();
    firstTraversal.mockRestore();
    secondTraversal.mockRestore();
    pass.dispose();
    service.dispose();
  }
});

test("readonly native result admission bounds the aggregate of individually small answers", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  project.createSourceFile("/a.ts", `export interface T{${Array.from({ length: 4095 }, (_, index) => `p${index}:number;`).join("")}}`);
  const service = project.getLanguageService().compilerObject;
  const source = fixtureValue(service.getProgram()?.getSourceFile("/a.ts"));
  const declaration = fixtureValue(source.statements.find(ts.isInterfaceDeclaration));
  const positions = declaration.members.map((member) => fixtureValue(member.name).getStart(source));
  const first = fixtureValue(positions[0]);
  const last = fixtureValue(positions.at(-1));
  const options = { includeDefinitionDisplay: false };
  const expected = service.findReferences(source.fileName, last, options);
  const pass = service.createReadonlyReferencePass();
  const lookup = vi.spyOn(source, "getChildren");
  try {
    for (const position of positions) {
      expect(pass.findReferences(source.fileName, position, options)?.length).toBe(1);
    }
    lookup.mockClear();
    expect(pass.findReferences(source.fileName, first, options)?.length).toBe(1);
    expect(lookup.mock.calls.length).toBe(0);
    expect(pass.findReferences(source.fileName, last, options)).toStrictEqual(expected);
    expect(lookup.mock.calls.length).toBeGreaterThan(0);
  } finally {
    lookup.mockRestore();
    pass.dispose();
    service.dispose();
  }
});

test.for(["objects", "strings"] as const)("readonly native result %s saturation preserves complete native fallback", { timeout: 20_000 }, (dimension) => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  project.createSourceFile("/base.ts", "export const value=1;");
  const files = dimension === "objects" ? 180 : 1;
  for (let index = 0; index < files; index++) {
    const name = dimension === "strings" ? "x".repeat(1_048_577) : `consumer${index}`;
    project.createSourceFile(
      `/${name}.ts`,
      `import {value} from './base'; export const uses=[${Array.from({ length: dimension === "objects" ? 100 : 300 }, () => "value").join(",")}];`,
    );
  }
  const service = project.getLanguageService().compilerObject;
  const source = fixtureValue(service.getProgram()?.getSourceFile("/base.ts"));
  const position = source.text.indexOf("value");
  const options = { includeDefinitionDisplay: false };
  const expected = fixtureValue(service.findReferences(source.fileName, position, options));
  expect(expected.flatMap((group) => group.references).length).toBeGreaterThan(dimension === "objects" ? 18_000 : 300);
  const pass = service.createReadonlyReferencePass();
  const lookup = vi.spyOn(source, "getChildren");
  try {
    expect(pass.findReferences(source.fileName, position, options)).toEqual(expected);
    lookup.mockClear();
    expect(pass.findReferences(source.fileName, position, options)).toEqual(expected);
    expect(lookup.mock.calls.length).toBeGreaterThan(0);
  } finally {
    lookup.mockRestore();
    pass.dispose();
    service.dispose();
  }
});

test("cancelled native import-map construction never survives into a later query", () => {
  const fixture = nativeReferenceFixture();
  const service = fixture.service;
  const program = fixtureValue(service.getProgram());
  const checker = program.getTypeChecker();
  const consumer = fixtureValue(program.getSourceFile("/consumer.ts"));
  const trigger = fixtureValue(consumer.statements.find(ts.isImportDeclaration)).moduleSpecifier;
  const unrelated = fixtureValue(program.getSourceFile("/unrelated.ts"));
  const sentinel = fixtureValue(unrelated.statements.find(ts.isImportDeclaration)).moduleSpecifier;
  const getSymbol = checker.getSymbolAtLocation.bind(checker);
  let armed = true;
  let completedScans = 0;
  let firstImports = 0;
  const lookup = vi.spyOn(checker, "getSymbolAtLocation").mockImplementation((node) => {
    if (node === trigger) {
      firstImports++;
      if (armed) {
        armed = false;
        fixture.cancel(true);
      }
    }
    if (node === sentinel) {
      completedScans++;
    }
    return getSymbol(node);
  });
  const pass = service.createReadonlyReferencePass();
  const position = fixtureValue(program.getSourceFile("/base.ts")).text.indexOf("first");
  try {
    expect(() => pass.findReferences("/base.ts", position)).toThrow(ts.OperationCanceledException);
    expect(firstImports).toBe(1);
    expect(completedScans).toBe(0);
    fixture.cancel(false);
    const recovered = pass.findReferences("/base.ts", position);
    expect(firstImports).toBe(2);
    expect(completedScans).toBe(1);
    fixture.cancel(true);
    expect(() => pass.findReferences("/base.ts", position)).toThrow(ts.OperationCanceledException);
    fixture.cancel(false);
    expect(pass.findReferences("/base.ts", position)).toEqual(recovered);
    expect(completedScans).toBe(1);
    expect(service.findReferences("/base.ts", position)).toEqual(recovered);
  } finally {
    lookup.mockRestore();
    pass.dispose();
    service.dispose();
  }
});

test.for(["text", "roots", "order", "options"] as const)("readonly reference passes refuse changed native snapshots: %s", (change) => {
  const fixture = nativeReferenceFixture();
  const service = fixture.service;
  const program = fixtureValue(service.getProgram());
  const position = fixtureValue(program.getSourceFile("/base.ts")).text.indexOf("first");
  const pass = service.createReadonlyReferencePass();
  try {
    expect(pass.findReferences("/base.ts", position)).toEqual(service.findReferences("/base.ts", position));
    if (change === "text") {
      fixture.update("/consumer.ts", "import {second} from './base'; export const use=second;\n");
    } else if (change === "roots") {
      fixture.update("/added.ts", "import {first} from './base'; export const added=first;\n");
    } else if (change === "order") {
      fixture.reverseRoots();
    } else {
      fixture.strict();
    }
    expect(() => pass.findReferences("/base.ts", position)).toThrow("invalidated");
    expect(service.getProgram()).not.toBe(program);
    expect(() => pass.findReferences("/base.ts", position)).toThrow("disposed");
    const fresh = service.createReadonlyReferencePass();
    try {
      const expected = service.findReferences("/base.ts", position);
      expect(fresh.findReferences("/base.ts", position)).toEqual(expected);
      expect(expected?.some((group) => group.references.some((reference) => reference.fileName === "/added.ts"))).toBe(change === "roots");
    } finally {
      fresh.dispose();
    }
  } finally {
    pass.dispose();
    service.dispose();
  }
});

test.for(["pass", "service", "semantic-cleanup"] as const)("readonly native reference handles release with their owner: %s", (owner) => {
  const { service } = nativeReferenceFixture();
  const position = fixtureValue(service.getProgram()?.getSourceFile("/base.ts")).text.indexOf("first");
  const pass = service.createReadonlyReferencePass();
  expect(pass.findReferences("/base.ts", position)).toBeDefined();
  if (owner === "pass") {
    pass.dispose();
    pass.dispose();
  } else if (owner === "service") {
    service.dispose();
  } else {
    service.cleanupSemanticCache();
  }
  expect(() => pass.findReferences("/base.ts", position)).toThrow("disposed");
  pass.dispose();
  service.dispose();
});

test("readonly native reference passes retain the language-service mode restriction", () => {
  const { service } = nativeReferenceFixture(ts.LanguageServiceMode.Syntactic);
  try {
    expect(() => service.createReadonlyReferencePass()).toThrow("not allowed in LanguageServiceMode.Syntactic");
    expect(() => service.findReferences("/base.ts", 13)).toThrow("not allowed in LanguageServiceMode.Syntactic");
  } finally {
    service.dispose();
  }
});

test.for([false, true])("inventory releases its native reference pass after query failure: %s", (fail, { scratch }) => {
  writeFileSync(join(scratch, "tsconfig.json"), JSON.stringify({ files: ["base.ts"], compilerOptions: { noLib: true, types: [] } }));
  writeFileSync(join(scratch, "base.ts"), "export const value=1; export const use=value;\n");
  execFixtureGit(scratch, ["init", "-q"]);
  const descriptor = fixtureValue(readCompilerPrograms(scratch)[0]);
  const failure = new Error("native reference query failed");
  let pass: ts.ReadonlyReferencePass | undefined;
  const extract = (): ReturnType<typeof extractWithoutReferenceWrappers> =>
    extractWithoutReferenceWrappers(
      { root: scratch, descriptor, destination: join(scratch, "unused.sqlite") },
      () => {
        if (fail) {
          throw failure;
        }
      },
      (observed) => {
        pass = observed;
      },
    );
  let thrown: Error | undefined;
  let referenceCount = 0;
  try {
    referenceCount = extract().partition.references.length;
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    thrown = error;
  }
  expect(thrown).toBe(fail ? failure : undefined);
  expect(referenceCount > 0).toBe(!fail);
  expect(() => fixtureValue(pass).findReferences(join(scratch, "base.ts"), 13)).toThrow("disposed");
});

test("inventory refuses a Program replacement between source facts and its reference pass", ({ scratch }) => {
  writeFileSync(join(scratch, "tsconfig.json"), JSON.stringify({ files: ["base.ts"], compilerOptions: { noLib: true, types: [] } }));
  writeFileSync(join(scratch, "base.ts"), "export const value=1; export const use=value;\n");
  execFixtureGit(scratch, ["init", "-q"]);
  const descriptor = fixtureValue(readCompilerPrograms(scratch)[0]);
  let host: Project | undefined;
  let pass: ts.ReadonlyReferencePass | undefined;
  const resolve = Project.prototype.resolveSourceFileDependencies;
  const observation = vi.spyOn(Project.prototype, "resolveSourceFileDependencies").mockImplementation(function (this: Project) {
    host = this;
    return resolve.call(this);
  });
  try {
    expect(() =>
      extractWithoutReferenceWrappers({ root: scratch, descriptor, destination: join(scratch, "unused.sqlite") }, undefined, (created) => {
        pass = created;
        fixtureValue(host).createSourceFile(join(scratch, "added.ts"), "export const added=2;\n");
      }),
    ).toThrow("native inventory Program changed before its reference pass");
    expect(() => fixtureValue(pass).findReferences(join(scratch, "base.ts"), 13)).toThrow("disposed");
  } finally {
    observation.mockRestore();
  }
});

test("lean native references bypass display-node materialization on fresh checkers", () => {
  const query = (omitDisplay: boolean, throughPass = false): { groups: ts.ReferencedSymbol[]; materializations: number } => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile("/fixture.ts", "export const value={outer:{nested:1}, method(){return {result:1};}}; export const use=value;\n");
    const service = project.getLanguageService().compilerObject;
    fixtureValue(service.getProgram()).getTypeChecker();
    const factory = vi.spyOn(ts.factory, "createTypeLiteralNode");
    const pass = throughPass ? service.createReadonlyReferencePass() : undefined;
    try {
      const groups = fixtureValue(
        (pass ?? service).findReferences(source.getFilePath(), source.getFullText().indexOf("value"), { includeDefinitionDisplay: !omitDisplay }),
      );
      return { groups, materializations: factory.mock.calls.length };
    } finally {
      pass?.dispose();
      factory.mockRestore();
      service.dispose();
    }
  };
  const rich = query(false);
  const lean = query(true);
  const richPass = query(false, true);
  const leanPass = query(true, true);
  expect(rich.materializations).toBeGreaterThan(0);
  expect(lean.materializations).toBe(0);
  expect(richPass.materializations).toBeGreaterThan(0);
  expect(leanPass.materializations).toBe(0);
  expect(richPass.groups).toEqual(rich.groups);
  expect(leanPass.groups).toEqual(lean.groups);
  expect(lean.groups).toEqual(
    rich.groups.map(({ definition, references }) => ({
      definition: { ...definition, name: "", displayParts: [] },
      references,
    })),
  );
});

test("native reference display opt-out preserves all grouped metadata except presentation", () => {
  const files = {
    "/base.ts": [
      '/// <reference path="./reference.d.ts" />',
      "export const value={nested:{item:1}}; export const {nested:binding}=value;",
      "export interface Shape<T> { 'tag': T; method(x:T):T; }",
      "export class Base<T> { constructor(public field:T){} get item(){return this.field;} set item(x:T){this.field=x;} method(x:T){return x;} }",
      "export class Child extends Base<number> { override method(x:number){return super.method(x)+this.item;} }",
      "export enum Choice { One=1, Two=One+1 }",
      "export namespace Group { export const held=value; }",
      "export function overloaded(x:string):string; export function overloaded(x:number):number; export function overloaded(x:string|number){return x;}",
      "export namespace overloaded {export const extra=1;}",
      "export type Mapped<T> = {[K in keyof T]:T[K]};",
      "export default function(){return binding;}",
      "export const text='literal';",
      "export function control(){ outer: for(let i=0;i<2;i++){if(i)break outer;continue;} return 'literal'; }",
    ].join("\n"),
    "/consumer.ts": [
      "import fallback,{value as alias,binding,Base,Child,Choice,Group,overloaded,type Shape,type Mapped} from './base';",
      "import * as all from './base'; export {alias as renamed};",
      "export const shape:Shape<number>={tag:1,method(x){return x;}};",
      "export const read=shape['tag']+new Child(1).method(2)+Choice.Two+overloaded(1)+overloaded.extra;",
      "export const object={binding}; export const use=[alias,all.value,Group.held,fallback()];",
      "export type Copy=Mapped<typeof object>; /** {@link binding} */ export const doc=binding;",
      "import {renamed,everything} from './barrel'; export const indirect=[renamed,everything.value];",
      "export type Imported=import('./base').Shape<number>; export type Module=typeof import('./base');",
      "export const later=()=>import('./base'); import {missing} from './absent'; export const unresolved=missing;",
    ].join("\n"),
    "/barrel.ts": "export {value as renamed} from './base'; export * as everything from './base';\n",
    "/augmentation.d.ts": "import './base'; declare module './base' {interface Shape<T> {extra?:T}}\n",
    "/export-equals.ts": "const exported={value:1}; export = exported;\n",
    "/import-equals.ts": "import imported=require('./export-equals'); export const use=imported.value;\n",
  };
  const create = (): Project => {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { noLib: true, types: [], module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler },
    });
    project.createSourceFile("/reference.d.ts", "interface ExternalShape {external:number}\n");
    project.createSourceFile("/jsx.tsx", "declare namespace JSX {interface IntrinsicElements {div:{tag?:number}}} export const rendered=<div tag={1}/>;\n");
    for (const [path, text] of Object.entries(files)) {
      project.createSourceFile(path, text);
    }
    return project;
  };
  const original = create().getLanguageService().compilerObject;
  const leanFirst = create().getLanguageService().compilerObject;
  const richPass = original.createReadonlyReferencePass();
  const leanPass = leanFirst.createReadonlyReferencePass();
  const kinds = new Set<ts.ScriptElementKind>();
  let laterDefinitions = 0;
  const queries: { file: string; position: number }[] = [];
  const visit = (node: ts.Node, source: ts.SourceFile): void => {
    if (node.getChildCount(source) === 0 && node.kind !== ts.SyntaxKind.EndOfFileToken) {
      queries.push({ file: source.fileName, position: node.getStart(source) });
    }
    for (const child of node.getChildren(source)) {
      visit(child, source);
    }
  };
  try {
    for (const source of fixtureValue(original.getProgram()).getSourceFiles()) {
      visit(source, source);
      for (const reference of source.referencedFiles) {
        queries.push({ file: source.fileName, position: reference.pos });
      }
    }
    for (const { file, position } of queries) {
      const rich = original.findReferences(file, position);
      const lean = leanFirst.findReferences(file, position, { includeDefinitionDisplay: false });
      expect(richPass.findReferences(file, position)).toEqual(rich);
      expect(richPass.findReferences(file, position, { includeDefinitionDisplay: true })).toEqual(rich);
      expect(leanPass.findReferences(file, position, { includeDefinitionDisplay: false })).toEqual(lean);
      expect(lean).toEqual(rich?.map(({ definition, references }) => ({ definition: { ...definition, name: "", displayParts: [] }, references })));
      expect(leanFirst.findReferences(file, position)).toEqual(rich);
      expect(leanFirst.findReferences(file, position, { includeDefinitionDisplay: true })).toEqual(rich);
      for (const group of rich ?? []) {
        kinds.add(group.definition.kind);
        laterDefinitions += group.references.filter((entry, index) => index > 0 && entry.isDefinition === true).length;
      }
    }
    expect(queries.length).toBeGreaterThan(100);
    expect(laterDefinitions).toBeGreaterThan(0);
    for (const kind of [
      ts.ScriptElementKind.label,
      ts.ScriptElementKind.keyword,
      ts.ScriptElementKind.string,
      ts.ScriptElementKind.alias,
      ts.ScriptElementKind.classElement,
      ts.ScriptElementKind.interfaceElement,
      ts.ScriptElementKind.enumElement,
      ts.ScriptElementKind.enumMemberElement,
      ts.ScriptElementKind.typeParameterElement,
      ts.ScriptElementKind.memberFunctionElement,
    ]) {
      expect(kinds.has(kind)).toBe(true);
    }
  } finally {
    richPass.dispose();
    leanPass.dispose();
    original.dispose();
    leanFirst.dispose();
  }
});

test("native executing sources and SDK pins reject stale stored and staged worker identities", { timeout: scaledBudget(240_000) }, ({ scratch }) => {
  writeFileSync(join(scratch, "tsconfig.json"), JSON.stringify({ files: ["base.ts"], compilerOptions: { noLib: true, types: [] } }));
  writeFileSync(join(scratch, "base.ts"), "export const value=1; export const use=value;\n");
  writeFileSync(join(scratch, ".gitignore"), ".cache/\n");
  execFixtureGit(scratch, ["init", "-q"]);
  expect(JSON.parse(nativeInputCase("sdk-pins", implementationRoot, scratch))).toMatchObject({
    sdkPinned: true,
    versionedOwners: [
      "authored-repository.ts",
      "semantic-inventory-database.ts",
      "semantic-inventory-records.ts",
      "semantic-inventory-queries.ts",
      "semantic-inventory-reader.ts",
      "semantic-inventory.ts",
    ],
    rebuiltAfterStalePin: true,
    refusal: expect.stringMatching(/implementation.*(changed|stale)/u),
    publicationWorkers: 1,
    latestUnchanged: true,
    pinnedText: "export const value=1; export const use=value;\n",
  });
});

test("readonly native token lookups avoid repeated traversal without caching symbol meaning", () => {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { noLib: true, types: [], module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler },
  });
  project.createSourceFile("/base.ts", "export interface First { value:number } export interface Second { value:string }\n");
  project.createSourceFile(
    "/consumer.ts",
    "import type {First,Second} from './base'; export declare const first:First; export declare const second:Second; export const a=first.value; export const b=second.value;\n",
  );
  const service = project.getLanguageService().compilerObject;
  const program = fixtureValue(service.getProgram());
  const base = fixtureValue(program.getSourceFile("/base.ts"));
  const consumer = fixtureValue(program.getSourceFile("/consumer.ts"));
  const positions = [base.text.indexOf("value"), base.text.lastIndexOf("value")];
  const options = { includeDefinitionDisplay: false };
  const expected = positions.map((position) => service.findReferences(base.fileName, position, options));
  expect(expected[0]).not.toEqual(expected[1]);
  const traversal = vi.spyOn(consumer, "getChildren");
  const meaning = vi.spyOn(program.getTypeChecker(), "getSymbolAtLocation");
  const pass = service.createReadonlyReferencePass();
  try {
    expect(pass.findReferences(base.fileName, fixtureValue(positions[0]), options)).toEqual(expected[0]);
    expect(traversal).toHaveBeenCalled();
    traversal.mockClear();
    meaning.mockClear();
    expect(pass.findReferences(base.fileName, fixtureValue(positions[1]), options)).toEqual(expected[1]);
    expect(traversal.mock.calls.length).toBe(0);
    expect(meaning.mock.calls.some(([node]) => node.getSourceFile() === consumer)).toBe(true);
    const returned = fixtureValue(pass.findReferences(base.fileName, fixtureValue(positions[0]), options));
    fixtureValue(returned[0]).references.length = 0;
    expect(pass.findReferences(base.fileName, fixtureValue(positions[0]), options)).toEqual(expected[0]);
    traversal.mockClear();
    expect(service.findReferences(base.fileName, fixtureValue(positions[1]), options)).toEqual(expected[1]);
    expect(traversal).toHaveBeenCalled();
  } finally {
    pass.dispose();
    meaning.mockRestore();
    traversal.mockRestore();
    service.dispose();
  }
});

test("full-cap native token memo preserves fallback and releases its bounded retained representation", { timeout: 125_000 }, async ({ scratch }) => {
  const child = fileURLToPath(new URL("../../../support/node/native-token-memo-child.mjs", import.meta.url));
  const output = join(scratch, "native-token-memo.json");
  const result = await spawnNiced(process.execPath, ["--expose-gc", child, output], { timeoutMs: 120_000 });
  console.log(result.stdout);
  expect(result.code, result.stderr).toBe(0);
  expect(result.timedOut).toBe(false);
  expect(JSON.parse(readFileSync(output, "utf8"))).toMatchObject({
    phase: "complete",
    passed: true,
    capacity: 524_288,
    inputReferences: 524_304,
    runtimeSha256: contentVersion(readFileSync(ts.sys.getExecutingFilePath())),
    gcDisturbedRepresentationOnly: true,
  });
});

test("native token memo belongs to one readonly pass and leaves rename and highlight paths native", () => {
  const { service } = nativeReferenceFixture();
  const program = fixtureValue(service.getProgram());
  const consumer = fixtureValue(program.getSourceFile("/consumer.ts"));
  const position = fixtureValue(program.getSourceFile("/base.ts")).text.indexOf("first");
  const options = { includeDefinitionDisplay: false };
  const expected = service.findReferences("/base.ts", position, options);
  const rename = service.findRenameLocations("/base.ts", position, false, false, {});
  const highlights = service.getDocumentHighlights("/base.ts", position, ["/base.ts", "/consumer.ts"]);
  const traversal = vi.spyOn(consumer, "getChildren");
  const first = service.createReadonlyReferencePass();
  const second = service.createReadonlyReferencePass();
  try {
    expect(first.findReferences("/base.ts", position, options)).toEqual(expected);
    expect(traversal).toHaveBeenCalled();
    traversal.mockClear();
    expect(first.findReferences("/base.ts", position, options)).toEqual(expected);
    expect(traversal.mock.calls.length).toBe(0);
    expect(second.findReferences("/base.ts", position, options)).toEqual(expected);
    expect(traversal).toHaveBeenCalled();
    second.dispose();
    traversal.mockClear();
    expect(first.findReferences("/base.ts", position, options)).toEqual(expected);
    expect(traversal.mock.calls.length).toBe(0);
    expect(service.findRenameLocations("/base.ts", position, false, false, {})).toEqual(rename);
    expect(traversal).toHaveBeenCalled();
    traversal.mockClear();
    expect(service.getDocumentHighlights("/base.ts", position, ["/base.ts", "/consumer.ts"])).toEqual(highlights);
    expect(traversal).toHaveBeenCalled();
    first.dispose();
    const fresh = service.createReadonlyReferencePass();
    try {
      traversal.mockClear();
      expect(fresh.findReferences("/base.ts", position, options)).toEqual(expected);
      expect(traversal).toHaveBeenCalled();
    } finally {
      fresh.dispose();
    }
  } finally {
    first.dispose();
    second.dispose();
    traversal.mockRestore();
    service.dispose();
  }
});

test("interrupted native token lookup retries without caching a partial result and warm hits still cancel", () => {
  const fixture = nativeReferenceFixture();
  const service = fixture.service;
  const consumer = fixtureValue(service.getProgram()?.getSourceFile("/consumer.ts"));
  const position = fixtureValue(service.getProgram()?.getSourceFile("/base.ts")).text.indexOf("first");
  const options = { includeDefinitionDisplay: false };
  const expected = service.findReferences("/base.ts", position, options);
  const getChildren = consumer.getChildren.bind(consumer);
  let interrupt = true;
  const traversal = vi.spyOn(consumer, "getChildren").mockImplementation((source) => {
    if (interrupt) {
      interrupt = false;
      throw new ts.OperationCanceledException();
    }
    return getChildren(source);
  });
  const pass = service.createReadonlyReferencePass();
  try {
    expect(() => pass.findReferences("/base.ts", position, options)).toThrow(ts.OperationCanceledException);
    traversal.mockClear();
    expect(pass.findReferences("/base.ts", position, options)).toEqual(expected);
    expect(traversal).toHaveBeenCalled();
    traversal.mockClear();
    expect(pass.findReferences("/base.ts", position, options)).toEqual(expected);
    expect(traversal.mock.calls.length).toBe(0);
    fixture.cancel(true);
    expect(() => pass.findReferences("/base.ts", position, options)).toThrow(ts.OperationCanceledException);
    fixture.cancel(false);
    expect(pass.findReferences("/base.ts", position, options)).toEqual(expected);
    expect(traversal.mock.calls.length).toBe(0);
  } finally {
    pass.dispose();
    traversal.mockRestore();
    service.dispose();
  }
});

test("readonly native lexical scans reuse full-file positions while interpreting each symbol freshly", () => {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { noLib: true, types: [], module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler },
  });
  project.createSourceFile("/base.ts", "export interface First { value:number } export interface Second { value:string }\n");
  project.createSourceFile(
    "/consumer.ts",
    "import type {First,Second} from './base'; export declare const first:First; export declare const second:Second; export const a=first.value; export const b=second.value;\n",
  );
  const service = project.getLanguageService().compilerObject;
  const program = fixtureValue(service.getProgram());
  const base = fixtureValue(program.getSourceFile("/base.ts"));
  const consumer = fixtureValue(program.getSourceFile("/consumer.ts"));
  const positions = [base.text.indexOf("value"), base.text.lastIndexOf("value")];
  const options = { includeDefinitionDisplay: false };
  const expected = positions.map((position) => service.findReferences(base.fileName, position, options));
  expect(expected[0]).not.toEqual(expected[1]);
  const indexOf = String.prototype.indexOf;
  let scans = 0;
  const scan = vi.spyOn(String.prototype, "indexOf").mockImplementation(function (this: string, name, position) {
    if (this === consumer.text && name === "value") {
      scans++;
    }
    return indexOf.call(this, name, position);
  });
  const meaning = vi.spyOn(program.getTypeChecker(), "getSymbolAtLocation");
  const pass = service.createReadonlyReferencePass();
  try {
    expect(pass.findReferences(base.fileName, fixtureValue(positions[0]), options)).toEqual(expected[0]);
    expect(scans).toBeGreaterThan(0);
    scans = 0;
    meaning.mockClear();
    expect(pass.findReferences(base.fileName, fixtureValue(positions[1]), options)).toEqual(expected[1]);
    expect(scans).toBe(0);
    expect(meaning.mock.calls.some(([node]) => node.getSourceFile() === consumer)).toBe(true);
    const returned = fixtureValue(pass.findReferences(base.fileName, fixtureValue(positions[0]), options));
    fixtureValue(returned[0]).references.length = 0;
    expect(pass.findReferences(base.fileName, fixtureValue(positions[0]), options)).toEqual(expected[0]);
    expect(service.findReferences(base.fileName, fixtureValue(positions[1]), options)).toEqual(expected[1]);
    expect(scans).toBeGreaterThan(0);
  } finally {
    pass.dispose();
    meaning.mockRestore();
    scan.mockRestore();
    service.dispose();
  }
});

function observeLexicalScans(
  source: ts.SourceFile,
  name: string,
  onScan?: (position: number) => void,
): { readonly count: number; reset: () => void; restore: () => void } {
  const indexOf = String.prototype.indexOf;
  let count = 0;
  const spy = vi.spyOn(String.prototype, "indexOf").mockImplementation(function (this: string, search, start) {
    const position = indexOf.call(this, search, start);
    if (this === source.text && search === name) {
      count++;
      onScan?.(position);
    }
    return position;
  });
  return {
    get count(): number {
      return count;
    },
    reset: (): void => {
      count = 0;
    },
    restore: (): void => spy.mockRestore(),
  };
}

test.for(["aa", "value", "π", "𐐀", "$value"])("native lexical lists preserve ordered Unicode and boundary references: %s", (name) => {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { noLib: true, types: [], module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler },
  });
  const baseText = `export interface First { ${name}:number } export interface Second { ${name}:string }`;
  project.createSourceFile("/base.ts", baseText);
  project.createSourceFile(
    "/consumer.ts",
    `import type {First,Second} from './base'; export declare const first:First; export declare const second:Second;
/** ${name}${name} x${name} ${name}x é${name} ${name}é ${name} */
export const text=${JSON.stringify(`${name} ${name}${name} x${name} ${name}x`)};
export const a=first[${JSON.stringify(name)}]; export const b=second.${name}; export const ending=first.${name}`,
  );
  const service = project.getLanguageService().compilerObject;
  const consumer = fixtureValue(service.getProgram()?.getSourceFile("/consumer.ts"));
  const positions = [baseText.indexOf(name), baseText.lastIndexOf(name)];
  const expected = positions.map((position) => service.findReferences("/base.ts", position));
  expect(expected[0]).not.toEqual(expected[1]);
  expect(
    expected[0]?.flatMap((group) => group.references).some((reference) => reference.textSpan.start + reference.textSpan.length === consumer.text.length),
  ).toBe(true);
  const scan = observeLexicalScans(consumer, name);
  const pass = service.createReadonlyReferencePass();
  try {
    for (const [index, position] of positions.entries()) {
      expect(pass.findReferences("/base.ts", position)).toEqual(expected[index]);
    }
    expect(scan.count).toBeGreaterThan(0);
    scan.reset();
    for (const [index, position] of positions.entries()) {
      expect(pass.findReferences("/base.ts", position)).toEqual(expected[index]);
      expect(pass.findReferences("/base.ts", position, { includeDefinitionDisplay: false })).toEqual(
        expected[index]?.map(({ definition, references }) => ({ definition: { ...definition, name: "", displayParts: [] }, references })),
      );
    }
    expect(scan.count).toBe(0);
  } finally {
    pass.dispose();
    scan.restore();
    service.dispose();
  }
});

test("native lexical lists leave local containers, rename and highlights uncached", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  project.createSourceFile("/base.ts", "export function first(local:number){return local+local;} export function second(local:string){return local;}\n");
  const service = project.getLanguageService().compilerObject;
  const source = fixtureValue(service.getProgram()?.getSourceFile("/base.ts"));
  const position = source.text.indexOf("local");
  const expected = service.findReferences(source.fileName, position);
  const rename = service.findRenameLocations(source.fileName, position, false, false, {});
  const highlights = service.getDocumentHighlights(source.fileName, position, [source.fileName]);
  const scan = observeLexicalScans(source, "local");
  const pass = service.createReadonlyReferencePass();
  try {
    expect(pass.findReferences(source.fileName, position)).toEqual(expected);
    const cold = scan.count;
    expect(cold).toBeGreaterThan(0);
    scan.reset();
    expect(pass.findReferences(source.fileName, position + 1)).toEqual(expected);
    expect(scan.count).toBe(cold);
    scan.reset();
    expect(service.findRenameLocations(source.fileName, position, false, false, {})).toEqual(rename);
    expect(scan.count).toBeGreaterThan(0);
    scan.reset();
    expect(service.getDocumentHighlights(source.fileName, position, [source.fileName])).toEqual(highlights);
    expect(scan.count).toBeGreaterThan(0);
  } finally {
    pass.dispose();
    scan.restore();
    service.dispose();
  }
});

test("interrupted native lexical scans retry the complete list and warm hits still cancel", () => {
  const fixture = nativeReferenceFixture();
  const service = fixture.service;
  const source = fixtureValue(service.getProgram()?.getSourceFile("/consumer.ts"));
  const position = fixtureValue(service.getProgram()?.getSourceFile("/base.ts")).text.indexOf("first");
  const expected = service.findReferences("/base.ts", position);
  let interrupt = true;
  const scan = observeLexicalScans(source, "first", (found) => {
    if (found > 20 && interrupt) {
      interrupt = false;
      throw new ts.OperationCanceledException();
    }
  });
  const pass = service.createReadonlyReferencePass();
  try {
    expect(() => pass.findReferences("/base.ts", position)).toThrow(ts.OperationCanceledException);
    expect(scan.count).toBeGreaterThan(1);
    scan.reset();
    expect(pass.findReferences("/base.ts", position)).toEqual(expected);
    expect(scan.count).toBeGreaterThan(1);
    scan.reset();
    expect(pass.findReferences("/base.ts", position)).toEqual(expected);
    expect(scan.count).toBe(0);
    fixture.cancel(true);
    expect(() => pass.findReferences("/base.ts", position)).toThrow(ts.OperationCanceledException);
    fixture.cancel(false);
    expect(pass.findReferences("/base.ts", position)).toEqual(expected);
    expect(scan.count).toBe(0);
    pass.dispose();
    const fresh = service.createReadonlyReferencePass();
    try {
      expect(fresh.findReferences("/base.ts", position)).toEqual(expected);
      expect(scan.count).toBeGreaterThan(1);
    } finally {
      fresh.dispose();
    }
  } finally {
    pass.dispose();
    scan.restore();
    service.dispose();
  }
});

test("native lexical lists use source object identity and never retain an unadmitted source", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const text = "const value=1; export const use=value;\n";
  project.createSourceFile("/first.ts", text);
  project.createSourceFile("/second.ts", text);
  const service = project.getLanguageService().compilerObject;
  const program = fixtureValue(service.getProgram());
  const first = fixtureValue(program.getSourceFile("/first.ts"));
  const second = fixtureValue(program.getSourceFile("/second.ts"));
  const position = text.indexOf("value");
  const expected = [first, second].map((source) => service.findReferences(source.fileName, position));
  expect(expected[0]).not.toEqual(expected[1]);
  const scan = observeLexicalScans(first, "value");
  const pass = service.createReadonlyReferencePass();
  try {
    expect(pass.findReferences(first.fileName, position)).toEqual(expected[0]);
    expect(scan.count).toBeGreaterThan(0);
    scan.reset();
    expect(pass.findReferences(second.fileName, position)).toEqual(expected[1]);
    expect(scan.count).toBeGreaterThan(0);
    scan.reset();
    expect(pass.findReferences(first.fileName, position)).toEqual(expected[0]);
    expect(pass.findReferences(second.fileName, position)).toEqual(expected[1]);
    expect(scan.count).toBe(0);
    pass.dispose();
    const population = vi.spyOn(program, "getSourceFiles").mockReturnValue([second]);
    const foreign = service.createReadonlyReferencePass();
    try {
      const native = service.findReferences(first.fileName, position);
      scan.reset();
      expect(foreign.findReferences(first.fileName, position)).toEqual(native);
      expect(scan.count).toBeGreaterThan(0);
      scan.reset();
      expect(foreign.findReferences(first.fileName, position)).toEqual(native);
      expect(scan.count).toBeGreaterThan(0);
    } finally {
      foreign.dispose();
      population.mockRestore();
    }
  } finally {
    pass.dispose();
    scan.restore();
    service.dispose();
  }
});

test("full-cap native lexical lists preserve all fallback dimensions and release combined retention", { timeout: 125_000 }, async ({ scratch }) => {
  const child = fileURLToPath(new URL("../../../support/node/native-lexical-memo-child.mjs", import.meta.url));
  const output = join(process.cwd(), "reports", "review", `native-lexical-memo-${basename(scratch)}.json`);
  mkdirSync(dirname(output), { recursive: true });
  const result = await spawnNiced(process.execPath, ["--expose-gc", child, output], { timeoutMs: 120_000 });
  writeFileSync(`${output}.stdout.log`, result.stdout);
  writeFileSync(`${output}.stderr.log`, result.stderr);
  console.log(result.stdout);
  expect(result.code, result.stderr).toBe(0);
  expect(result.timedOut).toBe(false);
  expect(JSON.parse(readFileSync(output, "utf8"))).toMatchObject({
    phase: "complete",
    passed: true,
    nameCapacity: 65_536,
    positionCapacity: 1_048_576,
    nameUnitCapacity: 8_388_608,
    inputQueries: 65_537,
    runtimeSha256: contentVersion(readFileSync(ts.sys.getExecutingFilePath())),
    gcDisturbedRepresentationOnly: true,
  });
});

test("native lexical reuse retains a complete empty candidate list without inventing escaped-name references", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  project.createSourceFile("/base.ts", "export const v\\u0061lue=1; export const use=v\\u0061lue;\n");
  const service = project.getLanguageService().compilerObject;
  const source = fixtureValue(service.getProgram()?.getSourceFile("/base.ts"));
  const expected = service.findReferences(source.fileName, 13);
  const scan = observeLexicalScans(source, "value");
  const pass = service.createReadonlyReferencePass();
  try {
    expect(pass.findReferences(source.fileName, 13)).toEqual(expected);
    expect(scan.count).toBe(1);
    scan.reset();
    expect(pass.findReferences(source.fileName, 14)).toEqual(expected);
    expect(scan.count).toBe(0);
  } finally {
    pass.dispose();
    scan.restore();
    service.dispose();
  }
});

test("a completed lexical list survives later native interpretation cancellation without retaining query results", () => {
  const { service } = nativeReferenceFixture();
  const source = fixtureValue(service.getProgram()?.getSourceFile("/consumer.ts"));
  const position = fixtureValue(service.getProgram()?.getSourceFile("/base.ts")).text.indexOf("first");
  const expected = service.findReferences("/base.ts", position);
  const scan = observeLexicalScans(source, "first");
  const children = source.getChildren.bind(source);
  let interrupt = true;
  const traversal = vi.spyOn(source, "getChildren").mockImplementation((file) => {
    if (interrupt) {
      interrupt = false;
      throw new ts.OperationCanceledException();
    }
    return children(file);
  });
  const pass = service.createReadonlyReferencePass();
  try {
    expect(() => pass.findReferences("/base.ts", position)).toThrow(ts.OperationCanceledException);
    expect(scan.count).toBeGreaterThan(1);
    scan.reset();
    traversal.mockClear();
    expect(pass.findReferences("/base.ts", position)).toEqual(expected);
    expect(scan.count).toBe(0);
    expect(traversal).toHaveBeenCalled();
  } finally {
    pass.dispose();
    traversal.mockRestore();
    scan.restore();
    service.dispose();
  }
});

test.for(["identical", "different", "symlink"] as const)(
  "membership-only source availability matches the canonical Project across native redirects: %s",
  (variant, { scratch }) => {
    const request = redirectFixture(scratch, variant);
    const membership = extractInventoryPartition({ ...request, intent: "membership", families: [] });
    const owner = createSemanticWorkspace({ root: scratch }).program(request.descriptor.config);
    if (owner === undefined) {
      throw new Error("missing native descriptor");
    }
    const project = owner.project();
    const expected = [
      ...new Set(
        nativeCompilerSourceFiles(project)
          .map((source) => canonicalInventoryPath(source.getFilePath()))
          .filter((path) => project.getSourceFile(path) !== undefined),
      ),
    ];
    expect(membership.available).toEqual(expected);
    expect(membership.nativeRoots).toEqual([...project.getProgram().compilerObject.getRootFileNames()]);
    expect(membership.compilerOptionsJson).toBe(JSON.stringify(project.getCompilerOptions()));
    expect(membership.inputs.some(({ kind, path }) => kind === "exists" && path.endsWith("absent.ts"))).toBe(true);
  },
);

test("legacy analysis eligibility preserves the complete native closure of an eligible importing world", ({ scratch }) => {
  const write = (path: string, text: string): void => {
    const absolute = join(scratch, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, text);
  };
  write(".gitignore", ".cache/\n");
  write(
    "tsconfig.json",
    JSON.stringify({ files: ["entry.ts"], compilerOptions: { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler", strict: true } }),
  );
  write("entry.ts", "import {dependency} from './tests/legacy/dependency';export const value=dependency;");
  write("tests/legacy/dependency.ts", "export const dependency=1;");
  execFixtureGit(scratch, ["init", "-q"]);
  const descriptor = fixtureValue(readCompilerPrograms(scratch)[0]);
  const partition = extractInventoryPartition({ root: scratch, descriptor, families: ["bindings"], destination: join(scratch, "unused.sqlite") });
  expect(partition.roots).toEqual([join(scratch, "entry.ts")]);
  expect(partition.nativeRoots).toEqual(partition.roots);
  expect(partition.available.toSorted()).toEqual([join(scratch, "entry.ts"), join(scratch, "tests/legacy/dependency.ts")].toSorted());
  expect(JSON.parse(partition.compilerOptionsJson)).toEqual(descriptor.commandLine.options);
});

test("an ignored dependency overlay transports exact worker bytes without granting authored membership", { timeout: scaledBudget(60_000) }, ({ scratch }) => {
  const dependency = join(scratch, "vendor/value.ts");
  const physical = "export const value=1;\n";
  const projected = "export const value=2;\n";
  writeFileSync(join(scratch, ".gitignore"), ".cache/\nvendor/\n");
  mkdirSync(dirname(dependency), { recursive: true });
  writeFileSync(dependency, physical);
  writeFileSync(join(scratch, "consumer.ts"), "import {value} from './vendor/value';export const use=value;\n");
  writeFileSync(
    join(scratch, "tsconfig.json"),
    JSON.stringify({ files: ["consumer.ts"], compilerOptions: { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler" } }),
  );
  execFixtureGit(scratch, ["init", "-q"]);
  const options = { root: scratch, families: ["bindings"] as const };
  using previous = nativeInventoryFixture(options);
  const requests: InventoryBuildRequest[] = [];
  const backups: string[] = [];
  let refusal: string | undefined;
  let observed: object | undefined;
  try {
    using current = nativeInventoryFixture(options, {
      projection: { root: scratch, files: [{ path: dependency, text: projected }], deleted: [] },
      requests,
      backups,
    });
    const backup = fixtureValue(backups[0]);
    using db = openInventoryDatabase(backup);
    const partition = fixtureValue(readInventoryGeneration(db, current.generation)[0]);
    observed = {
      text: current.sourceCorpus().getSourceFile(dependency)?.getFullText(),
      authored: [...readInventorySourceMetadata(db, partition.id)].find((source) => source.file === dependency)?.authored,
      membership: [...readInventoryInputs(db, partition.id)].find((input) => input.path === dependency && input.kind === "authored")?.version,
    };
  } catch (error) {
    refusal = String(error);
  }
  expect(requests).toHaveLength(1);
  expect(requests[0]?.overlay?.files.find((file) => file.path === dependency)).toEqual({ path: dependency, text: projected });
  expect(requests[0]?.overlay).toMatchObject({ authoredAddedPaths: [] });
  expect(refusal).toBeUndefined();
  expect(observed).toEqual({ text: projected, authored: false, membership: "false" });
  expect(readFileSync(dependency, "utf8")).toBe(physical);
  expect(previous.sourceCorpus().getSourceFile(dependency)?.getFullText()).toBe(physical);
});

test.for(["authored-addition", "byte-only-addition", "deletion"] as const)(
  "native overlay byte availability and authored membership remain separate under %s",
  { timeout: scaledBudget(60_000) },
  (mode, { scratch }) => {
    const dependency = join(scratch, "value.ts");
    const physical = "export const value=1;\n";
    const projected = "export const value=2;\n";
    const deleted = mode === "deletion";
    const added = mode === "authored-addition";
    writeFileSync(join(scratch, ".gitignore"), ".cache/\n");
    if (deleted) {
      writeFileSync(dependency, physical);
    }
    writeFileSync(join(scratch, "consumer.ts"), "import {value} from './value';export const use=value;\n");
    writeFileSync(
      join(scratch, "tsconfig.json"),
      JSON.stringify({ files: ["consumer.ts"], compilerOptions: { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler" } }),
    );
    execFixtureGit(scratch, ["init", "-q"]);
    const options = { root: scratch, families: ["bindings"] as const };
    using previous = nativeInventoryFixture(options);
    const requests: InventoryBuildRequest[] = [];
    const backups: string[] = [];
    using current = nativeInventoryFixture(options, {
      projection: { root: scratch, files: deleted ? [] : [{ path: dependency, text: projected }], deleted: deleted ? [dependency] : [] },
      authoredAddedPaths: added ? [dependency] : [],
      requests,
      backups,
    });
    expect(requests).toHaveLength(1);
    const overlay = fixtureValue(requests[0]?.overlay);
    expect(overlay.authoredAddedPaths).toEqual(added ? [dependency] : []);
    expect(overlay.files.find((file) => file.path === dependency)).toEqual(deleted ? undefined : { path: dependency, text: projected });
    expect(inventoryAuthoredFiles(scratch, overlay).has(dependency)).toBe(added);
    expect(current.sourceCorpus().getSourceFile(dependency)?.getFullText()).toBe(deleted ? undefined : projected);
    using db = openInventoryDatabase(fixtureValue(backups[0]));
    const partition = fixtureValue(readInventoryGeneration(db, current.generation)[0]);
    const source = [...readInventorySourceMetadata(db, partition.id)].find((entry) => entry.file === dependency);
    expect(source?.authored).toBe(deleted ? undefined : added);
    expect(previous.sourceCorpus().getSourceFile(dependency)?.getFullText()).toBe(deleted ? physical : undefined);
    expect(existsSync(dependency)).toBe(deleted);
    const physicalText = existsSync(dependency) ? readFileSync(dependency, "utf8") : undefined;
    expect(physicalText).toBe(deleted ? physical : undefined);
  },
);

function aliasedProjection(
  root: string,
  second: "none" | "alias" | "target",
): { readonly target: string; readonly alias: string; readonly peer: string; readonly physical: string; readonly projected: string } {
  const target = join(root, "vendor/value.ts");
  const alias = join(root, "vendor/alias.ts");
  const peer = join(root, "vendor/peer.ts");
  const physical = "export const value=1;\n";
  const projected = "export const value=2;\n";
  writeFileSync(join(root, ".gitignore"), ".cache/\nvendor/\n");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, physical);
  symlinkSync("value.ts", alias);
  symlinkSync("value.ts", peer);
  const extra = second === "none" ? "" : `import {value as other} from './vendor/${second === "alias" ? "peer" : "value"}';`;
  writeFileSync(join(root, "consumer.ts"), `import {value} from './vendor/alias';${extra}export const use=value;\n`);
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({ files: ["consumer.ts"], compilerOptions: { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler" } }),
  );
  execFixtureGit(root, ["init", "-q"]);
  return { target, alias, peer, physical, projected };
}

test.for(["none", "alias"] as const)(
  "native projected aliases retain transaction bytes and canonical facts with second import %s",
  { timeout: scaledBudget(60_000) },
  (second, { scratch }) => {
    const { target, alias, peer, physical, projected } = aliasedProjection(scratch, second);
    const options = { root: scratch, families: ["bindings"] as const };
    using previous = nativeInventoryFixture(options);
    const backups: string[] = [];
    const projectedPaths = second === "alias" ? [alias, peer] : [alias];
    using current = nativeInventoryFixture(options, {
      projection: { root: scratch, files: projectedPaths.map((path) => ({ path, text: projected })), deleted: [] },
      authoredAddedPaths: [],
      backups,
    });
    const source = fixtureValue(current.sourceCorpus().getSourceFile(alias));
    expect(source.getFullText()).toBe(projected);
    expect(source.getFilePath()).toBe(target);
    expect(current.canonicalPath(alias)).toBe(target);
    const consumer = fixtureValue(current.sourceCorpus().getSourceFile("consumer.ts"));
    const origins = consumer
      .getImportDeclarations()
      .flatMap((declaration) => declaration.getNamedImports().flatMap((specifier) => current.symbols(specifier.getNameNode()).origins));
    expect(origins).toHaveLength(projectedPaths.length);
    const valueDeclaration = source.getVariableDeclarationOrThrow("value");
    expect(origins).toEqual(projectedPaths.map(() => span(valueDeclaration)));
    expect(valueDeclaration.getInitializerOrThrow().getText()).toBe("2");
    expect(current.sourceCorpus().getSourceFile(fixtureValue(projectedPaths.at(-1)))).toBe(source);
    using db = openInventoryDatabase(fixtureValue(backups[0]));
    const partition = fixtureValue(readInventoryGeneration(db, current.generation)[0]);
    const captured = [...readInventorySourceMetadata(db, partition.id)].filter((entry) => entry.file === target);
    expect(captured.map((entry) => entry.path).toSorted()).toEqual(projectedPaths.toSorted());
    expect(captured.every((entry) => entry.authored === false)).toBe(true);
    const inputs = [...readInventoryInputs(db, partition.id)];
    expect(
      inputs
        .filter((entry) => entry.kind === "file" && projectedPaths.includes(entry.path))
        .map((entry) => entry.path)
        .toSorted(),
    ).toEqual(projectedPaths.toSorted());
    expect(inputs.find((entry) => entry.kind === "file" && entry.path === alias)?.version).not.toBe(inputVersion(alias, "file"));
    expect(inputs.find((entry) => entry.kind === "file" && entry.path === join(scratch, "consumer.ts"))?.version).toBe(
      inputVersion(join(scratch, "consumer.ts"), "file"),
    );
    expect(inputs.find((entry) => entry.kind === "authored" && entry.path === target)?.version).toBe("false");
    expect(previous.sourceCorpus().getSourceFile(target)?.getFullText()).toBe(physical);
    expect(readFileSync(alias, "utf8")).toBe(physical);
    expect(readFileSync(target, "utf8")).toBe(physical);
  },
);

test("native projected aliases refuse contradictory captured bytes for one canonical source", { timeout: scaledBudget(60_000) }, ({ scratch }) => {
  const { target, alias, physical, projected } = aliasedProjection(scratch, "target");
  const options = { root: scratch, families: ["bindings"] as const };
  using previous = nativeInventoryFixture(options);
  expect(() => {
    using _conflicting = nativeInventoryFixture(options, {
      projection: { root: scratch, files: [{ path: alias, text: projected }], deleted: [] },
      authoredAddedPaths: [],
    });
  }).toThrow("native semantic inventory mixed source versions");
  expect(previous.sourceCorpus().getSourceFile(target)?.getFullText()).toBe(physical);
  expect(readFileSync(alias, "utf8")).toBe(physical);
  expect(readFileSync(target, "utf8")).toBe(physical);
});

test("native projected aliases refuse a physical retarget before publication despite stable virtual bytes", { timeout: scaledBudget(60_000) }, ({
  scratch,
}) => {
  const { target, alias, physical, projected } = aliasedProjection(scratch, "none");
  writeFileSync(join(scratch, "vendor/other.ts"), "export const value=3;\n");
  const options = { root: scratch, families: ["bindings"] as const };
  using previous = nativeInventoryFixture(options);
  const faults: string[] = [];
  const published: number[] = [];
  expect(() => {
    using _retargeted = nativeInventoryFixture(options, {
      projection: { root: scratch, files: [{ path: alias, text: projected }], deleted: [] },
      authoredAddedPaths: [],
      fault: "projected-alias-retarget",
      faults,
      published,
    });
  }).toThrow(/^native semantic inventory inputs changed during extraction; no current verdict$/u);
  expect(faults).toEqual(["projected-alias-retarget"]);
  expect(published).toEqual([previous.generation]);
  using database = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  expect(latestInventoryGeneration(database)).toBe(previous.generation);
  expect(previous.sourceCorpus().getSourceFile(target)?.getFullText()).toBe(physical);
  expect(readFileSync(target, "utf8")).toBe(physical);
  expect(readFileSync(alias, "utf8")).toBe("export const value=3;\n");
});
