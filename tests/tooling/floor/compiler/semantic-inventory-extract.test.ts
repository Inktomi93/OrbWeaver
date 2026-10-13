import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { InventorySpan } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import { readCompilerPrograms } from "@orb/tooling/floor/compiler/compiler-programs";
import { extractInventoryPartition } from "@orb/tooling/floor/compiler/semantic-inventory-extract";
import { createSemanticWorkspace } from "@orb/tooling/floor/compiler/ts-workspace";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { LanguageService, Node, SyntaxKind } from "ts-morph";
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

test("native named reference queries execute once while preserving declaration and name facts", ({ scratch }) => {
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
  const queries: string[] = [];
  const nativeFind = LanguageService.prototype.findReferencesAsNodes;
  const observation = vi.spyOn(LanguageService.prototype, "findReferencesAsNodes").mockImplementation(function (this: LanguageService, node: Node) {
    queries.push(JSON.stringify([node.getSourceFile().getFilePath(), node.getStart()]));
    return nativeFind.call(this, node);
  });
  let partition: ReturnType<typeof extractInventoryPartition>;
  try {
    partition = extractInventoryPartition({ root: scratch, descriptor, destination: join(scratch, "unused.sqlite") });
  } finally {
    observation.mockRestore();
  }
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
  expect(queries.length).toBeGreaterThan(0);
  expect(queries.length).toBe(new Set(queries).size);
});
