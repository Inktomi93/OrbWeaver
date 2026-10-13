import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { InventoryBuildRequest, InventorySpan } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import { readCompilerPrograms } from "@orb/tooling/floor/compiler/compiler-programs";
import { extractInventoryPartition } from "@orb/tooling/floor/compiler/semantic-inventory-extract";
import { createSemanticWorkspace } from "@orb/tooling/floor/compiler/ts-workspace";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { DocumentSpan, LanguageService, Node, Project, SyntaxKind } from "ts-morph";
import { vi } from "vitest";

function span(node: Node): InventorySpan {
  return { file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() };
}

function fixtureValue<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("required native query fixture value missing");
  }
  return value;
}

function extractWithoutReferenceWrappers(request: InventoryBuildRequest): { partition: ReturnType<typeof extractInventoryPartition>; queries: string[] } {
  const queries: string[] = [];
  const restoreQueries: (() => void)[] = [];
  const observed = new Set<LanguageService>();
  const getLanguageService = Project.prototype.getLanguageService;
  const observation = vi.spyOn(Project.prototype, "getLanguageService").mockImplementation(function (this: Project) {
    const service = getLanguageService.call(this);
    if (!observed.has(service)) {
      observed.add(service);
      const nativeFind = service.compilerObject.findReferences;
      const query = vi.spyOn(service.compilerObject, "findReferences").mockImplementation((file, position) => {
        queries.push(JSON.stringify([file, position]));
        return nativeFind.call(service.compilerObject, file, position);
      });
      restoreQueries.push(() => query.mockRestore());
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
