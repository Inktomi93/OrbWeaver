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
