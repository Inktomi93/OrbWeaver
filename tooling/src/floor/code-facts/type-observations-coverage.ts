// Coverage checks prove the fixed raw-question profile, never Zod ownership or output parity.
import { SyntaxKind } from "ts-morph";
import type { NativeObservedNode, TypeObservationValues } from "./type-observations-contract.ts";
import { assertScalarTypeSelectionCoverage } from "./type-projection-contract.ts";

export function assertTypeObservationCoverage<Anchor>(
  facts: TypeObservationValues<Anchor>,
  key: (node: Anchor) => string,
  kind: (node: Anchor) => number,
): void {
  assertObservationDemand(facts, key, kind);
  const indices = observationIndices(facts);
  assertBaseIndices(facts, indices);
  assertPropertyIndices(facts, indices);
  assertOtherIndices(facts, indices);
  assertContextualSlots(facts, key);
  assertTypeObservationRows(facts, key);
  assertRootSlots(facts, key, kind);
  assertRawQuestions(facts, key, kind);
}
function rawSelectorKey<Anchor>(selector: import("./type-projection-contract.ts").NativeTypeSelector<Anchor>, key: (node: Anchor) => string): string {
  return JSON.stringify({
    ...selector,
    base: selector.base.kind === "schema-column" ? selector.base : { ...selector.base, node: key(selector.base.node) },
    steps: selector.steps.map((step) => ("at" in step ? { ...step, at: key(step.at) } : step)),
    displayAt: selector.displayAt === null ? null : key(selector.displayAt),
  });
}
function uniqueRawKeys(keys: readonly string[]): void {
  if (new Set(keys).size !== keys.length) {
    throw new Error("native raw question identity is ambiguous");
  }
}
function assertRawQuestions<Anchor>(facts: TypeObservationValues<Anchor>, key: (node: Anchor) => string, kind: (node: Anchor) => number): void {
  if (facts.demand.questions === undefined) {
    if (
      facts.definitions !== undefined ||
      facts.callParameters !== undefined ||
      facts.signatureParameters !== undefined ||
      facts.valueProfiles !== undefined ||
      facts.symbols.some((row) => row.valueDeclaration !== undefined) ||
      facts.types.some((row) => row?.stringLiteral !== undefined)
    ) {
      throw new Error("native raw questions are foreign to the registered demand");
    }
    return;
  }
  if (facts.definitions === undefined || facts.callParameters === undefined || facts.signatureParameters === undefined) {
    throw new Error("native raw question tables are missing");
  }
  assertRawNominations(facts, key);
  const valueDemand = facts.demand.questions.some((q) => q.valueFacets !== undefined);
  if (valueDemand !== (facts.valueProfiles !== undefined)) {
    throw new Error("native value-profile table is missing or unrequested");
  }
  uniqueRawKeys((facts.valueProfiles ?? []).map((row) => key(row.node)));
  for (const row of facts.valueProfiles ?? []) {
    uniqueRawKeys(row.facets);
  }
  uniqueRawKeys(facts.definitions.map((row) => key(row.node)));
  uniqueRawKeys(facts.callParameters.map((row) => key(row.call)));
  uniqueRawKeys(facts.signatureParameters.map((row) => `${row.selector}:${key(row.at)}`));
  assertRawParameterCoverage(facts, key, kind);
  if (facts.definitions.some((row) => kind(row.node) !== SyntaxKind.Identifier)) {
    throw new Error("native definition-node query is not an identifier");
  }
}
function assertRawNominations<Anchor>(facts: TypeObservationValues<Anchor>, key: (node: Anchor) => string): void {
  const questions = facts.demand.questions ?? [];
  if (questions.some((q) => (q.kind === "value-profiles" ? q.valueFacets === undefined : q.kind !== "definition-closure" && q.valueFacets !== undefined))) {
    throw new Error("native value facets have no closed nomination");
  }
  for (const q of questions) {
    if (q.valueFacets !== undefined) {
      uniqueRawKeys(q.valueFacets);
    }
  }
  if (questions.some((q) => (q.kind === "definition-closure" ? q.files === undefined || new Set(q.files).size !== q.files.length : q.files !== undefined))) {
    throw new Error("native raw question source roster is missing or foreign");
  }
  if (questions.some((q) => q.properties !== undefined && new Set(q.properties).size !== q.properties.length)) {
    throw new Error("native raw property nomination is ambiguous");
  }
  uniqueRawKeys(questions.map((q) => q.kind));
  for (const q of questions) {
    uniqueRawKeys(q.nodes.map(key));
    for (const node of q.nodes) {
      assertRawNominationNode(facts, q, node, key);
    }
  }
  const calls = questions
    .filter((q) => q.kind === "call-parameters")
    .flatMap((q) => q.nodes)
    .map(key);
  if (JSON.stringify(calls) !== JSON.stringify(facts.callParameters?.map((row) => key(row.call)))) {
    throw new Error("native call parameter coverage is foreign");
  }
}
function assertRawNominationNode<Anchor>(
  facts: TypeObservationValues<Anchor>,
  question: import("./type-observations-contract.ts").TypeObservationQuestion<Anchor>,
  node: Anchor,
  key: (node: Anchor) => string,
): void {
  if (
    (question.kind === "definition-nodes" || question.kind === "definition-closure") &&
    facts.definitions?.some((row) => key(row.node) === key(node)) !== true
  ) {
    throw new Error("native definition-node coverage is missing");
  }
  if (question.kind === "call-parameters" && facts.callParameters?.some((row) => key(row.call) === key(node)) !== true) {
    throw new Error("native call parameter coverage is missing");
  }
}
/** Serialized and direct replay validate native arities against the retained ordered selectors. */
export function assertRawParameterCoverage<Anchor>(facts: TypeObservationValues<Anchor>, key: (node: Anchor) => string, kind: (node: Anchor) => number): void {
  const remaining = new Set(
    (facts.selections?.plan.selectors ?? []).flatMap((selector, index) =>
      (selector.base.kind === "call-parameter" && selector.steps.length === 0 && selector.displayAt === null) ||
      selector.steps.at(-1)?.kind === "signature-parameter"
        ? [index]
        : [],
    ),
  );
  assertCallParameterRows(facts, key, kind, remaining);
  assertSignatureParameterRows(facts, key, remaining);
  if (remaining.size > 0) {
    throw new Error("native parameter selector coverage is incomplete");
  }
}
function consumeParameter(remaining: Set<number>, parameter: number): void {
  if (!remaining.delete(parameter)) {
    throw new Error("native parameter selector coverage is incomplete or ambiguous");
  }
}
function assertCallParameterShape<Anchor>(row: NonNullable<TypeObservationValues<Anchor>["callParameters"]>[number]): void {
  if (row.parameterCount === null) {
    if (row.values !== null) {
      throw new Error("native call parameter coverage is incomplete");
    }
    return;
  }
  if (!Number.isSafeInteger(row.parameterCount) || row.parameterCount < 0 || row.values === null || row.values.length !== row.parameterCount) {
    throw new Error("native call parameter coverage is incomplete");
  }
}
function assertSignatureParameterShape<Anchor>(row: NonNullable<TypeObservationValues<Anchor>["signatureParameters"]>[number]): void {
  if (row.parameterCounts.length !== row.values.length) {
    throw new Error("native signature parameter coverage is incomplete");
  }
  for (const [signature, count] of row.parameterCounts.entries()) {
    if (!Number.isSafeInteger(count) || count < 0 || row.values[signature]?.length !== count) {
      throw new Error("native signature parameter coverage is incomplete");
    }
  }
}
function assertCallParameterRows<Anchor>(
  facts: TypeObservationValues<Anchor>,
  key: (node: Anchor) => string,
  kind: (node: Anchor) => number,
  remaining: Set<number>,
): void {
  const indices = observationIndices(facts);
  for (const row of facts.callParameters ?? []) {
    if (kind(row.call) !== SyntaxKind.CallExpression) {
      throw new Error("native parameter table is not a call");
    }
    assertCallParameterShape(row);
    for (const [index, parameter] of (row.values ?? []).entries()) {
      indices.presentType(parameter);
      const selector = facts.selections?.plan.selectors[parameter];
      if (
        selector?.base.kind !== "call-parameter" ||
        key(selector.base.node) !== key(row.call) ||
        selector.base.index !== index ||
        selector.steps.length > 0 ||
        selector.displayAt !== null
      ) {
        throw new Error("native call parameter identity is foreign");
      }
      consumeParameter(remaining, parameter);
    }
  }
}
function assertSignatureParameterRows<Anchor>(facts: TypeObservationValues<Anchor>, key: (node: Anchor) => string, remaining: Set<number>): void {
  const indices = observationIndices(facts);
  const expected = (facts.demand.questions ?? [])
    .filter((q) => q.kind === "signature-parameters")
    .flatMap((q) => q.nodes)
    .map(key);
  if (JSON.stringify(expected) !== JSON.stringify(facts.signatureParameters?.map((row) => key(row.at)))) {
    throw new Error("native signature parameter coverage is missing or foreign");
  }
  for (const row of facts.signatureParameters ?? []) {
    indices.presentType(row.selector);
    const parent = facts.selections?.plan.selectors[row.selector];
    if (
      parent?.base.kind !== "node" ||
      key(parent.base.node) !== key(row.at) ||
      parent.steps.length !== 1 ||
      parent.steps[0]?.kind !== "nonnullable" ||
      parent.displayAt !== null
    ) {
      throw new Error("native signature parameter owner is foreign");
    }
    assertSignatureParameterShape(row);
    for (const [signature, parameters] of row.values.entries()) {
      for (const [index, parameter] of parameters.entries()) {
        indices.presentType(parameter);
        assertSignatureParameterIdentity({ facts, parameter, parent, signature, index, at: row.at, key });
        consumeParameter(remaining, parameter);
      }
    }
  }
}
function assertSignatureParameterIdentity<Anchor>({
  facts,
  parameter,
  parent,
  signature,
  index,
  at,
  key,
}: {
  readonly facts: TypeObservationValues<Anchor>;
  readonly parameter: number;
  readonly parent: import("./type-projection-contract.ts").NativeTypeSelector<Anchor>;
  readonly signature: number;
  readonly index: number;
  readonly at: Anchor;
  readonly key: (node: Anchor) => string;
}): void {
  const selector = facts.selections?.plan.selectors[parameter];
  const step = selector?.steps.at(-1);
  if (
    selector === undefined ||
    step?.kind !== "signature-parameter" ||
    step.signature !== signature ||
    step.index !== index ||
    key(step.at) !== key(at) ||
    rawSelectorKey({ ...selector, steps: selector.steps.slice(0, -1) }, key) !== rawSelectorKey(parent, key)
  ) {
    throw new Error("native signature parameter identity is foreign");
  }
}
function assertObservationDemand<Anchor>(facts: TypeObservationValues<Anchor>, key: (node: Anchor) => string, kind: (node: Anchor) => number): void {
  const nodes = new Map(facts.nodes.map((entry) => [key(entry.node), entry]));
  if (nodes.size !== facts.nodes.length || facts.demand.nodes.some((node) => !nodes.has(key(node)))) {
    throw new Error("native type observation node coverage is missing or ambiguous");
  }
  if (
    facts.exports.length !== facts.demand.sources.length ||
    facts.exports.some((entry, index) => facts.demand.sources[index] === undefined || key(entry.source) !== key(facts.demand.sources[index]))
  ) {
    throw new Error("native type observation export roster is missing or foreign");
  }
  if (
    kind(facts.anchor) !== SyntaxKind.SourceFile ||
    !facts.demand.sources.some((source) => key(source) === key(facts.anchor)) ||
    facts.demand.sources.some((source) => kind(source) !== SyntaxKind.SourceFile)
  ) {
    throw new Error("native type observation source anchor is foreign");
  }
  const selected = facts.selections;
  if (selected === null) {
    if (facts.types.length > 0 || facts.nodes.length > 0) {
      throw new Error("native type observation selectors are missing");
    }
  } else {
    assertScalarTypeSelectionCoverage(selected);
    if (facts.types.length !== selected.values.length || facts.types.some((value, index) => (value === null) !== (selected.values[index] === null))) {
      throw new Error("native type observation metadata coverage is missing");
    }
  }
}
interface ObservationIndices {
  readonly type: (index: number) => void;
  readonly presentType: (index: number) => void;
  readonly symbol: (index: number | null) => void;
}
function observationIndices<Anchor>(facts: TypeObservationValues<Anchor>): ObservationIndices {
  const type = (index: number): void => {
    if (!Number.isSafeInteger(index) || index < 0 || index >= facts.types.length) {
      throw new Error("native type observation Type reference is foreign");
    }
  };
  const presentType = (index: number): void => {
    type(index);
    if (facts.types[index] === null) {
      throw new Error("native type observation Type reference is absent");
    }
  };
  const symbol = (index: number | null): void => {
    if (index !== null && (!Number.isSafeInteger(index) || index < 0 || index >= facts.symbols.length)) {
      throw new Error("native type observation symbol reference is foreign");
    }
  };
  return { type, presentType, symbol };
}
function assertBaseIndices<Anchor>(facts: TypeObservationValues<Anchor>, indices: ObservationIndices): void {
  const { presentType, symbol } = indices;
  for (const entry of facts.symbols) {
    symbol(entry.canonical);
  }
  for (const entry of facts.types) {
    if (entry !== null) {
      symbol(entry.symbol);
      symbol(entry.aliasSymbol);
    }
  }
  for (const entry of facts.nodes) {
    presentType(entry.type);
    symbol(entry.symbol);
    if (entry.contextual.kind === "value") {
      presentType(entry.contextual.value);
    }
  }
}
function assertPropertyIndices<Anchor>(facts: TypeObservationValues<Anchor>, indices: ObservationIndices): void {
  const { type, presentType, symbol } = indices;
  for (const entry of facts.properties) {
    presentType(entry.selector);
    for (const property of entry.values) {
      symbol(property.symbol);
      type(property.type);
    }
  }
  for (const entry of facts.unions) {
    presentType(entry.selector);
    entry.values.forEach(type);
    if (entry.values.length !== facts.types[entry.selector]?.unionCount) {
      throw new Error("native union-slot coverage is incomplete");
    }
  }
  for (const entry of facts.callReturns) {
    entry.values.forEach(type);
  }
  for (const entry of facts.computedNames) {
    presentType(entry.selector);
  }
}
function assertOtherIndices<Anchor>(facts: TypeObservationValues<Anchor>, indices: ObservationIndices): void {
  const { type, presentType, symbol } = indices;
  for (const entry of facts.signatures) {
    if (entry.fact.kind === "unrequested") {
      throw new Error("native signature observation was not captured");
    }
    if (entry.fact.kind === "value") {
      entry.fact.value.parameters.forEach(type);
    }
  }
  for (const entry of facts.dependencies) {
    presentType(entry.type);
  }
  for (const entry of facts.localTargets) {
    symbol(entry.symbol);
  }
  for (const entry of facts.exports) {
    entry.symbols.forEach(symbol);
    symbol(entry.default);
    entry.localTargets.forEach(symbol);
  }
}
function assertRootSlots<Anchor>(facts: TypeObservationValues<Anchor>, key: (node: Anchor) => string, kind: (node: Anchor) => number): void {
  const selected = facts.selections;
  for (const node of facts.demand.nodes) {
    if (kind(node) === SyntaxKind.VariableDeclaration && !facts.callReturns.some((entry) => key(entry.node) === key(node))) {
      throw new Error("native callable return-slot coverage is missing");
    }
    if (
      kind(node) === SyntaxKind.FunctionDeclaration &&
      (selected === null ||
        !selected.plan.selectors.some((selector) => selector.base.kind === "return" && key(selector.base.node) === key(node) && selector.steps.length === 0))
    ) {
      throw new Error("native declaration return-slot coverage is missing");
    }
  }
}

function assertTypeObservationRows<Anchor>(facts: TypeObservationValues<Anchor>, key: (node: Anchor) => string): void {
  const unique = (keys: readonly string[]): void => {
    if (new Set(keys).size !== keys.length) {
      throw new Error("native type observation question identity is ambiguous");
    }
  };
  unique(facts.properties.map((entry) => `${entry.selector}:${key(entry.at)}`));
  unique(facts.unions.map((entry) => String(entry.selector)));
  unique(facts.callReturns.map((entry) => key(entry.node)));
  unique(facts.signatures.map((entry) => key(entry.call)));
  unique(facts.localTargets.map((entry) => key(entry.node)));
  unique(facts.computedNames.map((entry) => String(entry.selector)));
  unique(facts.dependencies.map((entry) => `${entry.type}:${key(entry.owner)}:${key(entry.at)}`));
  const plan = facts.selections?.plan;
  for (const entry of facts.nodes) {
    const selector = plan?.selectors[entry.type];
    if (selector?.base.kind !== "node" || key(selector.base.node) !== key(entry.node) || selector.steps.length > 0 || selector.displayAt !== null) {
      throw new Error("native type node selector identity is foreign");
    }
  }
}

function assertContextualSlots<Anchor>(facts: TypeObservationValues<Anchor>, key: (node: Anchor) => string): void {
  const selected = facts.selections;
  const bases = new Map<string, number>();
  if (selected !== null) {
    for (const [index, selector] of selected.plan.selectors.entries()) {
      if (selector.base.kind === "contextual" && selector.steps.length === 0 && selector.displayAt === null) {
        const name = key(selector.base.node);
        if (!bases.has(name)) {
          bases.set(name, index);
        }
      }
    }
  }
  for (const entry of facts.nodes) {
    if (!matchesContextualBase(entry, bases.get(key(entry.node)), selected)) {
      throw new Error("native contextual base coverage is missing or mismatched");
    }
  }
}
function matchesContextualBase<Anchor>(
  entry: NativeObservedNode<Anchor>,
  index: number | undefined,
  selected: TypeObservationValues<Anchor>["selections"],
): boolean {
  if (entry.contextual.kind === "unrequested") {
    return index === undefined;
  }
  if (index === undefined || selected === null) {
    return false;
  }
  const value = selected.values[index];
  if (entry.contextual.kind === "absent") {
    return value === null;
  }
  return entry.contextual.value === index && value !== undefined && value !== null;
}
