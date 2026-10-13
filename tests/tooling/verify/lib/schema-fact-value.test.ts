import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Expression } from "ts-morph";
import { Project } from "ts-morph";
import { objectEntries, SchemaRefusal, terminalCall } from "../../../../tooling/src/floor/code-facts/schema-value.ts";

function namespaceReference(source: string): Expression {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile("/builder-origin/builders.ts", source);
  const consumer = project.createSourceFile("/builder-origin/consumer.ts", 'import * as builders from "./builders.ts"; const reference = builders.builder;');
  return consumer.getVariableDeclarationOrThrow("reference").getInitializerOrThrow();
}

test("an immutable namespace-exported builder resolves to its authored call", () => {
  const reference = namespaceReference("declare function build(): object; export const builder = build();");
  const fact = terminalCall(reference);
  expect(fact.kind).toBe("resolved");
  if (fact.kind !== "resolved") {
    throw new Error(fact.detail);
  }
  expect(fact.value.getText()).toBe("build()");
  expect(fact.value.getSourceFile().getFilePath()).toBe("/builder-origin/builders.ts");
});

for (const source of [
  "declare function build(): object; export let builder = build();",
  "declare function build(): object; export const builder = build(); builder = build();",
]) {
  test(`a namespace-exported unstable binding refuses instead of borrowing its original call: ${source}`, () => {
    expect(terminalCall(namespaceReference(source))).toMatchObject({ kind: "unresolved", reason: "write" });
  });
}

test("namespace-exported cyclic aliases remain unreadable rather than inventing a builder origin", () => {
  const reference = namespaceReference("export const builder: object = other; export const other: object = builder;");
  expect(terminalCall(reference)).toMatchObject({ kind: "unresolved" });
});

test("a local alias cycle retains its explicit cycle refusal", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile("/local-builder-cycle.ts", "const first: object = second; const second: object = first; const reference = first;");
  expect(terminalCall(source.getVariableDeclarationOrThrow("reference").getInitializerOrThrow())).toMatchObject({ kind: "unresolved", reason: "cycle" });
});

test("semantic keys preserve literal, template, immutable string, and plain numeric names", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/semantic-member-keys.ts",
    'const key = "bound"; const members = { ["literal"]: 1, [`template`]: 2, [key]: 3, 7: 4 };',
  );
  expect(objectEntries(source.getVariableDeclarationOrThrow("members").getInitializerOrThrow(), "members").map((entry) => entry.name)).toEqual([
    "literal",
    "template",
    "bound",
    "7",
  ]);
});

for (const sourceText of ["const members = { [7]: 1 };", "const key = 7; const members = { [key]: 1 };"]) {
  test(`semantic keys refuse computed numbers at their scalar origin: ${sourceText}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile("/semantic-member-keys.ts", sourceText);
    const members = source.getVariableDeclarationOrThrow("members").getInitializerOrThrow();
    const refusal = ((): SchemaRefusal => {
      try {
        objectEntries(members, "members");
      } catch (error) {
        if (error instanceof SchemaRefusal) {
          return error;
        }
        throw error;
      }
      throw new Error("a computed numeric member was admitted");
    })();
    expect(refusal.message).toMatch(/computed schema member: authored scalar is not a string/u);
    expect(refusal.fact.reason).toBe("unsupported");
    expect(refusal.fact.node.getText()).toBe("7");
    expect(refusal.fact.node.getStart()).toBe(sourceText.indexOf("7"));
    expect(refusal.fact.trace.declarations.map((node) => node.getText())).toEqual(sourceText.startsWith("const key") ? ["key = 7"] : []);
  });
}
