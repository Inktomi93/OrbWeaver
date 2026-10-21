import { mkdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { InventorySpan } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import { inputsCurrent, inventoryAuthoredFiles } from "@orb/tooling/floor/code-facts/semantic-inventory-inputs";
import { readCompilerPrograms } from "@orb/tooling/floor/compiler/compiler-programs";
import { extractInventoryPartition } from "@orb/tooling/floor/compiler/semantic-inventory-extract";
import { createSemanticWorkspace } from "@orb/tooling/floor/compiler/ts-workspace";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { Node, Program, Project, SourceFile, SyntaxKind, TypeChecker, ts } from "ts-morph";
import { vi } from "vitest";
import { z } from "zod";
import { inputSchema } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { extractWithoutReferenceWrappers, fixtureValue, nativeInputCase, span } from "./_semantic-inventory-extract-support.ts";
import { copyNativeInventoryImplementation } from "./native-inventory-tree.ts";
import { instrumentNativeQueryWorker, NATIVE_QUERY_MUTATIONS } from "./native-query-mutation.ts";

function withStatObservationTimeMatchers(partition: ReturnType<typeof extractInventoryPartition>): ReturnType<typeof extractInventoryPartition> {
  return {
    ...partition,
    inputs: partition.inputs.map((input) => (input.stat === undefined ? input : { ...input, stat: { ...input.stat, recordedAt: expect.any(Number) } })),
  };
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
  expect(again.partition).toEqual(withStatObservationTimeMatchers(partition));
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
  const original = structuredClone(first);
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
  expect(first).toEqual(withStatObservationTimeMatchers(original));
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
    const partition = extractInventoryPartition({
      root: scratch,
      descriptor,
      destination: join(scratch, "unused.sqlite"),
      referenceDemand: { mode: "complete", queries: [] },
    });
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
