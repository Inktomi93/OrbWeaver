import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import { captureTypeObservations, createTypeObservationCapture } from "../../../../tooling/src/floor/code-facts/type-observations.ts";
import { TYPE_OBSERVATION_PROFILE } from "../../../../tooling/src/floor/code-facts/type-observations-contract.ts";
import { readTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations-read.ts";
import { nodeTypeSelector } from "../../../../tooling/src/floor/code-facts/type-projection-contract.ts";

function fixture(text: string): { readonly source: import("ts-morph").SourceFile; readonly capture: ReturnType<typeof createTypeObservationCapture> } {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true } });
  const source = project.createSourceFile("/observations.ts", text);
  const capture = createTypeObservationCapture({ anchor: source, admit: () => undefined }, true);
  return { source, capture };
}

test("omitted-location display preserves the SDK's native default, including Promise arguments", () => {
  const { source, capture } = fixture("declare const held: Promise<never> | undefined;");
  const node = source.getVariableDeclarationOrThrow("held");
  const selector = nodeTypeSelector(node);
  expect(capture.reader.defaultDisplay(selector)).toBe(node.getType().getText());
  const parts = capture.reader.unions(selector);
  expect(parts.map((part) => capture.reader.defaultDisplay(part))).toEqual(
    node
      .getType()
      .getUnionTypes()
      .map((part) => part.getText()),
  );
  const promise = parts.find((part) => capture.reader.defaultDisplay(part).startsWith("Promise<"));
  if (promise === undefined) {
    throw new Error("native Promise arm is missing");
  }
  const argument = capture.reader.typeArguments(promise)[0];
  if (argument === undefined) {
    throw new Error("native Promise argument is missing");
  }
  const reference = capture.reader.select(argument);
  expect(reference !== null && capture.reader.type(reference).never).toBe(true);
});

test("raw literal values preserve SDK absence on boolean flags rather than inventing false", () => {
  const { source, capture } = fixture('declare const text: "failed"; declare const count: 3; declare const flag: false; declare const ordinary: string;');
  for (const name of ["text", "count", "flag", "ordinary"]) {
    const node = source.getVariableDeclarationOrThrow(name);
    expect(capture.reader.literalValue(nodeTypeSelector(node))).toEqual(node.getType().getLiteralValue());
  }
});

test("function export capture preserves renamed export lists and raw source-symbol identity", () => {
  const { source, capture } = fixture("function detached() {} function privateWork() {} export { detached as superviseDetached }; export function direct() {}");
  for (const fn of source.getFunctions()) {
    expect(capture.reader.functionExport(fn)).toBe(fn.isExported());
  }
});

test("persisted type-argument coverage refuses a truncated vector and unrequested display metadata", () => {
  const { source } = fixture("declare const held: Promise<never>; export function direct() {}");
  const node = source.getVariableDeclarationOrThrow("held");
  const facts = captureTypeObservations(
    {
      profile: TYPE_OBSERVATION_PROFILE,
      sources: [source],
      nodes: [],
      questions: [
        { kind: "type-details", nodes: [node] },
        { kind: "function-exports", nodes: source.getFunctions() },
      ],
    },
    { anchor: source, admit: () => undefined },
  );
  const reader = readTypeObservations(facts);
  const selector = nodeTypeSelector(node);
  expect(reader.defaultDisplay(selector)).toBe("Promise<never>");
  const selected = reader.select(selector);
  if (selected === null) {
    throw new Error("native Promise Type is absent");
  }
  expect
    .soft(() =>
      readTypeObservations({
        ...facts,
        types: facts.types.map((value, index) => (index === selected.index && value !== null ? { ...value, typeArguments: [] } : value)),
      }),
    )
    .toThrow("argument");
  const argument = reader.typeArguments(selector)[0];
  expect
    .soft(() =>
      readTypeObservations({
        ...facts,
        types: facts.types.map((value, index) => (index === selected.index && value !== null ? { ...value, typeArguments: [], typeArgumentCount: 0 } : value)),
      }),
    )
    .toThrow("argument");
  const reference = argument === undefined ? null : reader.select(argument);
  if (reference === null) {
    throw new Error("native Promise argument Type is absent");
  }
  expect
    .soft(() =>
      readTypeObservations({
        ...facts,
        types: facts.types.map((value, index) => (index === reference.index && value !== null ? { ...value, defaultDisplay: "never" } : value)),
      }),
    )
    .toThrow("foreign");
});
