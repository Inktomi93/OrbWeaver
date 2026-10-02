import type { Expression } from "ts-morph";
import { Project } from "ts-morph";
import { terminalCall } from "../../../../tooling/src/verify/lib/schema-fact-value.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

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
