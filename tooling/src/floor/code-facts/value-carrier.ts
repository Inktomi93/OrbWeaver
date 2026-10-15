// Value carriers and lexical reference uses; consumers judge whether an observed use is permitted.
import type { CallExpression, Identifier, Node, ObjectLiteralExpression, ts } from "ts-morph";
import { Node as N, SyntaxKind, VariableDeclarationKind } from "ts-morph";
import { readCallBindings, readCallReturnProgram, readObservedCallableConsumers, readSuppliedParameter, runtimeUndefinedValue } from "./call-supplied.ts";
import { isDocumentationLinkReference, readStaticString, resolveStableExpression, staticMemberAccess } from "./reference-fact.ts";
import { lexicalReferenceSymbol, unwrapTarget } from "./reference-fact-alias.ts";
import type {
  CallReturnAlternative,
  CallReturnObservations,
  CallReturnProgram,
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

/** Strict identity observation neither transfers nor mutates the observed operand. */
export function isIdentityObservation(node: Node | undefined): boolean {
  return (
    N.isBinaryExpression(node) && [SyntaxKind.EqualsEqualsEqualsToken, SyntaxKind.ExclamationEqualsEqualsToken].includes(node.getOperatorToken().getKind())
  );
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
  return projected.kind === "unresolved"
    ? projected
    : {
        ...projected,
        value: projected.value.map((source) => ({
          ...source,
          present: true,
          ...(context.callableValues === true ? { selectedDescriptors: [{ value, bindings: context.bindings }, ...(source.selectedDescriptors ?? [])] } : {}),
        })),
      };
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
    const result = returnedDefaultValue(node, path, context);
    return { ...result, trace: { ...result.trace, declarations: [declaration, ...result.trace.declarations] } };
  }
  if (bound === undefined) {
    return;
  }
  const result = returnedValue(bound, path, context);
  return N.isParameterDeclaration(declaration) ? { ...result, trace: { ...result.trace, declarations: [declaration, ...result.trace.declarations] } } : result;
}

function returnedCallableTerminal(
  node: import("ts-morph").Identifier,
  path: readonly string[],
  context: ReturnedValueContext,
  stable: UnresolvedReferenceFact,
): ReferenceFact<readonly ReturnedValueSource[]> | undefined {
  if (context.callableValues !== true || path.length > 0 || stable.reason !== "unsupported" || !N.isFunctionDeclaration(stable.node)) {
    return;
  }
  const actual = context.program?.suppliedCallableValue?.(node);
  return actual === undefined || actual.kind === "unresolved"
    ? actual
    : {
        ...actual,
        value: [{ value: actual.value.declaration, path, present: true, bindings: context.bindings }],
        trace: { ...actual.trace, declarations: [...stable.trace.declarations, ...actual.trace.declarations] },
      };
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
    return returnedCallableTerminal(node, path, context, stable) ?? stable;
  }
  if (N.isBindingElement(value)) {
    return returnedBindingElement(value, path, context);
  }
  const result =
    value.compilerNode === node.compilerNode || N.isParameterDeclaration(value) ? valueLeaf(node, path, context) : returnedValue(value, path, context);
  return { ...result, trace: { ...result.trace, declarations: [...stable.trace.declarations, ...result.trace.declarations] } };
}

function returnedBindingKey(
  element: import("ts-morph").BindingElement,
  pattern: import("ts-morph").ArrayBindingPattern | import("ts-morph").ObjectBindingPattern,
): string {
  return N.isArrayBindingPattern(pattern) ? String(pattern.getElements().indexOf(element)) : (element.getPropertyNameNode()?.getText() ?? element.getName());
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

const OBJECT_LITERAL_PROTOTYPE_KEY = "__proto__";

function callableValue(node: Node): boolean {
  return N.isArrowFunction(node) || N.isFunctionExpression(node) || N.isFunctionDeclaration(node);
}

function optionalCallableSources(node: Node, sources: ReferenceFact<readonly ReturnedValueSource[]>): ReferenceFact<readonly ReturnedValueSource[]> {
  const nativeOptionalReceiver = (N.isPropertyAccessExpression(node) || N.isElementAccessExpression(node)) && node.hasQuestionDotToken();
  return sources.kind === "resolved" && nativeOptionalReceiver
    ? {
        ...sources,
        value: sources.value.filter(
          (source) => !(source.path.length > 0 && (source.value.getKind() === SyntaxKind.NullKeyword || runtimeUndefinedValue(source.value))),
        ),
      }
    : sources;
}

interface CallableSuppliedUse {
  readonly selectedKey: string | undefined;
  readonly path: readonly string[];
  readonly bindings: ReadonlyMap<Node, Node>;
}

function callableFormalLeaf(node: Node): import("ts-morph").ParameterDeclaration | undefined {
  if (!N.isIdentifier(node)) {
    return;
  }
  const direct = lexicalReferenceSymbol(node)?.getValueDeclaration();
  if (N.isParameterDeclaration(direct)) {
    return direct;
  }
  const stable = resolveStableExpression(node);
  if (stable.kind === "resolved") {
    return N.isParameterDeclaration(stable.value) ? stable.value : undefined;
  }
  return stable.reason === "missing" && N.isParameterDeclaration(stable.node) ? stable.node : undefined;
}

function callableNonFormalLeaf(source: ReturnedValueSource, program: CallReturnProgram): ReferenceFact<readonly ReturnedValueSource[]> {
  const actual = source.present && source.path.length === 0 && N.isIdentifier(source.value) ? program.suppliedCallableValue?.(source.value) : undefined;
  if (actual?.kind === "resolved" && callableValue(actual.value.declaration)) {
    return { ...actual, value: [{ ...source, value: actual.value.declaration }] };
  }
  return actual?.kind === "unresolved" && ["write", "ambiguous", "cycle"].includes(actual.reason)
    ? actual
    : {
        kind: "resolved",
        value: [source],
        trace: { declarations: [], origin: source.value },
      };
}

function callableSuppliedLeaves(
  node: Node,
  path: readonly string[],
  program: CallReturnProgram,
  inputs: { readonly bindings: ReadonlyMap<Node, Node>; readonly active: ReadonlySet<ts.Node>; readonly uses?: Map<Node, CallableSuppliedUse[]> } = {
    bindings: new Map(),
    active: new Set(),
  },
): ReferenceFact<readonly ReturnedValueSource[]> {
  const { bindings, active } = inputs;
  if (active.has(node.compilerNode)) {
    return valueRefusal(node, "cycle", "the supplied callable projection revisits its actual origin");
  }
  const next = new Set(active).add(node.compilerNode);
  const admitted = readCallReturnProgram(node, { programs: [program] });
  if (admitted.kind === "unresolved") {
    return admitted;
  }
  const projected = returnedValue(node, path, {
    program,
    bindings,
    active: new Set(),
    terminals: new Set(),
    explicitAbsentReturns: false,
    callableValues: true,
    nativeValueTransfers: false,
    nativeIterations: new Map(),
  });
  if (projected.kind === "unresolved") {
    return projected;
  }
  const facts = projected.value.map((source): ReferenceFact<readonly ReturnedValueSource[]> => {
    const declaration = callableFormalLeaf(source.value);
    if (!(source.present && declaration !== undefined)) {
      return callableNonFormalLeaf(source, program);
    }
    const supplied = readSuppliedParameter(declaration.getNameNode(), source.bindings, program);
    if (supplied.kind === "unresolved") {
      return supplied;
    }
    if (inputs.uses !== undefined) {
      const previous = inputs.uses.get(declaration) ?? [];
      inputs.uses.set(declaration, [
        ...previous,
        ...supplied.value.map((actual) => ({ path: source.path.slice(0, -1), selectedKey: source.path.at(-1), bindings: actual.bindings })),
      ]);
    }
    const refined = valueAlternatives(
      source.value,
      supplied.value.map((actual) =>
        actual.present
          ? callableSuppliedLeaves(actual.value, [...actual.path, ...source.path], program, {
              bindings: actual.bindings,
              active: next,
              ...(inputs.uses === undefined ? {} : { uses: inputs.uses }),
            })
          : { ...supplied, value: [{ ...actual, path: source.path }] },
      ),
    );
    return {
      ...refined,
      ...(refined.kind === "resolved" && source.selectedDescriptors !== undefined
        ? {
            value: refined.value.map((actual) => ({
              ...actual,
              selectedDescriptors: [...(source.selectedDescriptors ?? []), ...(actual.selectedDescriptors ?? [])],
            })),
          }
        : {}),
      trace: { ...refined.trace, declarations: [...supplied.trace.declarations, ...refined.trace.declarations] },
    };
  });
  const result = valueAlternatives(node, facts);
  return { ...result, trace: { ...result.trace, declarations: [...projected.trace.declarations, ...result.trace.declarations] } };
}

interface CallableUseProof {
  // This obligation ends at the callable, so it cannot fall back to a containing-record data exemption.
  readonly selectedValue?: true;
  readonly selectedKey: string | undefined;
  readonly origins: readonly ReturnedValueSource[];
  readonly completeInvocations?: true;
  readonly bindings: ReadonlyMap<Node, Node>;
  readonly path: readonly string[];
  readonly program: CallReturnProgram | undefined;
  readonly admits: ((call: CallExpression) => boolean) | undefined;
  readonly active: ReadonlySet<ts.Node>;
  readonly refuse: (refusal: UnresolvedReferenceFact) => false;
}

function matchingAllocationBindings(literal: ObjectLiteralExpression, left: ReturnedValueSource, right: ReturnedValueSource): boolean {
  const scopes = new Set(literal.getAncestors().map((node) => node.compilerNode));
  return [...left.bindings.keys(), ...right.bindings.keys()].every(
    (parameter) =>
      !(N.isParameterDeclaration(parameter) && scopes.has(parameter.getParent().compilerNode)) ||
      left.bindings.get(parameter)?.compilerNode === right.bindings.get(parameter)?.compilerNode,
  );
}

function freshCallableReceiver(receiver: ReturnedValueSource, key: string, proof: CallableUseProof): boolean {
  if (!receiver.present || receiver.path.length > 0 || !N.isObjectLiteralExpression(receiver.value)) {
    return false;
  }
  const literal = receiver.value;
  return (
    proof.origins.some((origin) => {
      if (!N.isArrowFunction(origin.value)) {
        return false;
      }
      const property = origin.value.getParent();
      if (!N.isPropertyAssignment(property) || property.getInitializer() !== origin.value || property.getParent() !== literal) {
        return false;
      }
      const selected = returnedPropertyName(property);
      return selected.kind === "resolved" && selected.value !== key && matchingAllocationBindings(literal, receiver, origin);
    }) || selectedCallableReceiver(receiver, key, proof)
  );
}

function closedCallableRecord(receiver: ReturnedValueSource, key: string, program: CallReturnProgram): boolean {
  if (!N.isObjectLiteralExpression(receiver.value)) {
    return false;
  }
  if (ordinaryCallableRecord(receiver.value)) {
    return true;
  }
  const spreads = receiver.value.getProperties().filter(N.isSpreadAssignment);
  const spread = spreads[0];
  return (
    spreads.length === 1 &&
    spread !== undefined &&
    ordinaryCallableRecord(receiver.value, spread) &&
    ordinarySpreadDataPresence(spread.getExpression(), key, receiver, program) !== undefined
  );
}

function selectedCallableReceiver(receiver: ReturnedValueSource, key: string, proof: CallableUseProof): boolean {
  const selectedKey = proof.selectedKey;
  if (
    proof.program === undefined ||
    selectedKey === undefined ||
    selectedKey === key ||
    !N.isObjectLiteralExpression(receiver.value) ||
    !closedCallableRecord(receiver, selectedKey, proof.program) ||
    !ownDataProperty(receiver, selectedKey, proof.program)
  ) {
    return false;
  }
  const selected = callableSuppliedLeaves(receiver.value, [selectedKey], proof.program, { bindings: receiver.bindings, active: new Set() });
  const literal = receiver.value;
  return (
    selected.kind === "resolved" &&
    selected.value.length > 0 &&
    selected.value.every(
      (source) =>
        source.present &&
        source.path.length === 0 &&
        proof.origins.some((origin) => source.value.compilerNode === origin.value.compilerNode && matchingAllocationBindings(literal, source, origin)),
    ) &&
    selected.value.every((source) => selectedCallableOriginUses(source, receiver, proof))
  );
}

function selectedCallableEndpoints(
  origin: ReturnedValueSource,
  receiver: ReturnedValueSource,
  proof: CallableUseProof,
): readonly NonNullable<ReturnedValueSource["selectedDescriptors"]>[number][] {
  const endpoints: NonNullable<ReturnedValueSource["selectedDescriptors"]>[number][] = [];
  const program = proof.program;
  const key = proof.selectedKey;
  if (program === undefined || key === undefined) {
    return endpoints;
  }
  const origins = [origin, ...proof.origins.filter((source) => source.value.compilerNode === origin.value.compilerNode)];
  for (const source of origins) {
    const selected = callableSuppliedLeaves(receiver.value, [key], program, { bindings: source.bindings, active: new Set() });
    if (selected.kind === "resolved") {
      endpoints.push(
        ...selected.value.flatMap((actual) =>
          actual.present &&
          actual.path.length === 0 &&
          actual.value.compilerNode === source.value.compilerNode &&
          N.isObjectLiteralExpression(receiver.value) &&
          matchingAllocationBindings(receiver.value, actual, source)
            ? (actual.selectedDescriptors ?? [])
            : [],
        ),
      );
    }
  }
  return endpoints;
}

function unrelatedCallableOriginReference(use: Node, binding: Identifier, proof: CallableUseProof): boolean | undefined {
  if (!N.isIdentifier(use)) {
    return;
  }
  const expected = callableCarrierSymbol(binding);
  const actual = callableCarrierSymbol(use);
  if (expected === undefined || actual === undefined) {
    return proof.refuse(valueRefusal(use, "ambiguous", "the selected callable reference has no exact lexical binding"));
  }
  return expected !== actual ? true : undefined;
}

function selectedCallableOriginUses(origin: ReturnedValueSource, receiver: ReturnedValueSource, proof: CallableUseProof): boolean {
  if (!N.isFunctionDeclaration(origin.value)) {
    return true;
  }
  const name = origin.value.getNameNode();
  if (name === undefined || proof.program === undefined) {
    return false;
  }
  const program = proof.program;
  const endpoints = selectedCallableEndpoints(origin, receiver, proof);
  const missing = unprovenReferenceUse(name, (use, binding) => {
    const admitted = readCallReturnProgram(use, { programs: [program] });
    if (admitted.kind === "unresolved") {
      return proof.refuse(admitted);
    }
    const unrelated = unrelatedCallableOriginReference(use, binding, proof);
    if (unrelated !== undefined) {
      return unrelated;
    }
    // Alias-group reference lists include the original declaration name, which is not a value use.
    if (use.compilerNode === name.compilerNode || isDocumentationLinkReference(use) || isIdentityObservation(use.getParent())) {
      return true;
    }
    if (isReferenceWriteTarget(use)) {
      return false;
    }
    const endpointsForUse = endpoints.filter((endpoint) => endpoint.value.compilerNode === use.compilerNode);
    if (endpointsForUse.length > 0) {
      return endpointsForUse.every((endpoint) => selectedCallableStorageUse(use, origin, { ...proof, bindings: endpoint.bindings }));
    }
    if (carryingLiterals(use).length > 0) {
      return selectedCallableStorageUse(use, origin, proof);
    }
    const call = use.getParent();
    return (
      N.isCallExpression(call) &&
      call.getExpression() === use &&
      callableProjectedUse(use, { kind: "resolved", value: [origin], trace: { declarations: [], origin: use } }, { ...proof, completeInvocations: true })
    );
  });
  return missing === undefined || proof.refuse(valueRefusal(missing, "unsupported", "the selected callable has an unproven containing value use"));
}

function selectedCallableStorageUse(use: Node, origin: ReturnedValueSource, proof: CallableUseProof): boolean {
  const containers = carryingLiterals(use);
  if (containers.length === 0 || containers.some(({ literal, key }) => key === undefined || !ordinaryCallableRecord(literal))) {
    return false;
  }
  const site = valueSite(use);
  const path = [...containers].reverse().flatMap(({ key }) => (key === undefined ? [] : [key]));
  const next = { ...proof, path, selectedValue: true as const, active: new Set([site.compilerNode]) };
  const parent = site.getParent();
  if (N.isReturnStatement(parent) && parent.getExpression() === site && proof.program !== undefined) {
    const selected = path.at(-1);
    return (
      selected !== undefined &&
      returnedCallableOwnerUses(parent, {
        owner: origin.value,
        sources: { kind: "resolved", value: [origin], trace: { declarations: [], origin: use } },
        program: proof.program,
        admits: proof.admits,
        path: path.slice(0, -1),
        selected,
        selectedPath: true,
        ...(proof.completeInvocations === true ? { completeInvocations: true } : {}),
      }) === undefined
    );
  }
  return callableProjectionUse(site, next);
}

function ordinarySpreadDataPresence(expression: Node, key: string, receiver: ReturnedValueSource, program: CallReturnProgram): readonly boolean[] | undefined {
  const sources = callableSuppliedLeaves(expression, [], program, { bindings: receiver.bindings, active: new Set() });
  if (
    sources.kind === "unresolved" ||
    sources.value.length === 0 ||
    sources.value.some((source) => !source.present || source.path.length > 0 || !ordinaryCallableRecord(source.value))
  ) {
    return;
  }
  return sources.value.map(
    (source) =>
      N.isObjectLiteralExpression(source.value) &&
      source.value.getProperties().some((property) => {
        if (N.isSpreadAssignment(property)) {
          return false;
        }
        const name = returnedPropertyName(property);
        return name.kind === "resolved" && name.value === key;
      }),
  );
}

function spreadOwnData(
  previous: boolean,
  expression: Node,
  key: string,
  inputs: { readonly receiver: ReturnedValueSource; readonly program: CallReturnProgram },
): boolean {
  const { receiver, program } = inputs;
  const present = ordinarySpreadDataPresence(expression, key, receiver, program);
  if (present !== undefined) {
    return present.some(Boolean) ? previous || present.every(Boolean) : previous;
  }
  const projected = readReturnedValue(expression, [key], { programs: [program] }, { terminals: new Set(), bindings: receiver.bindings });
  return projected.kind === "resolved" && projected.value.every((source) => !source.present) && previous;
}

function ownDataProperty(receiver: ReturnedValueSource, key: string, program: CallReturnProgram): boolean {
  if (!N.isObjectLiteralExpression(receiver.value)) {
    return false;
  }
  let data = false;
  for (const property of receiver.value.getProperties()) {
    if (N.isSpreadAssignment(property)) {
      data = spreadOwnData(data, property.getExpression(), key, { receiver, program });
      continue;
    }
    const name = returnedPropertyName(property);
    if (name.kind === "unresolved") {
      data = false;
    } else if (name.value === key) {
      data = N.isPropertyAssignment(property) || N.isShorthandPropertyAssignment(property);
    }
  }
  return data;
}

function freshCallableDataRead(member: import("./reference-fact-contract.ts").MemberReference, proof: CallableUseProof): boolean {
  if (proof.program === undefined || member.name === OBJECT_LITERAL_PROTOTYPE_KEY) {
    return false;
  }
  const parent = member.access.getParent();
  if (N.isCallExpression(parent) && parent.getExpression() === member.access) {
    return false;
  }
  const receivers = callableSuppliedLeaves(member.receiver, [], proof.program, { bindings: proof.bindings, active: new Set() });
  if (receivers.kind === "unresolved" || receivers.value.length === 0) {
    return false;
  }
  const optional = (N.isPropertyAccessExpression(member.access) || N.isElementAccessExpression(member.access)) && member.access.hasQuestionDotToken();
  const program = proof.program;
  return receivers.value.every((receiver) => {
    if (optional && (receiver.value.getKind() === SyntaxKind.NullKeyword || runtimeUndefinedValue(receiver.value))) {
      return true;
    }
    return freshCallableReceiver(receiver, member.name, proof) && ownDataProperty(receiver, member.name, program);
  });
}

function ordinaryCallableRecord(node: Node, spread?: Node): boolean {
  if (!N.isObjectLiteralExpression(node)) {
    return false;
  }
  return node.getProperties().every((property) => {
    if (property === spread) {
      return true;
    }
    if (!(N.isPropertyAssignment(property) || N.isShorthandPropertyAssignment(property))) {
      return false;
    }
    const key = returnedPropertyName(property);
    const name = property.getNameNode();
    return (
      key.kind === "resolved" &&
      key.value !== OBJECT_LITERAL_PROTOTYPE_KEY &&
      !(N.isStringLiteral(name) && name.getLiteralText() === OBJECT_LITERAL_PROTOTYPE_KEY)
    );
  });
}

function callableRecordCopy(use: Node, proof: CallableUseProof): boolean | undefined {
  const spread = use.getParent();
  const literal = spread?.getParent();
  if (proof.program === undefined || !N.isSpreadAssignment(spread) || spread.getExpression() !== use || !N.isObjectLiteralExpression(literal)) {
    return;
  }
  if (proof.active.has(literal.compilerNode) || !ordinaryCallableRecord(literal, spread)) {
    return proof.refuse(valueRefusal(literal, "unsupported", "the supplied record copy is cyclic or has an opaque own descriptor"));
  }
  const sources = callableSuppliedLeaves(use, [], proof.program, { bindings: proof.bindings, active: new Set() });
  if (sources.kind === "unresolved") {
    return proof.refuse(sources);
  }
  if (sources.value.length === 0 || sources.value.some((source) => !source.present || source.path.length > 0 || !ordinaryCallableRecord(source.value))) {
    return proof.refuse(valueRefusal(use, "unsupported", "the supplied record copy has no finite ordinary own data sources"));
  }
  return callableProjectionUse(literal, { ...proof, active: new Set(proof.active).add(literal.compilerNode) });
}

function callableArgumentHandoff(use: Node, proof: CallableUseProof): boolean | undefined {
  const site = valueSite(use);
  const literals = carryingLiterals(use);
  const parents = use.getAncestors();
  const carried = parents.slice(0, parents.indexOf(site) + 1);
  if (N.isArrayLiteralExpression(site) || carried.some((node) => N.isArrayLiteralExpression(node) || N.isSpreadElement(node))) {
    return;
  }
  if (literals.some(({ key }) => key === undefined) || (literals.length > 0 && literals.at(-1)?.literal !== site)) {
    return;
  }
  const path = [...literals].reverse().flatMap(({ key }) => (key === undefined ? [] : [key]));
  const argumentCall = site.getParent();
  if (!(N.isCallExpression(argumentCall) && argumentCall.getArguments().includes(site) && proof.admits?.(argumentCall) !== false)) {
    return;
  }
  let targets = proof.program?.byCall.get(argumentCall.compilerNode)?.targets;
  if (targets?.kind !== "resolved") {
    const demanded = proof.program?.suppliedCallableUses?.(argumentCall);
    if (demanded?.kind === "unresolved") {
      return proof.refuse(demanded);
    }
    targets = proof.program?.byCall.get(argumentCall.compilerNode)?.targets;
  }
  if (targets?.kind !== "resolved") {
    return proof.refuse(targets ?? valueRefusal(argumentCall, "missing", "the containing argument has no captured actual target"));
  }
  const index = argumentCall.getArguments().indexOf(site);
  return targets.value.every((target) => {
    if (!(N.isFunctionDeclaration(target) || N.isArrowFunction(target) || N.isFunctionExpression(target) || N.isMethodDeclaration(target))) {
      return proof.refuse(valueRefusal(target, "unsupported", "the containing argument has no authored formal body"));
    }
    if (target.getBody() === undefined) {
      return proof.refuse(valueRefusal(target, "missing", "the containing argument target has no authored use body"));
    }
    const formal = target.getParameters()[index];
    const name = formal?.getNameNode();
    if (formal === undefined || formal.isRestParameter() || !N.isIdentifier(name) || proof.active.has(formal.compilerNode)) {
      return proof.refuse(valueRefusal(use, "unsupported", "the containing argument formal is opaque or cyclic"));
    }
    const next = {
      ...proof,
      path: [...path, ...proof.path],
      bindings: readCallBindings(argumentCall, target, proof.bindings),
      active: new Set(proof.active).add(formal.compilerNode),
    };
    return callableClosedUses(name, next);
  });
}

function ordinaryCallableDataRead(node: Node, key: string, proof: CallableUseProof): boolean {
  if (proof.program === undefined || key === OBJECT_LITERAL_PROTOTYPE_KEY) {
    return false;
  }
  const receivers = callableSuppliedLeaves(node, [], proof.program, { bindings: proof.bindings, active: new Set() });
  const program = proof.program;
  return (
    receivers.kind === "resolved" &&
    receivers.value.length > 0 &&
    receivers.value.every(
      (receiver) =>
        receiver.present &&
        receiver.path.length === 0 &&
        ownDataProperty(receiver, key, program) &&
        (proof.path.length > 0 || (proof.selectedKey !== undefined && proof.selectedKey !== key && freshCallableReceiver(receiver, key, proof))),
    )
  );
}

function callableBindingUse(use: Node, proof: CallableUseProof): boolean | undefined {
  const declaration = use.getParent();
  if (!N.isVariableDeclaration(declaration) || declaration.getInitializer() !== use) {
    return;
  }
  const pattern = declaration.getNameNode();
  if (
    declaration.getParentIfKind(SyntaxKind.VariableDeclarationList)?.getDeclarationKind() !== VariableDeclarationKind.Const ||
    proof.active.has(declaration.compilerNode)
  ) {
    return proof.refuse(valueRefusal(declaration, "write", "the callable carrier alias is mutable or cyclic"));
  }
  const active = new Set(proof.active).add(declaration.compilerNode);
  if (N.isIdentifier(pattern)) {
    return callableClosedUses(pattern, { ...proof, active });
  }
  if (!N.isObjectBindingPattern(pattern)) {
    return;
  }
  return pattern.getElements().every((element) => {
    const name = element.getNameNode();
    const property = element.getPropertyNameNode();
    if (
      element.getDotDotDotToken() !== undefined ||
      element.getInitializer() !== undefined ||
      !N.isIdentifier(name) ||
      (property !== undefined && !N.isIdentifier(property))
    ) {
      return proof.refuse(valueRefusal(element, "unsupported", "the callable carrier binding is not a closed ordinary member"));
    }
    const key = returnedBindingKey(element, pattern);
    const selected = proof.path[0];
    if (selected !== undefined && key !== selected) {
      return ordinaryCallableDataRead(use, key, proof);
    }
    if (selected === undefined) {
      return (
        ordinaryCallableDataRead(use, key, proof) ||
        proof.refuse(valueRefusal(element, "unsupported", "a callable record binding does not retain a selected containing path"))
      );
    }
    if (!ordinaryCallableDataRead(use, key, proof)) {
      return proof.refuse(valueRefusal(element, "unsupported", "the selected callable carrier binding has no ordinary own data descriptor"));
    }
    return callableClosedUses(name, { ...proof, path: proof.path.slice(1), active });
  });
}

function callableCarrierSymbol(identifier: Identifier): ts.Symbol | undefined {
  const lexical = lexicalReferenceSymbol(identifier);
  return (lexical?.getAliasedSymbol() ?? lexical)?.compilerSymbol;
}

function callableClosedUses(name: Identifier, proof: CallableUseProof): boolean {
  let copied: Node | undefined;
  const missing = unprovenReferenceUse(name, (reference, binding) => {
    if (proof.program !== undefined && N.isIdentifier(reference)) {
      const expected = callableCarrierSymbol(binding);
      const actual = callableCarrierSymbol(reference);
      if (expected === undefined || actual === undefined) {
        return proof.refuse(valueRefusal(reference, "ambiguous", "the callable carrier reference has no exact lexical binding"));
      }
      if (expected !== actual) {
        const admitted = readCallReturnProgram(reference, { programs: [proof.program] });
        return admitted.kind === "resolved" || proof.refuse(admitted);
      }
    }
    const allowed = callableProjectionUse(reference, proof);
    if (proof.program !== undefined && !allowed && N.isSpreadElement(reference.getParent())) {
      copied ??= reference;
    }
    return allowed;
  });
  const escaped = missing ?? copied;
  return escaped === undefined || proof.refuse(valueRefusal(escaped, "unsupported", "the supplied callable container has an unproven or copied use"));
}

function callableProjectionUse(use: Node, proof: CallableUseProof): boolean {
  if (isDocumentationLinkReference(use)) {
    return true;
  }
  if (isReferenceWriteTarget(use)) {
    return proof.refuse(valueRefusal(use, "write", "the supplied callable containing value is written"));
  }
  const parent = use.getParent();
  if (proof.program !== undefined) {
    if (isIdentityObservation(parent)) {
      return true;
    }
    const copied = callableRecordCopy(use, proof);
    if (copied !== undefined) {
      return copied;
    }
    const handed = callableArgumentHandoff(use, proof);
    if (handed !== undefined) {
      return handed;
    }
    const binding = callableBindingUse(use, proof);
    if (binding !== undefined) {
      return binding;
    }
  }
  const selectedValue = selectedCallableValueUse(use, proof);
  if (selectedValue !== undefined) {
    return selectedValue;
  }
  const member = parent === undefined ? undefined : staticMemberAccess(parent);
  if (parent === undefined || member?.receiver !== use) {
    return false;
  }
  return callableMemberUse(parent, member, proof);
}

function selectedCallableValueUse(use: Node, proof: CallableUseProof): boolean | undefined {
  return proof.selectedValue === true && proof.path.length === 0 && proof.program !== undefined
    ? callableProjectedUse(use, callableSuppliedLeaves(use, [], proof.program, { bindings: proof.bindings, active: new Set() }), proof)
    : undefined;
}

function callableMemberUse(parent: Node, member: import("./reference-fact-contract.ts").MemberReference, proof: CallableUseProof): boolean {
  const selected = proof.path[0];
  if (selected !== undefined) {
    if (member.name === selected) {
      return ordinaryCallableDataRead(member.receiver, member.name, proof) && callableProjectionUse(parent, { ...proof, path: proof.path.slice(1) });
    }
    const invocation = parent.getParent();
    if (!(N.isCallExpression(invocation) && invocation.getExpression() === parent)) {
      return ordinaryCallableDataRead(member.receiver, member.name, proof);
    }
  }
  if (freshCallableDataRead(member, proof)) {
    return true;
  }
  const projected =
    proof.program === undefined
      ? readAuthoredValueSources(parent, [])
      : optionalCallableSources(parent, callableSuppliedLeaves(parent, [], proof.program, { bindings: proof.bindings, active: new Set() }));
  return callableProjectedUse(parent, projected, proof);
}

function unprovenCallableReceiverBody(node: Node): boolean {
  return (
    (N.isFunctionDeclaration(node) && node.getBody() === undefined) ||
    ((N.isFunctionExpression(node) || N.isFunctionDeclaration(node)) && node.getDescendantsOfKind(SyntaxKind.ThisKeyword).length > 0)
  );
}

function callableProjectedUse(parent: Node, projected: ReferenceFact<readonly ReturnedValueSource[]>, proof: CallableUseProof): boolean {
  if (projected.kind === "unresolved") {
    return proof.refuse(projected);
  }
  if (projected.value.some((source) => !source.present || source.path.length > 0)) {
    return proof.refuse(valueRefusal(parent, "missing", "a containing member has an unresolved actual origin"));
  }
  if (projected.value.every((source) => !callableValue(source.value))) {
    const invocation = parent.getParent();
    if (proof.program !== undefined && N.isCallExpression(invocation) && invocation.getExpression() === parent) {
      return proof.refuse(valueRefusal(parent, "unsupported", "an invoked containing member has no proven authored receiver body"));
    }
    return true;
  }
  if (proof.program !== undefined && projected.value.some((source) => unprovenCallableReceiverBody(source.value))) {
    return proof.refuse(valueRefusal(parent, "unsupported", "an invoked authored member has no complete authored receiver body"));
  }
  const call = parent.getParent();
  const permitted =
    N.isCallExpression(call) &&
    call.getExpression() === parent &&
    proof.admits?.(call) !== false &&
    projected.value.every((source) => callableValue(source.value));
  if (!permitted) {
    return proof.refuse(valueRefusal(parent, "unsupported", "a projected callable leaves its captured invocation"));
  }
  if (proof.completeInvocations === true) {
    const observation = proof.program?.byCall.get(call.compilerNode);
    const witness = observation?.invocationTargets ?? observation?.targets;
    return (
      (witness?.kind === "resolved" && projected.value.every((source) => witness.value.some((target) => target.compilerNode === source.value.compilerNode))) ||
      proof.refuse(valueRefusal(call, "missing", "an actual callable owner invocation has no complete settled native target witness"))
    );
  }
  return true;
}

function callableUseName(declaration: Node, supplied: boolean): Node | undefined {
  return N.isVariableDeclaration(declaration) || (supplied && N.isParameterDeclaration(declaration)) ? declaration.getNameNode() : undefined;
}

function callableContainingUseRefusal(
  sources: import("./reference-fact-contract.ts").ResolvedReferenceFact<readonly ReturnedValueSource[]>,
  admits?: (call: CallExpression) => boolean,
  program?: CallReturnProgram,
  inputs: {
    readonly continuation?: { readonly site: Node; readonly path: readonly string[]; readonly bindings: ReadonlyMap<Node, Node> };
    readonly suppliedUses?: ReadonlyMap<Node, readonly CallableSuppliedUse[]>;
    readonly completeInvocations?: true;
    readonly selectedKey?: string;
    readonly selectedValue?: true;
  } = {},
): UnresolvedReferenceFact | undefined {
  const { continuation, suppliedUses } = inputs;
  let refusal: UnresolvedReferenceFact | undefined;
  const proof: CallableUseProof = {
    origins: sources.value,
    ...(inputs.selectedValue === true ? { selectedValue: true as const } : {}),
    selectedKey: inputs.selectedKey,
    ...(inputs.completeInvocations === true ? { completeInvocations: true as const } : {}),
    bindings: continuation?.bindings ?? new Map(),
    path: continuation?.path ?? [],
    program,
    admits,
    active: new Set(),
    refuse: (fact): false => {
      refusal ??= fact;
      return false;
    },
  };
  for (const declaration of sources.trace.declarations) {
    const name = callableUseName(declaration, program !== undefined);
    if (N.isIdentifier(name)) {
      const contexts = suppliedUses?.get(declaration) ?? [proof];
      if (
        !contexts.every((context) =>
          callableClosedUses(name, { ...proof, path: context.path, bindings: context.bindings, selectedKey: context.selectedKey ?? proof.selectedKey }),
        )
      ) {
        return refusal;
      }
    }
    refusal = undefined;
  }
  if (continuation !== undefined && !callableProjectionUse(continuation.site, proof)) {
    return refusal ?? valueRefusal(continuation.site, "unsupported", "the supplied callable owner has an unproven containing continuation");
  }
  return refusal;
}

function callableOwnerUses(
  owner: Node,
  sources: import("./reference-fact-contract.ts").ResolvedReferenceFact<readonly ReturnedValueSource[]>,
  program: CallReturnProgram,
  admits?: (call: CallExpression) => boolean,
): UnresolvedReferenceFact | undefined {
  const property = owner.getParent();
  const literal = property?.getParent();
  if (!(N.isPropertyAssignment(property) && property.getInitializer() === owner && N.isObjectLiteralExpression(literal))) {
    return valueRefusal(owner, "unsupported", "the anonymous supplied callable has no closed authored record home");
  }
  const selected = returnedPropertyName(property);
  const containers = carryingLiterals(literal);
  if (selected.kind === "unresolved" || containers.some(({ key }) => key === undefined)) {
    return selected.kind === "unresolved" ? selected : valueRefusal(owner, "unsupported", "the supplied callable record is copied through an opaque key");
  }
  const path = [...containers].reverse().flatMap(({ key }) => (key === undefined ? [] : [key]));
  const site = valueSite(literal);
  const parent = site.getParent();
  if (N.isVariableDeclaration(parent)) {
    return callableContainingUseRefusal(sources, admits, program, {
      continuation: { site, path, bindings: new Map() },
      completeInvocations: true,
      selectedKey: selected.value,
    });
  }
  if (!(N.isReturnStatement(parent) && parent.getExpression() === site)) {
    return valueRefusal(site, "unsupported", "the supplied callable record leaves its authored owner through an unproven continuation");
  }
  return returnedCallableOwnerUses(parent, { owner, sources, program, admits, path, selected: selected.value });
}

function callableOwnerContinuation(call: CallExpression): ReferenceFact<{ readonly site: Node; readonly path: readonly string[] }> {
  let continuation = valueSite(call);
  const carried = [...carryingLiterals(call)];
  while (N.isAwaitExpression(continuation.getParent())) {
    const awaited = continuation.getParentOrThrow();
    carried.push(...carryingLiterals(awaited));
    continuation = valueSite(awaited);
  }
  if (N.isArrayLiteralExpression(continuation) || carried.some(({ key }) => key === undefined)) {
    return valueRefusal(continuation, "unsupported", "the actual returned callable instance is copied through an opaque carrier");
  }
  const prefix = [...carried].reverse().flatMap(({ key }) => (key === undefined ? [] : [key]));
  return { kind: "resolved", value: { site: continuation, path: prefix }, trace: { declarations: [], origin: call } };
}

function returnedCallableOwnerUses(
  statement: import("ts-morph").ReturnStatement,
  inputs: {
    readonly owner: Node;
    readonly sources: import("./reference-fact-contract.ts").ResolvedReferenceFact<readonly ReturnedValueSource[]>;
    readonly program: CallReturnProgram;
    readonly admits: ((call: CallExpression) => boolean) | undefined;
    readonly path: readonly string[];
    readonly selected: string;
    readonly selectedPath?: true;
    readonly completeInvocations?: true;
  },
): UnresolvedReferenceFact | undefined {
  const { owner, program, path, selected } = inputs;
  const factory = statement.getFirstAncestor(
    (node) => N.isFunctionDeclaration(node) || N.isFunctionExpression(node) || N.isArrowFunction(node) || N.isMethodDeclaration(node),
  );
  if (factory === undefined) {
    return valueRefusal(statement, "missing", "the returned callable record has no authored factory");
  }
  const consumers = readObservedCallableConsumers(factory, program);
  if (consumers.kind === "unresolved") {
    return consumers;
  }
  let refusal: UnresolvedReferenceFact | undefined;
  for (const consumer of consumers.value) {
    const projected = callableSuppliedLeaves(consumer.call, [...path, selected], program);
    if (projected.kind === "unresolved") {
      return projected;
    }
    const actual = projected.value.filter(
      (source) => !(source.path.length > 0 && (source.value.getKind() === SyntaxKind.NullKeyword || runtimeUndefinedValue(source.value))),
    );
    if (actual.length === 0 || actual.some((source) => !source.present || source.path.length > 0 || source.value !== owner)) {
      return valueRefusal(consumer.call, "unsupported", "a returned callable owner has an unknown or different actual factory alternative");
    }
    refusal = returnedCallableContinuationUses(consumer.call, actual, inputs);
    if (refusal !== undefined) {
      return refusal;
    }
  }
  return refusal;
}

function returnedCallableContinuationUses(
  call: CallExpression,
  actual: readonly ReturnedValueSource[],
  inputs: Parameters<typeof returnedCallableOwnerUses>[1],
): UnresolvedReferenceFact | undefined {
  const { sources, program, admits, path, selected } = inputs;
  const continued = callableOwnerContinuation(call);
  if (continued.kind === "unresolved") {
    return continued;
  }
  const { site: continuation, path: prefix } = continued.value;
  const selectedPath = inputs.selectedPath === true;
  const continuationPath = selectedPath ? [...path, selected] : path;
  const completeInvocations = !selectedPath || inputs.completeInvocations === true;
  let refusal: UnresolvedReferenceFact | undefined;
  for (const source of actual) {
    const facts = { ...sources, value: [source], trace: { ...sources.trace, declarations: [] } };
    refusal = callableContainingUseRefusal(facts, admits, program, {
      continuation: { site: continuation, path: [...prefix, ...continuationPath], bindings: source.bindings },
      ...(completeInvocations ? { completeInvocations: true as const } : {}),
      ...(selectedPath ? { selectedValue: true as const } : {}),
      selectedKey: selected,
    });
    if (refusal !== undefined) {
      return refusal;
    }
  }
  return refusal;
}

/** Finite authored callees retain every literal alternative and refuse escaping containing objects. */
export function readAuthoredCallableSources(
  node: Node,
  admits?: (call: CallExpression) => boolean,
  observations?: CallReturnObservations,
  optionalInvocation = false,
): ReferenceFact<readonly ReturnedValueSource[]> {
  const captured = observations === undefined ? undefined : readCallReturnProgram(node, observations);
  if (captured?.kind === "unresolved") {
    return captured;
  }
  const program = captured?.value.suppliedCallableTargets === true ? captured.value : undefined;
  const suppliedUses = new Map<Node, CallableSuppliedUse[]>();
  const projected =
    program === undefined
      ? readAuthoredValueSources(node, [])
      : callableSuppliedLeaves(node, [], program, { bindings: new Map(), active: new Set(), uses: suppliedUses });
  const sources = optionalInvocation ? optionalCallableSources(node, projected) : projected;
  if (sources.kind === "unresolved") {
    return sources;
  }
  if (sources.value.length === 0 || sources.value.some((source) => !source.present || source.path.length > 0 || !callableValue(source.value))) {
    return valueRefusal(node, "unsupported", "the callee does not close over finite authored function bodies");
  }
  if (program !== undefined && (N.isArrowFunction(node) || N.isFunctionExpression(node))) {
    const complete = callableOwnerUses(node, sources, program, admits);
    if (complete !== undefined) {
      return complete;
    }
  }
  const selectedKey = staticMemberAccess(node)?.name;
  const refusal = callableContainingUseRefusal(sources, admits, program, { suppliedUses, ...(selectedKey === undefined ? {} : { selectedKey }) });
  if (refusal !== undefined) {
    return refusal;
  }
  return sources;
}
