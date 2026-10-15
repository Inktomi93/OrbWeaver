// Value carriers and lexical reference uses; consumers judge whether an observed use is permitted.
import type { CallExpression, Node, ObjectLiteralExpression, ts } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import { readCallBindings, readCallReturnProgram, readSuppliedParameter } from "./call-supplied.ts";
import { readStaticString, resolveStableExpression, staticMemberAccess } from "./reference-fact.ts";
import { lexicalReferenceSymbol, unwrapTarget } from "./reference-fact-alias.ts";
import type {
  CallReturnAlternative,
  CallReturnObservations,
  NativeValueTransferServices,
  ReferenceFact,
  ReturnedValueContext,
  ReturnedValueInputs,
  ReturnedValueSource,
  ReturnedValueTerminals,
  UnresolvedReferenceFact,
} from "./reference-fact-contract.ts";
import { isReferenceWriteTarget, unprovenReferenceUse } from "./reference-fact-writes.ts";
import { readStaticAuthoredValue } from "./static-authored-value.ts";
import { nativeParameterFieldsUnchanged, readNativeRetainedReturn, readNativeReturnedCall } from "./value-carrier-native.ts";

/** The value a real object member carries; a method or opaque spread is not a property value. */
export function propertyValue(property: Node | undefined): Node | undefined {
  if (N.isPropertyAssignment(property)) {
    return property.getInitializer();
  }
  return N.isShorthandPropertyAssignment(property) ? property.getNameNode() : undefined;
}

/** Climb wrappers that hand the same value on: parentheses, `!`, the left of `??`/`||`, a conditional branch, an
 *  array element or spread, and an object-literal property or spread (the literal carries the value onward). */
export function valueSite(node: Node): Node {
  let site = node;
  for (let parent = site.getParent(); parent !== undefined; parent = site.getParent()) {
    const carries =
      N.isParenthesizedExpression(parent) ||
      N.isNonNullExpression(parent) ||
      (N.isBinaryExpression(parent) &&
        parent.getLeft() === site &&
        [SyntaxKind.QuestionQuestionToken, SyntaxKind.BarBarToken].includes(parent.getOperatorToken().getKind())) ||
      (N.isConditionalExpression(parent) && parent.getCondition() !== site) ||
      N.isArrayLiteralExpression(parent) ||
      N.isSpreadElement(parent) ||
      N.isSpreadAssignment(parent) ||
      (N.isPropertyAssignment(parent) && parent.getInitializer() === site) ||
      N.isShorthandPropertyAssignment(parent) ||
      N.isObjectLiteralExpression(parent);
    if (!carries) {
      return site;
    }
    site = parent;
  }
  return site;
}

export function argumentIndex(call: CallExpression, site: Node): number {
  return call.getArguments().indexOf(site);
}

/** The references to a binding inside `scope`, excluding the binding's own name. */
export function referencesOf(name: Node, scope: Node): readonly Node[] {
  const symbol = name.getSymbol()?.compilerSymbol;
  return symbol === undefined ? [] : scope.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => id !== name && id.getSymbol()?.compilerSymbol === symbol);
}

// The key a carried value enters a literal under: a property or shorthand name, never a spread.
function keyEntering(child: Node | undefined): string | undefined {
  return child !== undefined && (N.isPropertyAssignment(child) || N.isShorthandPropertyAssignment(child)) ? child.getName() : undefined;
}

// Every object literal the value is carried into, innermost first, with the key it entered under and the literal's
// own node: the write's row is whichever of them a drizzle write takes as its argument (or as a batch element), or
// whose contextual type is an insert model.
export function carryingLiterals(node: Node): readonly { readonly literal: ObjectLiteralExpression; readonly key: string | undefined }[] {
  const out: { literal: ObjectLiteralExpression; key: string | undefined }[] = [];
  const site = valueSite(node);
  let child = node;
  for (let current = node; current !== site; ) {
    const parent = current.getParent();
    if (parent === undefined) {
      break;
    }
    if (N.isObjectLiteralExpression(parent)) {
      out.push({ literal: parent, key: keyEntering(child) });
    }
    child = parent;
    current = parent;
  }
  return out;
}

function valueRefusal(node: Node, reason: import("./reference-fact-contract.ts").ReferenceUnresolvedReason, detail: string): UnresolvedReferenceFact {
  return { kind: "unresolved", reason, detail, node, trace: { declarations: [], origin: node } };
}

function valueLeaf(value: Node, path: readonly string[], context: ReturnedValueContext, present = true): ReferenceFact<readonly ReturnedValueSource[]> {
  const parameter = N.isIdentifier(value) ? lexicalReferenceSymbol(value)?.getValueDeclaration() : undefined;
  const iteration = parameter === undefined ? undefined : context.nativeIterations.get(parameter);
  return {
    kind: "resolved",
    value: [{ value, path, bindings: context.bindings, present, ...(iteration === undefined ? {} : { nativeIteration: iteration }) }],
    trace: { declarations: [], origin: value },
  };
}

function valueAlternatives(node: Node, facts: readonly ReferenceFact<readonly ReturnedValueSource[]>[]): ReferenceFact<readonly ReturnedValueSource[]> {
  const failure = facts.find((fact) => fact.kind === "unresolved");
  return (
    failure ?? {
      kind: "resolved",
      value: facts.flatMap((fact) => (fact.kind === "resolved" ? fact.value : [])),
      trace: { declarations: facts.flatMap((fact) => fact.trace.declarations), origin: node },
    }
  );
}

function returnedPropertyValue(
  property: Exclude<ReturnType<ObjectLiteralExpression["getProperties"]>[number], import("ts-morph").SpreadAssignment>,
  name: string,
  rest: readonly string[],
  context: ReturnedValueContext,
): ReferenceFact<readonly ReturnedValueSource[]> | undefined {
  const keyName = returnedPropertyName(property);
  if (keyName.kind === "unresolved") {
    return keyName;
  }
  if (keyName.value !== name) {
    return;
  }
  const value = propertyValue(property);
  if (value === undefined) {
    return valueRefusal(property, "unsupported", "the returned member has no readable value");
  }
  const projected = returnedValue(value, rest, context);
  // The outer key exists even if its nested projection does not; a later `{manifest:{}}` shadows manifest.
  return projected.kind === "unresolved" ? projected : { ...projected, value: projected.value.map((source) => ({ ...source, present: true })) };
}

function returnedPropertyName(
  property: Exclude<ReturnType<ObjectLiteralExpression["getProperties"]>[number], import("ts-morph").SpreadAssignment>,
): ReferenceFact<string> {
  const key = property.getNameNode();
  if (N.isComputedPropertyName(key)) {
    return readStaticString(key.getExpression());
  }
  return { kind: "resolved", value: property.getName(), trace: { declarations: [], origin: property } };
}

function overlayReturnedValue(
  previous: ReferenceFact<readonly ReturnedValueSource[]>,
  next: ReferenceFact<readonly ReturnedValueSource[]>,
): ReferenceFact<readonly ReturnedValueSource[]> {
  if (next.kind === "unresolved" || next.value.every((source) => source.present)) {
    return next;
  }
  return previous.kind === "unresolved" ? previous : { ...next, value: [...next.value.filter((source) => source.present), ...previous.value] };
}

function returnedObjectValue(
  object: ObjectLiteralExpression,
  path: readonly string[],
  context: ReturnedValueContext,
): ReferenceFact<readonly ReturnedValueSource[]> {
  const [name, ...rest] = path;
  if (name === undefined) {
    return valueLeaf(object, path, context);
  }
  let result: ReferenceFact<readonly ReturnedValueSource[]> = {
    kind: "resolved",
    value: [{ value: object, path, bindings: context.bindings, present: false }],
    trace: { declarations: [], origin: object },
  };
  // Apply writes in order: present alternatives replace, absent alternatives alone inherit earlier values.
  for (const property of object.getProperties()) {
    if (N.isSpreadAssignment(property)) {
      result = overlayReturnedValue(result, returnedValue(property.getExpression(), path, context));
    } else {
      const member = returnedPropertyValue(property, name, rest, context);
      if (member !== undefined) {
        result = member;
      }
    }
  }
  return result;
}

function projectedReturnPaths(alternative: CallReturnAlternative, context: ReturnedValueContext): ReferenceFact<readonly Node[]> {
  if (context.nativeValueTransfers) {
    return alternative.nativeReturns ?? valueRefusal(alternative.target, "missing", "native return projection was not requested in captured observations");
  }
  return context.explicitAbsentReturns
    ? (alternative.explicitReturns ?? valueRefusal(alternative.target, "missing", "explicit return projection was not requested in captured observations"))
    : alternative.returns;
}

function returnedCallValue(call: CallExpression, path: readonly string[], context: ReturnedValueContext): ReferenceFact<readonly ReturnedValueSource[]> {
  if (typeof context.terminals === "function" ? context.terminals(call) : context.terminals.has(call.compilerNode)) {
    return valueLeaf(call, path, context);
  }
  const native = context.nativeValueTransfers ? readNativeReturnedCall(call, path, context, nativeValueServices) : undefined;
  if (native !== undefined) {
    return native;
  }
  const observed = context.program?.byCall.get(call.compilerNode);
  if (observed === undefined) {
    return valueRefusal(call, "missing", "the returned call was not supplied in this native invocation");
  }
  if (observed.alternatives.kind === "unresolved") {
    return observed.alternatives;
  }
  return valueAlternatives(
    call,
    observed.alternatives.value.map((alternative) => {
      const paths = projectedReturnPaths(alternative, context);
      if (paths.kind === "unresolved") {
        return paths;
      }
      const next = { ...context, bindings: readCallBindings(call, alternative.target, context.bindings) };
      return valueAlternatives(
        call,
        paths.value.map((value) =>
          context.explicitAbsentReturns && N.isReturnStatement(value) && value.getExpression() === undefined
            ? valueLeaf(value, path, next, false)
            : readNativeRetainedReturn(value, path, next, nativeValueServices),
        ),
      );
    }),
  );
}

const nativeValueServices: NativeValueTransferServices = { readValue: returnedValue, leaf: valueLeaf, alternatives: valueAlternatives, refusal: valueRefusal };

function returnedDefaultValue(node: Node, path: readonly string[], context: ReturnedValueContext): ReferenceFact<readonly ReturnedValueSource[]> {
  const supplied = readSuppliedParameter(node, context.bindings, context.program);
  return supplied.kind === "unresolved"
    ? supplied
    : valueAlternatives(
        node,
        supplied.value.map((source) =>
          source.present
            ? returnedValue(source.value, [...source.path, ...path], { ...context, bindings: source.bindings })
            : { kind: "resolved", value: [{ ...source, path }], trace: supplied.trace },
        ),
      );
}

function boundIdentifierValue(
  node: import("ts-morph").Identifier,
  path: readonly string[],
  context: ReturnedValueContext,
): ReferenceFact<readonly ReturnedValueSource[]> | undefined {
  const declaration = lexicalReferenceSymbol(node)?.getValueDeclaration();
  const bound = declaration === undefined ? undefined : context.bindings.get(declaration);
  if (N.isParameterDeclaration(declaration) && declaration.getInitializer() !== undefined) {
    return returnedDefaultValue(node, path, context);
  }
  return bound === undefined ? undefined : returnedValue(bound, path, context);
}

function nativePrivateParameter(node: import("ts-morph").Identifier): import("ts-morph").ParameterDeclaration | undefined {
  const parameter = lexicalReferenceSymbol(node)?.getValueDeclaration();
  const owner = N.isParameterDeclaration(parameter) ? parameter.getParent() : undefined;
  return N.isParameterDeclaration(parameter) && N.isFunctionDeclaration(owner) && !owner.isExported() ? parameter : undefined;
}

function returnedNativeSuppliedParameter(
  node: import("ts-morph").Identifier,
  path: readonly string[],
  context: ReturnedValueContext,
): ReferenceFact<readonly ReturnedValueSource[]> | undefined {
  const parameter = nativePrivateParameter(node);
  if (!context.nativeValueTransfers || parameter === undefined || context.nativeIterations.has(parameter)) {
    return;
  }
  const supplied = readSuppliedParameter(node, context.bindings, context.program);
  return supplied.kind === "unresolved"
    ? supplied
    : valueAlternatives(
        node,
        supplied.value.map((source) =>
          source.present
            ? returnedValue(source.value, [...source.path, ...path], { ...context, bindings: source.bindings })
            : { kind: "resolved", value: [{ ...source, path }], trace: supplied.trace },
        ),
      );
}

function nativeParameterProjectionUnchanged(node: import("ts-morph").Identifier, path: readonly string[], context: ReturnedValueContext): boolean {
  const parameter = nativePrivateParameter(node);
  return (
    !context.nativeValueTransfers ||
    path.length === 0 ||
    parameter === undefined ||
    (context.program !== undefined && nativeParameterFieldsUnchanged(parameter, context.program))
  );
}

function returnedBindingElement(
  value: import("ts-morph").BindingElement,
  path: readonly string[],
  context: ReturnedValueContext,
): ReferenceFact<readonly ReturnedValueSource[]> {
  const pattern = value.getParent();
  const parent = pattern.getParentIfKind(SyntaxKind.VariableDeclaration);
  const initializer = parent?.getInitializer();
  if (
    initializer === undefined ||
    value.getDotDotDotToken() !== undefined ||
    value.getInitializer() !== undefined ||
    !(N.isArrayBindingPattern(pattern) || N.isObjectBindingPattern(pattern))
  ) {
    return valueRefusal(value, "unsupported", "the returned destructuring source is opaque");
  }
  const key = N.isArrayBindingPattern(pattern) ? String(pattern.getElements().indexOf(value)) : (value.getPropertyNameNode()?.getText() ?? value.getName());
  return returnedValue(initializer, [key, ...path], context);
}

function returnedIdentifierValue(
  node: import("ts-morph").Identifier,
  path: readonly string[],
  context: ReturnedValueContext,
): ReferenceFact<readonly ReturnedValueSource[]> {
  if (!nativeParameterProjectionUnchanged(node, path, context)) {
    return valueRefusal(node, "unsupported", "native helper fields have a mutated or escaping formal obligation");
  }
  const bound = boundIdentifierValue(node, path, context);
  if (bound !== undefined) {
    return bound;
  }
  const supplied = returnedNativeSuppliedParameter(node, path, context);
  if (supplied !== undefined) {
    return supplied;
  }
  const stable = resolveStableExpression(node);
  const value = stable.kind === "resolved" ? stable.value : stable.node;
  if (stable.kind === "unresolved" && !["dynamic", "missing"].includes(stable.reason)) {
    return stable;
  }
  if (N.isBindingElement(value)) {
    return returnedBindingElement(value, path, context);
  }
  const result =
    value.compilerNode === node.compilerNode || N.isParameterDeclaration(value) ? valueLeaf(node, path, context) : returnedValue(value, path, context);
  return { ...result, trace: { ...result.trace, declarations: [...stable.trace.declarations, ...result.trace.declarations] } };
}

function returnedArrayValue(
  array: import("ts-morph").ArrayLiteralExpression,
  path: readonly string[],
  context: ReturnedValueContext,
): ReferenceFact<readonly ReturnedValueSource[]> {
  const [slot, ...rest] = path;
  if (slot === undefined) {
    return valueLeaf(array, path, context);
  }
  const index = Number(slot);
  if (!Number.isSafeInteger(index) || index < 0 || String(index) !== slot || array.getElements().some(N.isSpreadElement)) {
    return valueRefusal(array, "unsupported", "the returned array slot has no fixed authored position");
  }
  const element = array.getElements()[index];
  return element === undefined || N.isOmittedExpression(element)
    ? { kind: "resolved", value: [{ value: array, path, bindings: context.bindings, present: false }], trace: { declarations: [], origin: array } }
    : returnedValue(element, rest, context);
}

function returnedConditionalValue(
  value: import("ts-morph").ConditionalExpression,
  path: readonly string[],
  context: ReturnedValueContext,
): ReferenceFact<readonly ReturnedValueSource[]> {
  if (context.nativeValueTransfers) {
    const condition = readStaticAuthoredValue(value.getCondition());
    if (condition.kind === "resolved" && condition.value.kind === "scalar" && typeof condition.value.value === "boolean") {
      return returnedValue(condition.value.value ? value.getWhenTrue() : value.getWhenFalse(), path, context);
    }
  }
  return valueAlternatives(value, [returnedValue(value.getWhenTrue(), path, context), returnedValue(value.getWhenFalse(), path, context)]);
}

function returnedValue(node: Node, path: readonly string[], context: ReturnedValueContext): ReferenceFact<readonly ReturnedValueSource[]> {
  const value = unwrapTarget(node);
  if (context.active.has(value.compilerNode)) {
    return valueRefusal(value, "cycle", "the returned value revisits its authored binding/body");
  }
  const next = { ...context, active: new Set(context.active).add(value.compilerNode) };
  if (N.isAwaitExpression(value)) {
    return returnedValue(value.getExpression(), path, next);
  }
  if (N.isIdentifier(value)) {
    return returnedIdentifierValue(value, path, next);
  }
  if (N.isConditionalExpression(value)) {
    return returnedConditionalValue(value, path, next);
  }
  if (N.isObjectLiteralExpression(value)) {
    return returnedObjectValue(value, path, next);
  }
  if (N.isArrayLiteralExpression(value)) {
    return returnedArrayValue(value, path, next);
  }
  if (N.isCallExpression(value)) {
    return returnedCallValue(value, path, next);
  }
  const member = staticMemberAccess(value);
  if (member !== undefined) {
    return returnedValue(member.receiver, [member.name, ...path], next);
  }
  if (N.isElementAccessExpression(value)) {
    return returnedComputedValue(value, path, next);
  }
  return valueLeaf(value, path, next);
}

function returnedComputedValue(
  member: import("ts-morph").ElementAccessExpression,
  path: readonly string[],
  context: ReturnedValueContext,
): ReferenceFact<readonly ReturnedValueSource[]> {
  const type = member.getArgumentExpression()?.getType();
  const selectors = type === undefined ? [] : [type];
  const literalSelectors = selectors.flatMap((selector) => (selector.isUnion() ? selector.getUnionTypes() : [selector]));
  if (literalSelectors.length === 0 || literalSelectors.some((selector) => !selector.isStringLiteral())) {
    return valueRefusal(member, "unsupported", "a computed selector has no finite literal key alternatives");
  }
  const selected = literalSelectors.map((selector) => selector.getLiteralValue());
  const objects = returnedValue(member.getExpression(), [], context);
  if (objects.kind === "unresolved") {
    return objects;
  }
  const alternatives = objects.value.map((source) => {
    if (!source.present || source.path.length > 0 || !N.isObjectLiteralExpression(source.value)) {
      return valueRefusal(member, "unsupported", "a computed value selection has no finite authored object");
    }
    const keys = source.value
      .getProperties()
      .map((property) =>
        N.isSpreadAssignment(property)
          ? valueRefusal(property, "unsupported", "computed selection through object spreads is not closed")
          : returnedPropertyName(property),
      );
    const failed = keys.find((key) => key.kind === "unresolved");
    const missing = selected.some((key) => !keys.some((candidate) => candidate.kind === "resolved" && candidate.value === key));
    const projected =
      failed ??
      (missing
        ? valueRefusal(member, "missing", "a selector alternative has no authored own property")
        : valueAlternatives(
            member,
            keys.flatMap((key) =>
              key.kind === "resolved" && selected.includes(key.value)
                ? [returnedValue(source.value, [key.value, ...path], { ...context, bindings: source.bindings })]
                : [],
            ),
          ));
    return { ...projected, trace: { ...projected.trace, declarations: [...objects.trace.declarations, ...projected.trace.declarations] } };
  });
  return valueAlternatives(member, alternatives);
}

/** Read-oriented value provenance: terminal declarations are supplied by the consumer, never guessed by name.
 * An unbound parameter remains caller input; this observation cannot mint persisted-row authority. */
export function readReturnedValue(
  node: Node,
  path: readonly string[],
  observations: CallReturnObservations,
  inputs: ReadonlySet<ts.CallExpression> | ReturnedValueInputs,
): ReferenceFact<readonly ReturnedValueSource[]> {
  const program = readCallReturnProgram(node, observations);
  if (program.kind === "unresolved") {
    return program;
  }
  const { terminals, bindings } = "terminals" in inputs ? inputs : { terminals: inputs, bindings: new Map<Node, Node>() };
  if ("terminals" in inputs && inputs.nativeValueTransfers === true && program.value.nativeValueTransfers !== true) {
    return valueRefusal(node, "missing", "native value transfer was not requested in captured observations");
  }
  if ([...bindings].some((pair) => pair.some((bound) => readCallReturnProgram(bound, observations).kind === "unresolved"))) {
    return valueRefusal(node, "unsupported", "supplied value bindings are outside the captured native world or source epoch");
  }
  return returnedValue(node, path, {
    program: program.value,
    nativeIterations: new Map(),
    nativeValueTransfers: "terminals" in inputs && inputs.nativeValueTransfers === true,
    terminals,
    bindings,
    active: new Set(),
    explicitAbsentReturns: "terminals" in inputs && inputs.explicitAbsentReturns === true,
  });
}

/** Authored value projection uses the same traversal; calls need separately supplied native observations. */
export function readAuthoredValueSources(
  node: Node,
  path: readonly string[],
  bindings: ReadonlyMap<Node, Node> = new Map(),
  terminals: ReturnedValueTerminals = new Set(),
): ReferenceFact<readonly ReturnedValueSource[]> {
  return returnedValue(node, path, {
    program: undefined,
    terminals,
    bindings,
    active: new Set(),
    explicitAbsentReturns: false,
    nativeValueTransfers: false,
    nativeIterations: new Map(),
  });
}

function callableValue(node: Node): boolean {
  return N.isArrowFunction(node) || N.isFunctionExpression(node) || N.isFunctionDeclaration(node);
}

function callableProjectionUse(use: Node, admits?: (call: CallExpression) => boolean): boolean {
  if (isReferenceWriteTarget(use)) {
    return false;
  }
  const parent = use.getParent();
  const member = parent === undefined ? undefined : staticMemberAccess(parent);
  if (parent === undefined || member?.receiver !== use) {
    return false;
  }
  const projected = readAuthoredValueSources(parent, []);
  if (projected.kind === "unresolved" || projected.value.some((source) => !source.present || source.path.length > 0)) {
    return false;
  }
  if (projected.value.every((source) => !callableValue(source.value))) {
    return true;
  }
  const call = parent.getParent();
  return (
    N.isCallExpression(call) && call.getExpression() === parent && admits?.(call) !== false && projected.value.every((source) => callableValue(source.value))
  );
}

/** Finite authored callees retain every literal alternative and refuse escaping containing objects. */
export function readAuthoredCallableSources(node: Node, admits?: (call: CallExpression) => boolean): ReferenceFact<readonly ReturnedValueSource[]> {
  const sources = readAuthoredValueSources(node, []);
  if (sources.kind === "unresolved") {
    return sources;
  }
  if (sources.value.length === 0 || sources.value.some((source) => !source.present || source.path.length > 0 || !callableValue(source.value))) {
    return valueRefusal(node, "unsupported", "the callee does not close over finite authored function bodies");
  }
  for (const declaration of sources.trace.declarations) {
    const name = N.isVariableDeclaration(declaration) ? declaration.getNameNode() : undefined;
    if (N.isIdentifier(name) && unprovenReferenceUse(name, (use) => callableProjectionUse(use, admits)) !== undefined) {
      return valueRefusal(node, "unsupported", "the callable containing value escapes its closed projected uses");
    }
  }
  return sources;
}
