// @subject tooling/src/floor/code-facts/type-observation-questions.ts
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node as MorphNode } from "ts-morph";
import { Project } from "ts-morph";
import { vi } from "vitest";
import type { InventorySpan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { spanSchema } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { observedTypePropertyOrigin, uncastReceiver } from "../../../../tooling/src/floor/code-facts/type-member-origin-core.ts";
import { captureTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations.ts";
import { encodeTypeObservations, replayTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations-codec.ts";
import type { TypeObservationDemand } from "../../../../tooling/src/floor/code-facts/type-observations-contract.ts";
import { TYPE_OBSERVATION_PROFILE, typeObservationNeedsSourceBindings } from "../../../../tooling/src/floor/code-facts/type-observations-contract.ts";
import { typeObservationsSchema } from "../../../../tooling/src/floor/code-facts/type-observations-inventory.ts";
import { readTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations-read.ts";
import { nodeTypeSelector } from "../../../../tooling/src/floor/code-facts/type-projection-contract.ts";
import { inventoryQueryNode } from "../../../../tooling/src/floor/compiler/drizzle-inventory-extract.ts";

const span = (node: MorphNode): InventorySpan => ({
  file: node.getSourceFile().getFilePath(),
  start: node.getStart(),
  end: node.getEnd(),
  kind: node.getKind(),
});

test("closed const nominations preserve cast and uncast member origins, call terminals and the four-hop boundary", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, strict: true } });
  project.createSourceFile("/other.ts", "export const external=1;");
  const source = project.createSourceFile(
    "/const.ts",
    `
    import {external} from "./other";
    interface Native {run():void} declare function make():Native;
    const first=(make() as {run():void});const second=first;const third=second;const fourth=third;const fifth=fourth;
    let mutable=make();const ordinary=99;second.run();fifth.run();mutable.run();external;
  `,
  );
  const root = source.getVariableDeclarationOrThrow("third").getInitializerOrThrow();
  const asserted = source.getVariableDeclarationOrThrow("first").getInitializerOrThrow();
  const fifth = source.getVariableDeclarationOrThrow("fifth").getNameNode();
  const mutable = source.getVariableDeclarationOrThrow("mutable").getNameNode();
  const imported = source.getImportDeclarations()[0]?.getNamedImports()[0]?.getNameNode();
  if (imported === undefined) {
    throw new Error("const fixture has no import terminal");
  }
  const demand: TypeObservationDemand = {
    profile: TYPE_OBSERVATION_PROFILE,
    sources: [source],
    nodes: [],
    questions: [{ kind: "const-initializers", nodes: [root, fifth, mutable, imported, asserted], properties: ["run", "missing"] }],
  };
  const facts = captureTypeObservations(demand, { anchor: source, admit: () => undefined });
  expect(facts.constInitializers?.map(({ values }) => values.map((node) => node.getText()))).toEqual([
    ["second", "first", "make()"],
    ["fifth", "fourth", "third", "second", "first"],
    ["mutable"],
    ["external"],
    ["(make() as {run():void})", "make()"],
  ]);
  const wire = typeObservationsSchema(spanSchema).parse(encodeTypeObservations(facts, span));
  const read = readTypeObservations(replayTypeObservations(wire, (value) => inventoryQueryNode(project.getSourceFile(value.file), value)));
  const raw = readTypeObservations(facts);
  const declarations = (node: MorphNode): readonly MorphNode[] => {
    const symbol = read.symbol(node);
    return symbol === null ? [] : read.symbolData(symbol).declarations;
  };
  const terminal = uncastReceiver(root, declarations);
  expect(terminal.getText()).toBe("make()");
  const cast = observedTypePropertyOrigin(asserted, "run", read);
  const uncast = observedTypePropertyOrigin(terminal, "run", read);
  expect(cast.kind === "resolved" && cast.value[0]?.getParent()?.getKindName()).toBe("TypeLiteral");
  expect(uncast.kind === "resolved" && uncast.value).toEqual([source.getInterfaceOrThrow("Native").getMethodOrThrow("run")]);
  expect(observedTypePropertyOrigin(root, "missing", read).kind).toBe("unresolved");
  expect(() => observedTypePropertyOrigin(root, "unrequested", read)).toThrow("not captured");
  expect(() => read.symbol(source.getVariableDeclarationOrThrow("ordinary"))).toThrow("not captured");
  const symbol = raw.symbol(root);
  if (symbol === null) {
    throw new Error("const root has no symbol");
  }
  expect(() => read.symbolData(symbol)).toThrow("another capture/world/generation");
  expect(() => read.select({ ...nodeTypeSelector(root), steps: [] })).not.toThrow();
  source.replaceWithText(source.getFullText());
  expect(() => raw.symbol(root)).toThrow("epoch");
});

test("const nomination wire and replay reject missing, reordered and foreign paths rather than widening the cohort", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true } });
  const source = project.createSourceFile("/closed.ts", "const first={run(){}};const second=first;const root=second;const unrelated=3;");
  const root = source.getVariableDeclarationOrThrow("root").getInitializerOrThrow();
  const demand: TypeObservationDemand = {
    profile: TYPE_OBSERVATION_PROFILE,
    sources: [source],
    nodes: [],
    questions: [{ kind: "const-initializers", nodes: [root], properties: ["run"] }],
  };
  const facts = captureTypeObservations(demand, { anchor: source, admit: () => undefined });
  const wire = encodeTypeObservations(facts, span);
  expect(() => typeObservationsSchema(spanSchema).parse({ ...wire, constInitializers: undefined })).toThrow("missing or unrequested");
  expect(() => typeObservationsSchema(spanSchema).parse({ ...wire, propertySymbols: [] })).toThrow("coverage is missing");
  expect(() =>
    readTypeObservations({ ...facts, constInitializers: facts.constInitializers?.map((row) => ({ ...row, values: row.values.slice(0, 1) })) }),
  ).toThrow("relationships");
  expect(() =>
    readTypeObservations({ ...facts, constInitializers: facts.constInitializers?.map((row) => ({ ...row, values: row.values.toReversed() })) }),
  ).toThrow("relationships");
  const foreign = project.createSourceFile("/foreign.ts", "const value=1;").getVariableDeclarationOrThrow("value");
  expect(() => readTypeObservations(facts).symbol(foreign)).toThrow("foreign");
  const reader = readTypeObservations(facts);
  const forgotten = vi.spyOn(source, "wasForgotten").mockReturnValue(true);
  try {
    expect(() => reader.symbol(root)).toThrow("epoch");
  } finally {
    forgotten.mockRestore();
  }
});

test("const-only origin attachments do not request source bindings, but merged existing callback demands retain them", () => {
  const demand: TypeObservationDemand<object> = {
    profile: TYPE_OBSERVATION_PROFILE,
    sources: [],
    nodes: [],
    questions: [{ kind: "const-initializers", nodes: [], valueFacets: ["module", "global"] }],
  };
  expect(typeObservationNeedsSourceBindings(demand)).toBe(false);
  expect(
    typeObservationNeedsSourceBindings({ ...demand, questions: [...(demand.questions ?? []), { kind: "value-profiles", nodes: [], valueFacets: ["module"] }] }),
  ).toBe(true);
  expect(typeObservationNeedsSourceBindings({ ...demand, questions: [{ kind: "const-initializers", nodes: [], valueFacets: ["stable"] }] })).toBe(true);
});
