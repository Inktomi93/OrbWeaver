// @subject tooling/src/floor/code-facts/type-observations.ts
// @subject tooling/src/floor/code-facts/type-observations-codec.ts
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node as MorphNode, SourceFile, VariableDeclaration } from "ts-morph";
import { Node, Project, SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import type { InventorySpan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { assertInvocationEvidence, invocationQueryKey, spanSchema } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { captureTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations.ts";
import { encodeTypeObservations, mapTypeObservationDemand, replayTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations-codec.ts";
import type { NativeTypeObservations, TypeObservationDemand } from "../../../../tooling/src/floor/code-facts/type-observations-contract.ts";
import { TYPE_OBSERVATION_PROFILE } from "../../../../tooling/src/floor/code-facts/type-observations-contract.ts";
import { assertTypeObservationCoverage } from "../../../../tooling/src/floor/code-facts/type-observations-coverage.ts";
import { typeObservationsSchema } from "../../../../tooling/src/floor/code-facts/type-observations-inventory.ts";
import { readTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations-read.ts";
import { captureScalarTypeSelections, captureTypeSelections } from "../../../../tooling/src/floor/code-facts/type-projection.ts";
import { nodeTypeSelector, typeSelectorIndex } from "../../../../tooling/src/floor/code-facts/type-projection-contract.ts";
import { inventoryQueryNode } from "../../../../tooling/src/floor/compiler/drizzle-inventory-extract.ts";
import { captureInvocationEvidence, encodeInvocationEvidence } from "../../../../tooling/src/floor/compiler/invocation-evidence-extract.ts";

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

test("raw value nominations retain the definition capture and refuse missing, foreign or changed facets", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true } });
  const related = project.createSourceFile("/related.ts", 'export const target="object";export const held=target;');
  const source = project.createSourceFile("/root.ts", 'import{held}from"./related";const chosen=held;');
  const node = source.getVariableDeclarationOrThrow("chosen").getInitializerOrThrow();
  const demand: TypeObservationDemand = {
    profile: TYPE_OBSERVATION_PROFILE,
    sources: [source],
    nodes: [],
    questions: [
      { kind: "definition-closure", nodes: [node], files: [source.getFilePath(), related.getFilePath()], valueFacets: ["string"] },
      { kind: "value-profiles", nodes: [node], valueFacets: ["string"] },
    ],
  };
  const plan = { mode: "types" as const, facets: [], arguments: [], typeObservations: mapTypeObservationDemand(demand, span) };
  const evidence = captureInvocationEvidence(source, plan, undefined, demand);
  const target = related.getVariableDeclarationOrThrow("target").getInitializerOrThrow();
  expect(evidence.strings.get(node)?.kind).toBe("resolved");
  expect(evidence.strings.get(target)?.kind).toBe("resolved");
  const wire = encodeInvocationEvidence(source, plan, evidence, span);
  expect(() => assertInvocationEvidence(wire)).not.toThrow();
  expect(() => assertInvocationEvidence({ ...wire, profiles: wire.profiles.map((row) => ({ ...row, string: undefined })) })).toThrow("facet coverage");
  const facts = evidence.typeObservations;
  if (facts === undefined) {
    throw new Error("raw value fixture has no type capture");
  }
  expect(() => readTypeObservations({ ...facts, valueProfiles: facts.valueProfiles?.filter((row) => row.node !== target) })).toThrow("nomination coverage");
  expect(() => readTypeObservations({ ...facts, valueProfiles: facts.valueProfiles?.map((row) => ({ ...row, facets: ["stable"] })) })).toThrow(
    "nomination coverage",
  );
  const changed = {
    ...plan,
    typeObservations: { ...plan.typeObservations, questions: plan.typeObservations.questions?.map((q) => ({ ...q, valueFacets: ["stable" as const] })) },
  };
  expect(invocationQueryKey({ ...changed, node: span(source) })).not.toBe(invocationQueryKey({ ...plan, node: span(source) }));
  expect(() => assertInvocationEvidence({ ...wire, query: { ...changed, node: span(source) } })).toThrow("missing or foreign");
  expect(fixture().facts.valueProfiles).toBeUndefined();
  related.replaceWithText(related.getFullText());
  expect(() => facts.assertNode(node)).toThrow("epoch is stale");
});

test("raw questions preserve instantiated parameters, merged definitions, literal values and exact value declarations", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, strict: true } });
  const source = project.createSourceFile(
    "/raw.ts",
    'interface Merged {safe:string} interface Merged {apiKey:string} type Event={type:"node"}|{type:"stable"}; declare function send<T>(event:T):void; declare const emit:(event:Event)=>void; declare const held:Event; declare const merged:Merged; send<Event>(held);',
  );
  const call = source.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
  const name = source.getVariableDeclarationOrThrow("merged").getTypeNodeOrThrow();
  if (call === undefined || !Node.isTypeReference(name) || !Node.isIdentifier(name.getTypeName())) {
    throw new Error("raw fixture nodes missing");
  }
  const identifier = name.getTypeName();
  const held = source.getVariableDeclarationOrThrow("held");
  const emit = source.getVariableDeclarationOrThrow("emit");
  const demand: TypeObservationDemand = {
    profile: TYPE_OBSERVATION_PROFILE,
    sources: [source],
    nodes: [],
    questions: [
      { kind: "node-types", properties: ["type"], nodes: [held] },
      { kind: "definition-nodes", nodes: [identifier] },
      { kind: "call-parameters", properties: ["type"], nodes: [call] },
      { kind: "signature-parameters", properties: ["type"], nodes: [emit] },
      { kind: "symbol-values", properties: ["type"], nodes: [held.getNameNode()] },
    ],
  };
  const facts = captureTypeObservations(demand, { anchor: source, admit: () => undefined });
  const wire = typeObservationsSchema(spanSchema).parse(encodeTypeObservations(facts, span));
  const restored = replayTypeObservations(wire, (anchor) => inventoryQueryNode(project.getSourceFile(anchor.file), anchor));
  const readers = readTypeObservations(restored);
  expect(readers.definitions(identifier).map((node) => node.getText())).toEqual(["interface Merged {safe:string}", "interface Merged {apiKey:string}"]);
  const actual = readers.callParameters(call)?.[0];
  const signature = readers.signatureParameters({ ...nodeTypeSelector(emit), steps: [{ kind: "nonnullable" }] }, emit)[0]?.[0];
  if (actual === undefined || signature === undefined) {
    throw new Error("native signature parameter missing");
  }
  const discriminators = (selector: typeof actual): readonly (string | null)[] =>
    readers
      .unions({
        ...selector,
        steps: [...selector.steps, { kind: "property", name: "type", at: selector.base.kind === "schema-column" ? source : selector.base.node }],
      })
      .map((part) => readers.literal(part));
  expect(discriminators(actual)).toEqual(["node", "stable"]);
  expect(discriminators(signature)).toEqual(["node", "stable"]);
  const heldRef = readers.select(nodeTypeSelector(held));
  const heldSymbol = readers.symbol(held.getNameNode());
  if (heldRef === null || heldSymbol === null) {
    throw new Error("held native identity missing");
  }
  expect(readers.type(heldRef).aliasSymbol).not.toBeNull();
  expect(readers.valueDeclaration(heldSymbol)).toBe(held);
  expect(() => readTypeObservations({ ...restored, callParameters: [] })).toThrow("not captured");
  expect(() => typeObservationsSchema(spanSchema).parse({ ...wire, callParameters: [] })).toThrow("coverage is missing");
  expect(() =>
    typeObservationsSchema(spanSchema).parse({ ...wire, signatureParameters: wire.signatureParameters?.map((row) => ({ ...row, values: [[999_999]] })) }),
  ).toThrow();
  expect(() => readTypeObservations({ ...restored, definitions: [] })).toThrow("not captured");
  expect(() => readers.callParameters(source)).toThrow("not captured");
  const capturedReader = readTypeObservations(facts);
  source.addStatements("const changed=1;");
  expect(() => capturedReader.callParameters(call)).toThrow("epoch");
});

test("definition closure refuses an omitted nested question and changed roster reuse without widening foreign edges", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, strict: true } });
  const source = project.createSourceFile("/root.ts", 'import type{Outer}from"./shared";export type Event=Outer;');
  const shared = project.createSourceFile("/shared.ts", 'import type{Nested}from"./nested";export interface Outer extends Nested {}');
  project.createSourceFile("/nested.ts", "export interface Nested {apiKey:string}");
  const reference = source.getTypeAliasOrThrow("Event").getTypeNodeOrThrow();
  if (!Node.isTypeReference(reference)) {
    throw new Error("root type reference missing");
  }
  const root = reference.getTypeName();
  const demand: TypeObservationDemand = {
    profile: TYPE_OBSERVATION_PROFILE,
    sources: [source],
    nodes: [],
    questions: [{ kind: "definition-closure", nodes: [root], files: ["/root.ts", "/shared.ts", "/nested.ts"] }],
  };
  const facts = captureTypeObservations(demand, { anchor: source, admit: () => undefined });
  const nested = shared.getInterfaceOrThrow("Outer").getExtends()[0]?.getExpression();
  if (nested === undefined) {
    throw new Error("nested reference missing");
  }
  expect(
    readTypeObservations(facts)
      .definitions(nested)
      .map((node) => node.getKindName()),
  ).toEqual(["InterfaceDeclaration"]);
  expect(() => readTypeObservations({ ...facts, definitions: facts.definitions?.filter((row) => row.node !== nested) })).toThrow("not captured");
  const plan = { mode: "types" as const, facets: [], arguments: [], node: span(source), typeObservations: encodeTypeObservations(facts, span).demand };
  const changed = {
    ...plan,
    typeObservations: { ...plan.typeObservations, questions: plan.typeObservations.questions?.map((q) => ({ ...q, files: ["/root.ts"] })) },
  };
  expect(invocationQueryKey(plan)).not.toBe(invocationQueryKey(changed));
  expect(() =>
    assertInvocationEvidence({
      query: changed,
      typeObservations: encodeTypeObservations(facts, span),
      invocation: null,
      callee: null,
      profiles: [],
      sources: [],
    }),
  ).toThrow("missing or foreign");
  const bounded = captureTypeObservations(
    { ...demand, questions: [{ kind: "definition-closure", nodes: [root], files: ["/root.ts"] }] },
    { anchor: source, admit: () => undefined },
  );
  expect(readTypeObservations(bounded).definitions(root)).toHaveLength(1);
  expect(() => readTypeObservations(bounded).definitions(nested)).toThrow("not captured");
  const ordinary = fixture().facts;
  expect(encodeTypeObservations(ordinary, span)).not.toHaveProperty("definitions");
  expect(ordinary.types.every((value) => value === null || !("stringLiteral" in value))).toBe(true);
  expect(ordinary.symbols.every((value) => !("valueDeclaration" in value))).toBe(true);
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

test("raw parameter vectors refuse truncated native order while preserving real empty answers", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true } });
  const source = project.createSourceFile(
    "/parameter-shapes.ts",
    'declare function send(first:"first",second:"second"):void;declare function zero():void;declare const emit:{(left:"left",right:"right"):void;(only:"only"):void;():void};declare const plain:{safe:true};send("first","second");zero();',
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const call = calls[0];
  const emit = source.getVariableDeclarationOrThrow("emit");
  const plain = source.getVariableDeclarationOrThrow("plain");
  if (call === undefined) {
    throw new Error("parameter shape call missing");
  }
  const demand: TypeObservationDemand = {
    profile: TYPE_OBSERVATION_PROFILE,
    sources: [source],
    nodes: [],
    questions: [
      { kind: "call-parameters", nodes: calls },
      { kind: "signature-parameters", nodes: [emit, plain] },
    ],
  };
  const facts = captureTypeObservations(demand, { anchor: source, admit: () => undefined });
  const wire = typeObservationsSchema(spanSchema).parse(encodeTypeObservations(facts, span));
  expect(wire.callParameters?.map((row) => row.parameterCount)).toEqual([2, 0]);
  expect(wire.signatureParameters?.map((row) => row.parameterCounts)).toEqual([[2, 1, 0], []]);
  const replay = (node: InventorySpan): MorphNode => inventoryQueryNode(project.getSourceFile(node.file), node);
  const read = readTypeObservations(replayTypeObservations(wire, replay));
  expect(read.callParameters(call)?.map(read.literal)).toEqual(["first", "second"]);
  const zero = calls[1];
  if (zero === undefined) {
    throw new Error("zero-arity call missing");
  }
  expect(read.callParameters(zero)).toEqual([]);
  const selected = (node: MorphNode): ReturnType<typeof nodeTypeSelector> => ({ ...nodeTypeSelector(node), steps: [{ kind: "nonnullable" }] });
  expect(read.signatureParameters(selected(emit), emit).map((parameters) => parameters.map(read.literal))).toEqual([["left", "right"], ["only"], []]);
  expect(read.signatureParameters(selected(plain), plain)).toEqual([]);
  const callRow = wire.callParameters?.[0];
  const signatureRow = wire.signatureParameters?.[0];
  if (callRow?.values === null || callRow?.values === undefined || signatureRow === undefined) {
    throw new Error("nonempty parameter shape missing");
  }
  const callsWith = (values: readonly number[] | null): typeof wire => ({
    ...wire,
    callParameters: wire.callParameters?.map((row, index) => (index === 0 ? { ...row, values } : row)),
  });
  const signaturesWith = (values: readonly (readonly number[])[]): typeof wire => ({
    ...wire,
    signatureParameters: wire.signatureParameters?.map((row, index) => (index === 0 ? { ...row, values } : row)),
  });
  const first = signatureRow.values[0];
  if (first === undefined) {
    throw new Error("ordered signature shape missing");
  }
  const corruptions = [
    callsWith(callRow.values.slice(0, -1)),
    callsWith([]),
    callsWith(null),
    signaturesWith(signatureRow.values.slice(0, -1)),
    signaturesWith([]),
    signaturesWith(signatureRow.values.map((values, index) => (index === 0 ? values.slice(0, -1) : values))),
    signaturesWith(signatureRow.values.map((values, index) => (index === 0 ? [] : values))),
  ];
  expect(corruptions.map((input) => typeObservationsSchema(spanSchema).safeParse(input).success)).toEqual(corruptions.map(() => false));
  for (const malformed of [
    { ...wire, callParameters: wire.callParameters?.map((row) => ({ ...row, parameterCount: undefined })) },
    { ...wire, callParameters: wire.callParameters?.map((row) => ({ ...row, parameterCount: -1 })) },
    { ...wire, signatureParameters: wire.signatureParameters?.map((row) => ({ ...row, parameterCounts: undefined })) },
    { ...wire, signatureParameters: wire.signatureParameters?.map((row) => ({ ...row, parameterCounts: [Number.NaN] })) },
  ]) {
    expect(typeObservationsSchema(spanSchema).safeParse(malformed).success).toBe(false);
  }
  expect(() =>
    readTypeObservations(
      replayTypeObservations(
        { ...wire, callParameters: wire.callParameters?.map((row, index) => (index === 0 ? { ...row, parameterCount: 0, values: [] } : row)) },
        replay,
      ),
    ),
  ).toThrow("parameter selector coverage");
  for (const input of corruptions) {
    expect(() => readTypeObservations(replayTypeObservations(input, replay))).toThrow();
  }
  expect(
    typeObservationsSchema(spanSchema).safeParse({ ...wire, callParameters: wire.callParameters?.map((row) => ({ ...row, values: undefined })) }).success,
  ).toBe(false);
  expect(
    typeObservationsSchema(spanSchema).safeParse({ ...wire, signatureParameters: wire.signatureParameters?.map((row) => ({ ...row, values: null })) }).success,
  ).toBe(false);
});

test("public selection captures admit exact signature parameter locations before native lookup", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true } });
  const source = project.createSourceFile("/signature-owner.ts", 'declare const callable:(value:"local")=>void;const at=1;');
  const base = source.getVariableDeclarationOrThrow("callable").getNameNode();
  const at = source.getVariableDeclarationOrThrow("at").getNameNode();
  const foreign = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true } })
    .createSourceFile(source.getFilePath(), source.getFullText())
    .getVariableDeclarationOrThrow("at")
    .getNameNode();
  const plan = (location: MorphNode): Parameters<typeof captureTypeSelections>[0] => ({
    selectors: [{ ...nodeTypeSelector(base), steps: [{ kind: "signature-parameter", signature: 0, index: 0, at: location }] }],
    relations: [],
  });
  for (const capture of [captureTypeSelections, captureScalarTypeSelections]) {
    expect(capture(plan(at)).values[0]).not.toBeNull();
  }
  const refused = [captureTypeSelections, captureScalarTypeSelections].map((capture) => {
    try {
      capture(plan(foreign));
      return false;
    } catch (error) {
      if (error instanceof Error && error.message.includes("foreign or changed Program/source epoch")) {
        return true;
      }
      throw error;
    }
  });
  expect(refused).toEqual([true, true]);
});

test("raw call parameter absence remains distinct from a true zero-arity answer", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true } });
  const source = project.createSourceFile("/missing-signature.ts", "declare function target():void;target();");
  const call = source.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
  if (call === undefined) {
    throw new Error("absent signature call missing");
  }
  const unavailable = vi.spyOn(project.getTypeChecker(), "getResolvedSignature").mockReturnValue(undefined);
  try {
    const facts = captureTypeObservations(
      { profile: TYPE_OBSERVATION_PROFILE, sources: [source], nodes: [], questions: [{ kind: "call-parameters", nodes: [call] }] },
      { anchor: source, admit: () => undefined },
    );
    const wire = typeObservationsSchema(spanSchema).parse(encodeTypeObservations(facts, span));
    expect(wire.callParameters).toEqual([{ call: span(call), parameterCount: null, values: null }]);
    const restored = replayTypeObservations(wire, (node) => inventoryQueryNode(project.getSourceFile(node.file), node));
    expect(readTypeObservations(restored).callParameters(call)).toBeNull();
    expect(() => readTypeObservations({ ...restored, callParameters: restored.callParameters?.map((row) => ({ ...row, values: [] })) })).toThrow(
      "call parameter coverage",
    );
  } finally {
    unavailable.mockRestore();
  }
});

test("finite raw primitive and named-property questions preserve union arms, absence and corruption refusal", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, strict: true } });
  const source = project.createSourceFile(
    "/primitive-properties.ts",
    'interface First {className:string} interface Second {setAttribute(name:string,value:string):void} declare const target:First|Second|null;declare const value:"yes"|42|true|null;',
  );
  const target = source.getVariableDeclarationOrThrow("target");
  const value = source.getVariableDeclarationOrThrow("value");
  const demand: TypeObservationDemand = {
    profile: TYPE_OBSERVATION_PROFILE,
    sources: [source],
    nodes: [],
    questions: [
      { kind: "property-symbols", nodes: [target], properties: ["className", "setAttribute"] },
      { kind: "literal-values", nodes: [value] },
    ],
  };
  const facts = captureTypeObservations(demand, { anchor: source, admit: () => undefined });
  const wire = typeObservationsSchema(spanSchema).parse(encodeTypeObservations(facts, span));
  const replay = (node: InventorySpan): MorphNode => inventoryQueryNode(project.getSourceFile(node.file), node);
  const read = readTypeObservations(replayTypeObservations(wire, replay));
  const parts = read.unions(nodeTypeSelector(target));
  const classNames = parts
    .map((part) => read.propertySymbol(part, "className"))
    .filter((symbol) => symbol !== null)
    .flatMap((symbol) => read.symbolData(symbol).declarations);
  expect(classNames).toEqual([source.getInterfaceOrThrow("First").getPropertyOrThrow("className")]);
  expect(parts.filter((part) => read.propertySymbol(part, "className") === null)).toHaveLength(2);
  expect(read.unions(nodeTypeSelector(value)).map(read.literalValue)).toEqual(
    value
      .getType()
      .getUnionTypes()
      .map((part) => part.getLiteralValue()),
  );
  expect(read.unions(nodeTypeSelector(value)).map((part) => read.primitiveFlags(part).null)).toEqual(
    value
      .getType()
      .getUnionTypes()
      .map((part) => part.isNull()),
  );
  expect(() => read.propertySymbol(nodeTypeSelector(target), "missing")).toThrow("not captured");
  expect(() => read.primitiveFlags(nodeTypeSelector(source))).toThrow("not captured");
  expect(() => typeObservationsSchema(spanSchema).parse({ ...wire, propertySymbols: [] })).toThrow("coverage is missing");
  expect(() => typeObservationsSchema(spanSchema).parse({ ...wire, propertySymbols: undefined })).toThrow("missing or unrequested");
  expect(() =>
    typeObservationsSchema(spanSchema).parse({ ...wire, propertySymbols: wire.propertySymbols?.map((row) => ({ ...row, symbol: 999_999 })) }),
  ).toThrow("foreign");
  expect(() => readTypeObservations({ ...facts, types: facts.types.map((row) => (row === null ? null : { ...row, primitiveFlags: undefined })) })).toThrow(
    "not captured",
  );
  expect(fixture().facts.types.every((row) => row?.primitiveFlags === undefined)).toBe(true);
  expect(fixture().facts.propertySymbols).toBeUndefined();
  source.replaceWithText(source.getFullText());
  expect(() => read.primitiveFlags(parts[0] ?? nodeTypeSelector(target))).toThrow();
});

test("closed declaration nominations retain related definitions and exact receiver methods without widening their roster", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, strict: true } });
  const related = project.createSourceFile("/decl-related.ts", 'interface String {trim():string} export const text=" fixed ";export const held=text.trim();');
  const source = project.createSourceFile("/decl-root.ts", 'import{held}from"./decl-related";export const chosen=held;');
  const root = source.getVariableDeclarationOrThrow("chosen").getInitializerOrThrow();
  const receiver = related
    .getVariableDeclarationOrThrow("held")
    .getInitializerOrThrow()
    .getFirstDescendantByKindOrThrow(SyntaxKind.PropertyAccessExpression)
    .getExpression();
  const demand: TypeObservationDemand = {
    profile: TYPE_OBSERVATION_PROFILE,
    sources: [source, related],
    nodes: [],
    questions: [{ kind: "declaration-closure", nodes: [root], files: [source.getFilePath(), related.getFilePath()], receiverMethods: ["trim"] }],
  };
  const facts = captureTypeObservations(demand, { anchor: source, admit: () => undefined });
  const read = readTypeObservations(facts);
  expect(read.definitions(receiver)).toEqual([related.getVariableDeclarationOrThrow("text")]);
  expect(read.primitiveFlags(nodeTypeSelector(receiver)).stringLiteral).toBe(true);
  expect(() => readTypeObservations({ ...facts, definitions: facts.definitions?.filter((row) => row.node !== receiver) })).toThrow("not captured");
  const bounded = captureTypeObservations(
    { ...demand, questions: demand.questions?.map((question) => ({ ...question, files: [source.getFilePath()] })) },
    { anchor: source, admit: () => undefined },
  );
  expect(readTypeObservations(bounded).definitions(root)).toHaveLength(1);
  expect(() => readTypeObservations(bounded).symbol(receiver)).toThrow("not captured");
  const plan = { mode: "types" as const, facets: [], arguments: [], node: span(source), typeObservations: mapTypeObservationDemand(demand, span) };
  const changed = {
    ...plan,
    typeObservations: { ...plan.typeObservations, questions: plan.typeObservations.questions?.map((question) => ({ ...question, receiverMethods: [] })) },
  };
  expect(invocationQueryKey(plan)).not.toBe(invocationQueryKey(changed));
  expect(() =>
    assertInvocationEvidence({
      query: changed,
      typeObservations: encodeTypeObservations(facts, span),
      invocation: null,
      callee: null,
      profiles: [],
      sources: [],
    }),
  ).toThrow("missing or foreign");
  related.replaceWithText(related.getFullText());
  expect(() => read.symbol(root)).toThrow("epoch");
});

test("complete native property vectors refuse truncation without dropping inherited and merged declarations", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, strict: true } });
  const source = project.createSourceFile(
    "/complete-properties.ts",
    "interface Base {inherited:string} interface Base {merged:number} interface Surface extends Base {local:boolean} interface Empty {}",
  );
  const surface = source.getInterfaceOrThrow("Surface");
  const empty = source.getInterfaceOrThrow("Empty");
  const demand: TypeObservationDemand = {
    profile: TYPE_OBSERVATION_PROFILE,
    sources: [source],
    nodes: [],
    questions: [{ kind: "type-properties", nodes: [surface, empty] }],
  };
  const facts = captureTypeObservations(demand, { anchor: source, admit: () => undefined });
  const wire = encodeTypeObservations(facts, span);
  const replay = (node: InventorySpan): MorphNode => inventoryQueryNode(project.getSourceFile(node.file), node);
  const reader = readTypeObservations(replayTypeObservations(wire, replay));
  const properties = reader.properties(nodeTypeSelector(surface), surface);
  expect(properties.map(({ name }) => name)).toEqual(
    surface
      .getType()
      .getProperties()
      .map((property) => property.getName()),
  );
  expect(properties.map(({ symbol }) => reader.symbolData(symbol).declarations.map((node) => node.getText()))).toEqual(
    surface
      .getType()
      .getProperties()
      .map((property) => property.getDeclarations().map((node) => node.getText())),
  );
  expect(properties).toHaveLength(3);
  expect(reader.properties(nodeTypeSelector(empty), empty)).toEqual([]);
  const truncated = {
    ...wire,
    properties: wire.properties.map((row) => (row.values.length > 0 ? { ...row, values: [] } : row)),
  };
  expect(() => typeObservationsSchema(spanSchema).parse(truncated)).toThrow("property");
  expect(() => readTypeObservations(replayTypeObservations(truncated, replay))).toThrow("property");
  expect(() => typeObservationsSchema(spanSchema).parse(wire)).not.toThrow();
  const omitted = { ...wire, properties: wire.properties.map(({ propertyCount: _count, ...row }) => row) };
  expect(() => typeObservationsSchema(spanSchema).parse(omitted)).toThrow("property");
  expect(() => readTypeObservations(replayTypeObservations(omitted, replay))).toThrow("property");
  for (const count of [-1, Number.NaN, 0.5]) {
    const malformed = { ...wire, properties: wire.properties.map((row) => ({ ...row, propertyCount: count })) };
    expect(() => typeObservationsSchema(spanSchema).parse(malformed)).toThrow();
    expect(() => readTypeObservations(replayTypeObservations(malformed, replay))).toThrow("property");
  }
  expect(wire.properties.map(({ propertyCount }) => propertyCount)).toEqual([3, 3, 0, 0]);
  expect(fixture().facts.properties.every((row) => !("propertyCount" in row))).toBe(true);
});

test("closed Type constituents retain recursive native identities and exact finite property symbols", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, strict: true } });
  const source = project.createSourceFile(
    "/constituents.ts",
    "interface Service {run():void} type Surface=(Service & {extra:true})|{other:true};declare const value:Surface;",
  );
  const node = source.getVariableDeclarationOrThrow("value");
  const demand: TypeObservationDemand = {
    profile: TYPE_OBSERVATION_PROFILE,
    sources: [source],
    nodes: [],
    questions: [{ kind: "type-constituents", nodes: [node], properties: ["run", "missing"] }],
  };
  const facts = captureTypeObservations(demand, { anchor: source, admit: () => undefined });
  const wire = encodeTypeObservations(facts, span);
  const replay = (anchor: InventorySpan): MorphNode => inventoryQueryNode(project.getSourceFile(anchor.file), anchor);
  const reader = readTypeObservations(replayTypeObservations(typeObservationsSchema(spanSchema).parse(wire), replay));
  const pending = [nodeTypeSelector(node)];
  const seen = new Set<object>();
  const declarations = new Set<MorphNode>();
  for (const selector of pending) {
    const reference = reader.select(selector);
    if (reference === null) {
      throw new Error("constituent fixture Type absent");
    }
    const type = reader.type(reference);
    const symbol = reader.propertySymbol(selector, "run");
    if (symbol !== null) {
      for (const declaration of reader.symbolData(symbol).declarations) {
        declarations.add(declaration);
      }
    }
    expect(reader.propertySymbol(selector, "missing")).toBeNull();
    if (!seen.has(type.key)) {
      seen.add(type.key);
      pending.push(...reader.unions(selector), ...reader.intersections(selector));
    }
  }
  expect([...declarations]).toEqual([source.getInterfaceOrThrow("Service").getMethodOrThrow("run")]);
  expect(wire.intersections?.some((row) => row.values.length === 2)).toBe(true);
  const missing = { ...wire, propertySymbols: wire.propertySymbols?.slice(1) };
  expect(() => typeObservationsSchema(spanSchema).parse(missing)).toThrow("coverage");
  expect(() => readTypeObservations(replayTypeObservations(missing, replay))).toThrow("not captured");
  const edge = { ...wire, intersections: wire.intersections?.filter((row) => row.values.length === 0) };
  expect(() => typeObservationsSchema(spanSchema).parse(edge)).toThrow("coverage");
  expect(() => readTypeObservations(replayTypeObservations(edge, replay))).toThrow("incomplete");
  const plan = { mode: "types" as const, facets: [], arguments: [], node: span(source), typeObservations: wire.demand };
  const changed = {
    ...plan,
    typeObservations: { ...wire.demand, questions: wire.demand.questions?.map((question) => ({ ...question, properties: ["run"] })) },
  };
  expect(invocationQueryKey(changed)).not.toBe(invocationQueryKey(plan));
  source.replaceWithText(source.getFullText());
  expect(() => reader.unions(nodeTypeSelector(node))).toThrow();
});
