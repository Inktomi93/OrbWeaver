// Coverage checks prove the fixed raw-question profile, never Zod ownership or output parity.
import { SyntaxKind } from "ts-morph";
import { MAX_RECEIVER_HOPS } from "./type-member-origin-core.ts";
import { assertQuestionNominations } from "./type-observation-nominations.ts";
import type { NativeObservedNode, TypeObservationQuestion, TypeObservationValues } from "./type-observations-contract.ts";
import { hasCompleteTypePropertyDemand } from "./type-observations-contract.ts";
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
  assertCompletePropertyCoverage(facts);
  assertOtherIndices(facts, indices);
  assertContextualSlots(facts, key);
  assertTypeObservationRows(facts, key);
  assertRootSlots(facts, key, kind);
  assertRawQuestions(facts, key, kind);
  assertRawTypeGraphCoverage(facts, key);
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
      facts.intersections !== undefined ||
      facts.constraints !== undefined ||
      facts.signatureDeclarations !== undefined ||
      facts.propertySymbols !== undefined ||
      facts.constInitializers !== undefined ||
      facts.exportDeclarations !== undefined ||
      facts.callableBodies !== undefined ||
      facts.predicateInputs !== undefined ||
      facts.arrayElements !== undefined ||
      facts.definitions !== undefined ||
      facts.callParameters !== undefined ||
      facts.signatureParameters !== undefined ||
      facts.valueProfiles !== undefined ||
      facts.functionExports !== undefined ||
      facts.symbols.some((row) => row.valueDeclaration !== undefined) ||
      facts.types.some(
        (row) =>
          row?.primitiveFlags !== undefined ||
          row?.categoryFlags !== undefined ||
          row?.stringLiteral !== undefined ||
          row?.defaultDisplay !== undefined ||
          row?.literalValue !== undefined ||
          row?.typeArguments !== undefined,
      )
    ) {
      throw new Error("native raw questions are foreign to the registered demand");
    }
    return;
  }
  if (facts.definitions === undefined || facts.callParameters === undefined || facts.signatureParameters === undefined) {
    throw new Error("native raw question tables are missing");
  }
  assertRawNominations(facts, key);
  assertConstInitializerCoverage(facts, key);
  assertContributionDemand(facts);
  assertPredicateInputCoverage(facts, key, kind);
  assertNamedPropertyCoverage(facts, key);
  assertSelectedPropertyGraphDemand(facts, key, kind);
  assertCallableBodyNominations(facts, key);
  assertTypeArgumentCoverage(facts, key);
  const functions = facts.demand.questions
    .filter((q) => q.kind === "function-exports")
    .flatMap((q) => q.nodes)
    .map(key);
  if (
    functions.length > 0 !== (facts.functionExports !== undefined && facts.functionExports.length > 0) ||
    JSON.stringify(functions) !== JSON.stringify((facts.functionExports ?? []).map((row) => key(row.node))) ||
    facts.functionExports?.some((row) => kind(row.node) !== SyntaxKind.FunctionDeclaration && kind(row.node) !== SyntaxKind.VariableStatement) === true
  ) {
    throw new Error("native function export coverage is missing or foreign");
  }
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

function assertCallableBodyNominations<Anchor>(facts: TypeObservationValues<Anchor>, key: (node: Anchor) => string): void {
  const questions = (facts.demand.questions ?? []).filter((question) => question.kind === "callable-body-values");
  const expected = questions.flatMap((question) => question.nodes).map(key);
  const actual = (facts.callableBodies ?? []).map((row) => key(row.node));
  if (questions.length > 0 !== (facts.callableBodies !== undefined) || JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error("native callable body nomination coverage is missing or foreign");
  }
  uniqueRawKeys(actual);
}

function assertSelectedPropertyGraphDemand<Anchor>(facts: TypeObservationValues<Anchor>, key: (node: Anchor) => string, kind: (node: Anchor) => number): void {
  const questions = facts.demand.questions ?? [];
  const exports = new Set(questions.flatMap((question) => selectedGraphExportKeys(question, key, kind)));
  const requestedExports = questions.some((question) => question.selectedPropertyGraph?.exportName !== undefined);
  const actual = (facts.exportDeclarations ?? []).map((row) => JSON.stringify([key(row.source), row.name]));
  if (requestedExports !== (facts.exportDeclarations !== undefined) || actual.length !== exports.size || actual.some((value) => !exports.has(value))) {
    throw new Error("native selected-property export coverage is missing or foreign");
  }
  uniqueRawKeys(actual);
}
function selectedGraphExportKeys<Anchor>(
  question: TypeObservationQuestion<Anchor>,
  key: (node: Anchor) => string,
  kind: (node: Anchor) => number,
): readonly string[] {
  const graph = question.selectedPropertyGraph;
  if ((question.kind === "selected-property-graph") !== (graph !== undefined)) {
    throw new Error("native selected-property graph descriptor is missing or foreign");
  }
  if (graph === undefined) {
    return [];
  }
  if (
    graph.stopPath.length === 0 ||
    [...graph.rootPath, ...graph.stopPath, ...graph.leafPaths.flat()].some((name) => name.length === 0) ||
    graph.leafPaths.some((path) => path.length === 0)
  ) {
    throw new Error("native selected-property graph path is empty");
  }
  if (graph.exportName === undefined) {
    return [];
  }
  if (graph.exportName.length === 0 || question.nodes.some((node) => kind(node) !== SyntaxKind.SourceFile)) {
    throw new Error("native selected-property export root is malformed");
  }
  return question.nodes.map((source) => JSON.stringify([key(source), graph.exportName]));
}

export function assertTypeArgumentCoverage<Anchor>(facts: TypeObservationValues<Anchor>, key: (node: Anchor) => string): void {
  const arrayArguments = arrayArgumentSelections(facts);
  const remaining = new Set(
    (facts.selections?.plan.selectors ?? []).flatMap((selector, index) =>
      selector.steps.at(-1)?.kind === "type-argument" && !arrayArguments.has(index) ? [index] : [],
    ),
  );
  for (const [index, row] of facts.types.entries()) {
    if (row === null || row.typeArguments === undefined) {
      continue;
    }
    if (row.typeArgumentCount !== row.typeArguments.length) {
      throw new Error("native Type argument coverage is incomplete");
    }
    const parent = facts.selections?.plan.selectors[index];
    if (parent === undefined) {
      throw new Error("native Type argument owner is unavailable");
    }
    for (const [ordinal, child] of row.typeArguments.entries()) {
      assertTypeArgumentIdentity(facts, parent, key, { ordinal, child });
      if (!remaining.delete(child)) {
        throw new Error("native Type argument selector coverage is ambiguous");
      }
    }
  }
  if (remaining.size > 0) {
    throw new Error("native Type argument selector coverage is incomplete");
  }
}
function assertTypeArgumentIdentity<Anchor>(
  facts: TypeObservationValues<Anchor>,
  parent: import("./type-projection-contract.ts").NativeTypeSelector<Anchor>,
  key: (node: Anchor) => string,
  entry: { readonly ordinal: number; readonly child: number },
): void {
  const { ordinal, child } = entry;
  const selector = facts.selections?.plan.selectors[child];
  const step = selector?.steps.at(-1);
  if (
    selector === undefined ||
    step?.kind !== "type-argument" ||
    step.index !== ordinal ||
    rawSelectorKey({ ...selector, steps: selector.steps.slice(0, -1) }, key) !== rawSelectorKey(parent, key)
  ) {
    throw new Error("native Type argument identity is foreign");
  }
}
function assertRawNominations<Anchor>(facts: TypeObservationValues<Anchor>, key: (node: Anchor) => string): void {
  const questions = facts.demand.questions ?? [];
  assertQuestionNominations(questions);
  for (const q of questions) {
    if (q.valueFacets !== undefined) {
      uniqueRawKeys(q.valueFacets);
    }
  }
  if (
    questions.some((q) =>
      q.kind === "definition-closure" || q.kind === "declaration-closure" || q.kind === "callable-body-values"
        ? q.files === undefined || new Set(q.files).size !== q.files.length
        : q.files !== undefined,
    )
  ) {
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
  if (
    questions.some(
      (question) =>
        question.receiverMethods !== undefined &&
        (question.kind !== "declaration-closure" || new Set(question.receiverMethods).size !== question.receiverMethods.length),
    )
  ) {
    throw new Error("native receiver-method nomination is ambiguous or foreign");
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
      entry.typeArguments?.forEach(presentType);
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

function indicesForPropertySymbol<Anchor>(
  facts: TypeObservationValues<Anchor>,
  row: NonNullable<TypeObservationValues<Anchor>["propertySymbols"]>[number],
): void {
  const indices = observationIndices(facts);
  indices.presentType(row.selector);
  indices.symbol(row.symbol);
}

function namedPropertyOwners<Anchor>(facts: TypeObservationValues<Anchor>, node: Anchor, key: (node: Anchor) => string): readonly number[] {
  const index = facts.selections?.plan.selectors.findIndex(
    (selector) => selector.base.kind === "node" && key(selector.base.node) === key(node) && selector.steps.length === 0 && selector.displayAt === null,
  );
  if (index === undefined || index < 0) {
    throw new Error("native named property owner was not captured");
  }
  if (facts.types[index] === null) {
    return [];
  }
  const parts = facts.unions.find((row) => row.selector === index);
  if (parts === undefined) {
    throw new Error("native named property union coverage is missing");
  }
  return [index, ...parts.values];
}
function constituentPropertyOwners<Anchor>(facts: TypeObservationValues<Anchor>, node: Anchor, key: (node: Anchor) => string): readonly number[] {
  const root = facts.selections?.plan.selectors.findIndex(
    (selector) => selector.base.kind === "node" && key(selector.base.node) === key(node) && selector.steps.length === 0 && selector.displayAt === null,
  );
  if (root === undefined || root < 0) {
    throw new Error("native constituent property owner was not captured");
  }
  const seen = new Set<number>();
  const owners = new Set<number>();
  const pending = [root];
  for (const selector of pending) {
    const type = facts.selections?.values[selector];
    if (type === null) {
      continue;
    }
    if (type === undefined) {
      throw new Error("native constituent Type identity is missing");
    }
    owners.add(selector);
    const unions = facts.unions.find((row) => row.selector === selector);
    const intersections = facts.intersections?.find((row) => row.selector === selector);
    if (unions === undefined || intersections === undefined) {
      throw new Error("native constituent edge coverage is missing");
    }
    if (!seen.has(type.identity)) {
      seen.add(type.identity);
      pending.push(...unions.values, ...intersections.values);
    }
  }
  return [...owners];
}
function assertConstInitializerCoverage<Anchor>(facts: TypeObservationValues<Anchor>, key: (node: Anchor) => string): void {
  const questions = (facts.demand.questions ?? []).filter((question) => question.kind === "const-initializers");
  if (questions.length > 0 !== (facts.constInitializers !== undefined)) {
    throw new Error("native const initializer nominations are missing or unrequested");
  }
  const roots = new Set(questions.flatMap((question) => question.nodes.map(key)));
  const rows = facts.constInitializers ?? [];
  uniqueRawKeys(rows.map((row) => key(row.node)));
  const observed = new Set(facts.nodes.map((row) => key(row.node)));
  if (rows.length !== roots.size || rows.some((row) => !roots.has(key(row.node)))) {
    throw new Error("native const initializer roots are missing or foreign");
  }
  for (const row of rows) {
    uniqueRawKeys(row.values.map(key));
    const first = row.values[0];
    if (
      first === undefined ||
      row.values.length > MAX_RECEIVER_HOPS + 2 ||
      key(first) !== key(row.node) ||
      row.values.some((node) => !observed.has(key(node)))
    ) {
      throw new Error("native const initializer nomination closure is incomplete or foreign");
    }
  }
}

function constPropertyOwners<Anchor>(facts: TypeObservationValues<Anchor>, node: Anchor, key: (node: Anchor) => string): readonly number[] {
  const row = facts.constInitializers?.find((entry) => key(entry.node) === key(node));
  if (row === undefined) {
    throw new Error("native const initializer root was not captured");
  }
  return row.values.flatMap((value) => {
    const index = facts.selections?.plan.selectors.findIndex(
      (selector) =>
        selector.base.kind === "node" &&
        key(selector.base.node) === key(value) &&
        selector.displayAt === null &&
        selector.steps.length === 1 &&
        selector.steps[0]?.kind === "nonnullable",
    );
    if (index === undefined || index < 0) {
      throw new Error("native const initializer nonnullable property owner was not captured");
    }
    return facts.types[index] === null ? [] : [index];
  });
}

function questionPropertyOwners<Anchor>(
  facts: TypeObservationValues<Anchor>,
  question: TypeObservationQuestion<Anchor>,
  node: Anchor,
  key: (node: Anchor) => string,
): readonly number[] {
  if (question.kind === "const-initializers") {
    return constPropertyOwners(facts, node, key);
  }
  if (question.kind === "type-constituents") {
    return constituentPropertyOwners(facts, node, key);
  }
  return namedPropertyOwners(facts, node, key);
}

function assertNamedPropertyCoverage<Anchor>(facts: TypeObservationValues<Anchor>, key: (node: Anchor) => string): void {
  const questions = (facts.demand.questions ?? []).filter(
    (question) => question.kind === "property-symbols" || question.kind === "const-initializers" || question.kind === "type-constituents",
  );
  const graphs = (facts.demand.questions ?? []).filter((question) => question.kind === "selected-property-graph");
  if (questions.length + graphs.length > 0 !== (facts.propertySymbols !== undefined)) {
    throw new Error("native named property symbols are missing or unrequested");
  }
  const expected = new Set(
    questions.flatMap((question) =>
      question.nodes.flatMap((node) => {
        if (question.kind === "const-initializers" && (question.properties?.length ?? 0) === 0) {
          return [];
        }
        const owners = questionPropertyOwners(facts, question, node, key);
        return owners.flatMap((selector) => (question.properties ?? []).map((name) => JSON.stringify([selector, name])));
      }),
    ),
  );
  const actual = (facts.propertySymbols ?? []).map((row) => JSON.stringify([row.selector, row.name]));
  uniqueRawKeys(actual);
  for (const row of facts.propertySymbols ?? []) {
    indicesForPropertySymbol(facts, row);
  }
  if (
    [...expected].some((name) => !actual.includes(name)) ||
    (facts.propertySymbols ?? []).some((row) => !(expected.has(JSON.stringify([row.selector, row.name])) || selectedGraphPropertyOwner(facts, row)))
  ) {
    throw new Error("native named property coverage is missing or foreign");
  }
}

function selectedGraphPropertyOwner<Anchor>(
  facts: TypeObservationValues<Anchor>,
  row: NonNullable<TypeObservationValues<Anchor>["propertySymbols"]>[number],
): boolean {
  const selector = facts.selections?.plan.selectors[row.selector];
  return (
    selector?.base.kind === "node" &&
    selector.steps.length === 1 &&
    selector.steps[0]?.kind === "nonnullable" &&
    selector.displayAt === null &&
    (facts.demand.questions ?? []).some((question) => question.kind === "selected-property-graph" && question.properties?.includes(row.name) === true)
  );
}

/** Direct and serialized deliveries retain the same closed predicate-input and array nominations. */
export function assertPredicateInputCoverage<Anchor>(
  facts: TypeObservationValues<Anchor>,
  key: (node: Anchor) => string,
  kind: (node: Anchor) => number,
): void {
  const questions = (facts.demand.questions ?? []).filter((question) => question.kind === "drizzle-predicate-inputs");
  if (questions.length > 0 !== (facts.predicateInputs !== undefined) || questions.length > 0 !== (facts.arrayElements !== undefined)) {
    throw new Error("native predicate-input/array tables are missing or unrequested");
  }
  assertPredicateContexts(facts, key, kind);
  if (questions.length === 0) {
    return;
  }
  const expected = questions.flatMap((question) => question.nodes.map(key));
  const rows = facts.predicateInputs ?? [];
  uniqueRawKeys(rows.map((row) => key(row.node)));
  const observed = new Set(facts.nodes.map((row) => key(row.node)));
  if (
    JSON.stringify(expected) !== JSON.stringify(rows.map((row) => key(row.node))) ||
    rows.some((row) => row.values.some((node) => !observed.has(key(node))))
  ) {
    throw new Error("native predicate-input roots or nominated operands are missing or foreign");
  }
  for (const row of rows) {
    uniqueRawKeys(row.values.map(key));
    uniqueRawKeys(row.predicates.map(key));
  }
  assertPredicateArrayCoverage(
    facts,
    rows.flatMap((row) => row.values),
    key,
  );
}

function assertPredicateArrayCoverage<Anchor>(facts: TypeObservationValues<Anchor>, values: readonly Anchor[], key: (node: Anchor) => string): void {
  const selectors = facts.selections?.plan.selectors ?? [];
  const expected = new Set(
    values.map((node) => {
      const index = selectors.findIndex(
        (selector) => selector.base.kind === "node" && key(selector.base.node) === key(node) && selector.steps.length === 0 && selector.displayAt === null,
      );
      if (index < 0) {
        throw new Error("native predicate-input root Type was not captured");
      }
      return index;
    }),
  );
  const rows = facts.arrayElements ?? [];
  if (rows.length !== expected.size || new Set(rows.map((row) => row.selector)).size !== rows.length || rows.some((row) => !expected.has(row.selector))) {
    throw new Error("native predicate-input array roots are missing or foreign");
  }
  for (const row of rows) {
    assertPredicateArrayRow(facts, row, key);
  }
}

/** Ordered type graph edges retain native counts and exact selector ancestry. */
export function assertRawTypeGraphCoverage<Anchor>(facts: TypeObservationValues<Anchor>, key: (node: Anchor) => string): void {
  const indices = observationIndices(facts);
  const plan = facts.selections?.plan;
  const selectors = plan?.selectors ?? [];
  const expected = new Set(
    selectors.flatMap((selector, index) => (["intersection-part", "constraint"].includes(selector.steps.at(-1)?.kind ?? "") ? [index] : [])),
  );
  const child = (parent: number, index: number, step: import("./type-projection-contract.ts").NativeTypeSelectionStep<Anchor>): void => {
    indices.type(index);
    const base = selectors[parent];
    const actual = selectors[index];
    if (base === undefined || actual === undefined || rawSelectorKey(actual, key) !== rawSelectorKey({ ...base, steps: [...base.steps, step] }, key)) {
      throw new Error("native Type graph selector identity is foreign");
    }
    expected.delete(index);
  };
  uniqueRawKeys((facts.intersections ?? []).map((row) => String(row.selector)));
  uniqueRawKeys((facts.constraints ?? []).map((row) => String(row.selector)));
  uniqueRawKeys((facts.signatureDeclarations ?? []).map((row) => JSON.stringify([row.selector, row.kind])));
  assertIntersectionRows(facts, child);
  assertConstraintRows(facts, child, key);
  for (const row of facts.signatureDeclarations ?? []) {
    indices.presentType(row.selector);
    if (!Number.isSafeInteger(row.declarationCount) || row.declarationCount < 0 || row.declarations.length !== row.declarationCount) {
      throw new Error("native signature declaration coverage is incomplete");
    }
  }
  if (expected.size > 0) {
    throw new Error("native Type graph edge coverage is incomplete");
  }
}

type TypeGraphChild<Anchor> = (parent: number, index: number, step: import("./type-projection-contract.ts").NativeTypeSelectionStep<Anchor>) => void;
function assertIntersectionRows<Anchor>(facts: TypeObservationValues<Anchor>, child: TypeGraphChild<Anchor>): void {
  const indices = observationIndices(facts);
  for (const row of facts.intersections ?? []) {
    indices.presentType(row.selector);
    if (row.values.length !== facts.types[row.selector]?.intersectionCount) {
      throw new Error("native intersection-slot coverage is incomplete");
    }
    row.values.forEach((value, index) => {
      indices.presentType(value);
      child(row.selector, value, { kind: "intersection-part", index });
    });
  }
  for (const [index, row] of facts.types.entries()) {
    if (row?.intersectionCount !== undefined && !(facts.intersections ?? []).some((entry) => entry.selector === index)) {
      throw new Error("native intersection count has no registered question");
    }
  }
}
function assertConstraintRows<Anchor>(facts: TypeObservationValues<Anchor>, child: TypeGraphChild<Anchor>, key: (node: Anchor) => string): void {
  const indices = observationIndices(facts);
  const selectors = facts.selections?.plan.selectors ?? [];
  for (const row of facts.constraints ?? []) {
    indices.presentType(row.selector);
    const base = selectors[row.selector];
    const constraint =
      base === undefined
        ? undefined
        : selectors.findIndex((selector) => rawSelectorKey(selector, key) === rawSelectorKey({ ...base, steps: [...base.steps, { kind: "constraint" }] }, key));
    if (constraint === undefined || constraint < 0 || (row.value === null ? facts.types[constraint] !== null : row.value !== constraint)) {
      throw new Error("native constraint absence or identity is foreign");
    }
    child(row.selector, constraint, { kind: "constraint" });
  }
}

/** Native arity supplements ordered member identities; it never reconstructs omitted members. */
export function assertCompletePropertyCoverage<Anchor>(facts: TypeObservationValues<Anchor>): void {
  const required = hasCompleteTypePropertyDemand(facts.demand);
  for (const row of facts.properties) {
    if (required) {
      if (!Number.isSafeInteger(row.propertyCount) || (row.propertyCount ?? -1) < 0 || row.propertyCount !== row.values.length) {
        throw new Error("native complete property coverage is missing or truncated");
      }
    } else if (row.propertyCount !== undefined) {
      throw new Error("native complete property count is unrequested");
    }
  }
}

function assertContributionDemand<Anchor>(facts: TypeObservationValues<Anchor>): void {
  for (const question of facts.demand.questions ?? []) {
    const selected = question.kind === "ct-contributions";
    if (selected !== (question.relationTargets !== undefined) || selected !== (question.callableHomes !== undefined)) {
      throw new Error("native contribution relation demand is missing or foreign");
    }
    if (!selected) {
      continue;
    }
    uniqueRawKeys((question.relationTargets ?? []).map((span) => JSON.stringify(span)));
    uniqueRawKeys((question.callableHomes ?? []).map((home) => JSON.stringify(home)));
    if (
      question.relationTargets?.some((span) => span.kind !== SyntaxKind.CallExpression || span.end < span.start) === true ||
      question.callableHomes?.some((home) => home.name.length === 0 || !home.suffix.startsWith("/")) === true
    ) {
      throw new Error("native contribution relation demand is malformed");
    }
  }
}
function assertPredicateContexts<Anchor>(facts: TypeObservationValues<Anchor>, key: (node: Anchor) => string, kind: (node: Anchor) => number): void {
  for (const question of facts.demand.questions ?? []) {
    const context = question.predicateContext;
    if ((question.kind === "drizzle-predicate-inputs") !== (context !== undefined)) {
      throw new Error("native predicate-input context is missing or foreign");
    }
    if (context !== undefined) {
      uniqueRawKeys(context.calls.map(key));
      uniqueRawKeys(context.references.map(key));
      const calls = new Set(context.calls.map(key));
      if (question.properties !== undefined || question.nodes.some((node) => kind(node) !== SyntaxKind.CallExpression || !calls.has(key(node)))) {
        throw new Error("native predicate-input roots are outside their exact call context");
      }
      if (
        context.calls.some((node) => kind(node) !== SyntaxKind.CallExpression) ||
        context.references.some(
          (node) => ![SyntaxKind.Identifier, SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression].includes(kind(node)),
        )
      ) {
        throw new Error("native predicate-input context has foreign call/reference kinds");
      }
    }
  }
}

function assertPredicateArrayRow<Anchor>(
  facts: TypeObservationValues<Anchor>,
  row: NonNullable<TypeObservationValues<Anchor>["arrayElements"]>[number],
  key: (node: Anchor) => string,
): void {
  const selectors = facts.selections?.plan.selectors ?? [];
  const indices = observationIndices(facts);
  indices.presentType(row.selector);
  if ((row.array || row.readonlyArray) !== (row.value !== null)) {
    throw new Error("native array-element presence is incomplete");
  }
  if (row.value !== null) {
    indices.type(row.value);
    const parent = selectors[row.selector];
    const child = selectors[row.value];
    const step = child?.steps.at(-1);
    const matching = row.array ? step?.kind === "array-element" : step?.kind === "type-argument" && step.index === 0;
    if (
      !matching ||
      child === undefined ||
      parent === undefined ||
      rawSelectorKey({ ...child, steps: child.steps.slice(0, -1) }, key) !== rawSelectorKey(parent, key)
    ) {
      throw new Error("native predicate-input array element selector is foreign");
    }
  }
}

function arrayArgumentSelections<Anchor>(facts: TypeObservationValues<Anchor>): ReadonlySet<number> {
  return new Set(
    (facts.arrayElements ?? []).flatMap((row) =>
      !row.array && row.readonlyArray && row.value !== null && facts.types[row.selector]?.typeArguments === undefined ? [row.value] : [],
    ),
  );
}
