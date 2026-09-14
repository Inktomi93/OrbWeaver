// Strong collection-use proof is separate from the source-local explicit-write queries.

import { unprovenReferenceUse } from "@orb/tooling/_shared/reference-fact-writes";
import type { Node as MorphNode } from "ts-morph";
import { Node, Project, SyntaxKind } from "ts-morph";
import { expect, test } from "../../support/tool-fixtures.ts";

function query(files: Readonly<Record<string, string>>, source = "source.ts"): MorphNode | undefined {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(`/repo/${path}`, text);
  }
  const accepted = new Set<MorphNode>();
  for (const file of project.getSourceFiles()) {
    const sink = file.getVariableDeclaration("sink")?.getInitializer();
    const data = Node.isObjectLiteralExpression(sink) ? sink.getProperty("data") : undefined;
    if (Node.isPropertyAssignment(data)) {
      accepted.add(data.getInitializerOrThrow());
    }
  }
  const name = project.getSourceFileOrThrow(`/repo/${source}`).getVariableDeclarationOrThrow("VALUES").getNameNode().asKindOrThrow(SyntaxKind.Identifier);
  return unprovenReferenceUse(name, accepted);
}

test("const identity aliases reach exact endpoints; a spread copy can change without mutating its source", () => {
  expect(query({ "source.ts": "const VALUES = []; const ALIAS = (VALUES as readonly unknown[]); const sink = { data: ALIAS };" })).toBeUndefined();
  expect(query({ "source.ts": "const VALUES = []; const COPY = [...VALUES]; COPY.push(1); const sink = { data: VALUES };" })).toBeUndefined();
  expect(query({ "source.ts": "const VALUES = []; const ALIAS = VALUES; ALIAS.push(1); const sink = { data: VALUES };" })?.getText()).toBe("ALIAS");
});

for (const [name, extra] of [
  ["opaque argument", "opaque(VALUES);"],
  ["callback", "VALUES.map(() => 1);"],
  ["ordinary array storage", "const storage = [VALUES];"],
  ["object storage", "const storage = { data: VALUES };"],
  ["return", "function escape() { return VALUES; }"],
  ["explicit write", "VALUES.length = 1;"],
  ["mutable alias", "let mutable = VALUES;"],
] as const) {
  test(`unaccounted ${name} refuses even beside an accepted endpoint`, () => {
    expect(query({ "source.ts": `const VALUES = []; ${extra} const sink = { data: VALUES };` })).toBeDefined();
  });
}

for (const imported of ["import { VALUES } from './source.ts';", "import { OTHER as VALUES } from './barrel.ts';"]) {
  test(`compiler references preserve imported identity and catch its consumer mutation: ${imported}`, () => {
    const files = {
      "source.ts": "export const VALUES = [];",
      "barrel.ts": "export { VALUES as OTHER } from './source.ts';",
      "use.ts": `${imported} const sink = { data: VALUES };`,
    };
    expect(query(files)?.getText()).toBeUndefined();
    expect(query({ ...files, "use.ts": `${imported} const ALIAS = VALUES; opaque(ALIAS); const sink = { data: VALUES };` })?.getText()).toBe("ALIAS");
  });
}

test("erased types are harmless; initializer readability remains a separate query", () => {
  expect(query({ "source.ts": "const VALUES = []; type Shape = typeof VALUES; const sink = { data: VALUES };" })).toBeUndefined();
  expect(query({ "source.ts": "declare const VALUES: unknown; const sink = { data: VALUES };" })).toBeUndefined();
});
