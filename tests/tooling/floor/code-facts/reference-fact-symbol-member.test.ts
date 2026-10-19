import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { beginReferencePass, endReferencePass } from "@orb/tooling/floor/code-facts/reference-fact";
import { Project, SyntaxKind } from "ts-morph";
import { readSymbolMemberValue } from "../../../../tooling/src/floor/code-facts/reference-fact-symbol-member.ts";
import { scaledBudget } from "../../_load-budget.ts";

test("native symbol members resolve actual arrows/methods through aliases and ignore contextual signatures", { timeout: scaledBudget(30_000) }, ({
  repoRoot,
}) => {
  const project = new Project({ tsConfigFilePath: join(repoRoot, "packages/server/tsconfig.json"), skipAddingFilesFromTsConfig: true });
  const file = project.createSourceFile(join(repoRoot, "packages/server/src/entry/compose/__symbol-member.ts"), "");
  const read = (source: string): ReturnType<typeof readSymbolMemberValue> => {
    file.replaceWithText(`export {};\n${source}`);
    const member = file.getDescendantsOfKind(SyntaxKind.ElementAccessExpression).at(-1);
    if (member === undefined) {
      throw new Error("symbol-member control omitted its actual member read");
    }
    beginReferencePass();
    try {
      return readSymbolMemberValue(member);
    } finally {
      endReferencePass();
    }
  };
  for (const source of [
    'const owner = { [Symbol.asyncDispose]: () => "actual" }; const result = owner[Symbol.asyncDispose];',
    "const owner: AsyncDisposable = { [Symbol.asyncDispose]: async () => {} }; const alias = owner; const result = alias[Symbol.asyncDispose];",
    'const owner = { [Symbol.asyncDispose]: () => "actual" }; const alias = owner; const { asyncDispose: key } = Symbol; const result = alias[key];',
  ]) {
    const value = read(source);
    expect(value.kind).toBe("resolved");
    if (value.kind === "unresolved") {
      throw new Error(value.detail);
    }
    expect(value.value).toBe(file.getDescendantsOfKind(SyntaxKind.ArrowFunction)[0]);
  }
  const method = read('const owner = { [Symbol.asyncDispose]() { return "actual"; } }; const result = owner[Symbol.asyncDispose];');
  expect(method.kind).toBe("resolved");
  if (method.kind === "unresolved") {
    throw new Error(method.detail);
  }
  expect(method.value).toBe(file.getDescendantsOfKind(SyntaxKind.MethodDeclaration)[0]);
  expect(
    read("function use(owner: AsyncDisposable) { const actual = { [Symbol.asyncDispose]: async () => {} }; return owner[Symbol.asyncDispose]; }"),
  ).toMatchObject({ kind: "unresolved", reason: "missing" });
  expect(
    read('const Symbol = { asyncDispose: "dispose" }; const owner = { dispose: () => "wrong" }; const result = owner[Symbol.asyncDispose];'),
  ).toMatchObject({ kind: "unresolved", reason: "dynamic" });
  expect(
    read(
      'const owner = { [Symbol.asyncDispose]: () => "old" }; const alias = owner; alias[Symbol.asyncDispose] = () => "new"; const result = owner[Symbol.asyncDispose];',
    ),
  ).toMatchObject({ kind: "unresolved", reason: "write" });
  expect(read('function use(key: typeof Symbol.asyncDispose) { const owner = { [Symbol.asyncDispose]: () => "actual" }; return owner[key]; }')).toMatchObject({
    kind: "unresolved",
    reason: "missing",
  });
});
