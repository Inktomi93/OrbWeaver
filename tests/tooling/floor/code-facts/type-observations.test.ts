// @subject tooling/src/floor/code-facts/type-observations.ts
// @subject tooling/src/floor/code-facts/type-observations-codec.ts
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node as MorphNode, SourceFile, VariableDeclaration } from "ts-morph";
import { Project } from "ts-morph";
import { vi } from "vitest";
import type { InventorySpan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { assertInvocationEvidence, invocationQueryKey, spanSchema } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { captureTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations.ts";
import { encodeTypeObservations, replayTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations-codec.ts";
import type { NativeTypeObservations, TypeObservationDemand } from "../../../../tooling/src/floor/code-facts/type-observations-contract.ts";
import { TYPE_OBSERVATION_PROFILE } from "../../../../tooling/src/floor/code-facts/type-observations-contract.ts";
import { assertTypeObservationCoverage } from "../../../../tooling/src/floor/code-facts/type-observations-coverage.ts";
import { typeObservationsSchema } from "../../../../tooling/src/floor/code-facts/type-observations-inventory.ts";
import { readTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations-read.ts";
import { captureScalarTypeSelections, captureTypeSelections } from "../../../../tooling/src/floor/code-facts/type-projection.ts";
import { nodeTypeSelector, typeSelectorIndex } from "../../../../tooling/src/floor/code-facts/type-projection-contract.ts";
import { inventoryQueryNode } from "../../../../tooling/src/floor/compiler/drizzle-inventory-extract.ts";

function fixture(): {
  readonly project: Project;
  readonly source: SourceFile;
  readonly declaration: VariableDeclaration;
  readonly facts: NativeTypeObservations;
} {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, strict: true } });
  const source = project.createSourceFile(
    "/control.ts",
    'interface Box<T>{readonly _output:T;} declare function build():Box<"fixed">; export const chosen=build() satisfies Box<string>; const ordinary=1;',
  );
  const declaration = source.getVariableDeclarationOrThrow("chosen");
  const demand: TypeObservationDemand = { profile: TYPE_OBSERVATION_PROFILE, sources: [source], nodes: [declaration] };
  const facts = captureTypeObservations(demand, {
    anchor: source,
    admit: (node): void => {
      if (node.getProject() !== project) {
        throw new Error("foreign owner");
      }
    },
  });
  return { project, source, declaration, facts };
}
const span = (node: MorphNode): InventorySpan => ({
  file: node.getSourceFile().getFilePath(),
  start: node.getStart(),
  end: node.getEnd(),
  kind: node.getKind(),
});

test("scalar selectors omit vocabulary while preserving canonical identity, relation and first duplicate nomination", () => {
  const { source } = fixture();
  const selector = nodeTypeSelector(source.getVariableDeclarationOrThrow("ordinary"));
  const plan = { selectors: [selector, { ...selector }], relations: [{ left: 0, right: 1 }] };
  const scalar = captureScalarTypeSelections(plan);
  const full = captureTypeSelections(plan);
  expect(scalar.values).toEqual(
    full.values.map((value) => (value === null ? null : { any: value.any, unknown: value.unknown, identity: value.identity, display: value.display })),
  );
  expect(scalar.relations).toEqual(full.relations);
  expect(scalar.values[0]).not.toHaveProperty("vocabulary");
  expect(full.values[0]).toHaveProperty("vocabulary");
  expect(typeSelectorIndex(plan)({ ...selector })).toBe(0);
  expect(() => typeSelectorIndex(plan)(nodeTypeSelector(source))).toThrow("not captured");
});

test("fixed profile replay refuses missing nullable questions rather than inventing absence", () => {
  const { project, source, facts } = fixture();
  const wire = encodeTypeObservations(facts, span);
  const replay = (anchor: ReturnType<typeof span>): MorphNode => inventoryQueryNode(project.getSourceFile(anchor.file), anchor);
  const parsed = typeObservationsSchema(spanSchema).parse(wire);
  expect(() => typeObservationsSchema(spanSchema).parse({ ...wire, demand: { ...wire.demand, profile: "foreign" } })).toThrow();
  const restored = replayTypeObservations(parsed, replay);
  const readers = readTypeObservations(restored);
  const literal = source.getVariableDeclarationOrThrow("chosen").getInitializerOrThrow();
  expect(readers.select(nodeTypeSelector(literal, "contextual"))).toBeNull();
  const truncated = { ...restored, nodes: restored.nodes.filter(({ node }) => node !== literal) };
  expect(() => readTypeObservations(truncated)).toThrow("not captured");
  expect(() => typeObservationsSchema(spanSchema).parse({ ...wire, selections: null })).toThrow("selectors are missing");
  expect(() => readTypeObservations({ ...restored, selections: null })).toThrow("no registered selectors");
  expect(() => typeObservationsSchema(spanSchema).parse({ ...wire, types: undefined })).toThrow();
  expect(() => readers.select(nodeTypeSelector(source.getVariableDeclarationOrThrow("ordinary")))).toThrow("not captured");
});

test("native capture rejects foreign owners and delivered facts retain exact related-source epochs", () => {
  const { source, facts } = fixture();
  const readers = readTypeObservations(facts);
  const foreign = new Project({ useInMemoryFileSystem: true }).createSourceFile(source.getFilePath(), source.getFullText());
  expect(() => readers.symbol(foreign.getVariableDeclarationOrThrow("chosen"))).toThrow("foreign or stale");
  const symbol = readers.symbol(source.getVariableDeclarationOrThrow("chosen"));
  if (symbol === null) {
    throw new Error("chosen native symbol missing");
  }
  const another = readTypeObservations(facts);
  expect(() => another.symbolData(symbol)).toThrow("another capture/world/generation");
  source.addStatements("export const changed=1;");
  expect(() => readers.symbol(source.getVariableDeclarationOrThrow("chosen"))).toThrow("epoch is stale");
});

test("already-read scalar answers must belong to the exact ordered selector request and Program", () => {
  const { project, source } = fixture();
  const selector = nodeTypeSelector(source.getVariableDeclarationOrThrow("ordinary"));
  const plan = { selectors: [selector], relations: [] };
  const program = project.getProgram().compilerObject;
  const value = source.getVariableDeclarationOrThrow("ordinary").getType();
  expect(() => captureScalarTypeSelections(plan, { program, selectors: [{ ...selector }], values: [value] })).toThrow("foreign or changed Program");
  const foreign = new Project({ useInMemoryFileSystem: true }).createSourceFile("/foreign.ts", "const x=1;");
  expect(() =>
    captureScalarTypeSelections(plan, { program: foreign.getProject().getProgram().compilerObject, selectors: [selector], values: [value] }),
  ).toThrow("foreign or changed Program");
});

test("ordered nomination identity and empty anchored evidence cannot authorize foreign or later questions", () => {
  const { source, facts } = fixture();
  const first = source.getVariableDeclarationOrThrow("chosen");
  const second = source.getVariableDeclarationOrThrow("ordinary");
  const ordered: TypeObservationDemand<InventorySpan> = { profile: TYPE_OBSERVATION_PROFILE, sources: [span(source)], nodes: [span(first), span(second)] };
  const reverse = { ...ordered, nodes: [span(second), span(first)] };
  const plan = { mode: "types" as const, facets: [], arguments: [] };
  expect(invocationQueryKey({ ...plan, node: span(source), typeObservations: ordered })).not.toBe(
    invocationQueryKey({ ...plan, node: span(source), typeObservations: reverse }),
  );
  const wire = encodeTypeObservations(facts, span);
  expect(() =>
    assertInvocationEvidence({
      query: { ...plan, node: span(source), typeObservations: reverse },
      typeObservations: wire,
      invocation: null,
      callee: null,
      profiles: [],
      sources: [],
    }),
  ).toThrow("missing or foreign");
  const empty = captureTypeObservations({ profile: TYPE_OBSERVATION_PROFILE, sources: [source], nodes: [] }, { anchor: source, admit: () => undefined });
  expect(empty.selections).toBeNull();
  expect(empty.nodes).toEqual([]);
  const readers = readTypeObservations(empty);
  expect(readers.exports(source)).toHaveLength(1);
  expect(() => readers.symbol(first)).toThrow("not captured");
  expect(() => captureTypeObservations({ profile: TYPE_OBSERVATION_PROFILE, sources: [], nodes: [] }, { anchor: source, admit: () => undefined })).toThrow(
    "source anchor is foreign",
  );
});

test("the native profile retains unrequested contextual absence for non-output expressions", () => {
  const { source } = fixture();
  const ordinary = source.getVariableDeclarationOrThrow("ordinary");
  const literal = ordinary.getInitializerOrThrow();
  const contextual = vi.spyOn(literal, "getContextualType");
  const facts = captureTypeObservations(
    { profile: TYPE_OBSERVATION_PROFILE, sources: [source], nodes: [ordinary] },
    { anchor: source, admit: () => undefined },
  );
  expect(contextual).not.toHaveBeenCalled();
  expect(facts.nodes.find(({ node }) => node === literal)?.contextual).toEqual({ kind: "unrequested" });
  expect(() => readTypeObservations(facts).select(nodeTypeSelector(literal, "contextual"))).toThrow("not captured");
});

test("contextual metadata identifies its canonical base instead of argument, property or display selectors", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, strict: true } });
  const source = project.createSourceFile(
    "/contextual.ts",
    'interface Box<T>{readonly _output:T;}declare function build():Box<"fixed">;export const chosen:Box<string>=build();const orphan=build();const ordinary=1;',
  );
  const chosen = source.getVariableDeclarationOrThrow("chosen");
  const orphan = source.getVariableDeclarationOrThrow("orphan");
  const ordinary = source.getVariableDeclarationOrThrow("ordinary");
  const expression = chosen.getInitializerOrThrow();
  const facts = captureTypeObservations(
    { profile: TYPE_OBSERVATION_PROFILE, sources: [source], nodes: [chosen, orphan, ordinary] },
    { anchor: source, admit: () => undefined },
  );
  const selected = facts.selections;
  if (selected === null) {
    throw new Error("contextual Type selection controls missing");
  }
  const base = selected.plan.selectors.findIndex(
    (selector) => selector.base.kind === "contextual" && selector.base.node === expression && selector.steps.length === 0 && selector.displayAt === null,
  );
  expect(base).toBeGreaterThanOrEqual(0);
  expect(facts.nodes.find(({ node }) => node === expression)?.contextual).toEqual({ kind: "value", value: base });
  expect(facts.nodes.find(({ node }) => node === orphan.getInitializerOrThrow())?.contextual).toEqual({ kind: "absent" });
  expect(facts.nodes.find(({ node }) => node === ordinary.getInitializerOrThrow())?.contextual).toEqual({ kind: "unrequested" });
  const transformed = selected.plan.selectors
    .map((selector, index) => ({ selector, index }))
    .filter(
      ({ selector }) => selector.base.kind === "contextual" && selector.base.node === expression && (selector.steps.length > 0 || selector.displayAt !== null),
    );
  expect(transformed.some(({ selector }) => selector.steps.some((step) => step.kind === "type-argument"))).toBe(true);
  expect(transformed.some(({ selector }) => selector.steps.some((step) => step.kind === "property"))).toBe(true);
  expect(transformed.some(({ selector }) => selector.displayAt !== null)).toBe(true);
  const check = (input: typeof facts): void =>
    assertTypeObservationCoverage(
      input,
      (node) => JSON.stringify(span(node)),
      (node) => node.getKind(),
    );
  for (const { index } of transformed) {
    expect(() =>
      check({ ...facts, nodes: facts.nodes.map((entry) => (entry.node === expression ? { ...entry, contextual: { kind: "value", value: index } } : entry)) }),
    ).toThrow("contextual base");
  }
  for (const kind of ["absent", "unrequested"] as const) {
    expect(() => check({ ...facts, nodes: facts.nodes.map((entry) => (entry.node === expression ? { ...entry, contextual: { kind } } : entry)) })).toThrow(
      "contextual base",
    );
  }
  const selectors = selected.plan.selectors.map((selector, index) =>
    index === base ? { ...selector, base: { kind: "node" as const, node: expression } } : selector,
  );
  expect(() => check({ ...facts, selections: { ...selected, plan: { ...selected.plan, selectors } } })).toThrow("contextual base");
  expect(() => check(facts)).not.toThrow();
});
