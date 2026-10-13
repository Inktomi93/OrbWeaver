// Value carriers and lexical reference uses; consumers judge whether an observed use is permitted.
import type { CallExpression, Node, ObjectLiteralExpression, ts } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import { readCallBindings, readCallReturnProgram } from "./call-returns.ts";
import { readStaticString, resolveStableExpression, staticMemberAccess } from "./reference-fact.ts";
import { lexicalReferenceSymbol, unwrapTarget } from "./reference-fact-alias.ts";
import type { CallReturnObservations, CallReturnProgram, ReferenceFact, ReturnedValueSource } from "./reference-fact-contract.ts";

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

interface ReturnedValueContext {
  readonly program: CallReturnProgram;
  readonly terminals: ReadonlySet<ts.CallExpression>;
  readonly bindings: ReadonlyMap<Node, Node>;
  readonly active: ReadonlySet<ts.Node>;
}

function valueRefusal(
  node: Node,
  reason: import("./reference-fact-contract.ts").ReferenceUnresolvedReason,
  detail: string,
): ReferenceFact<readonly ReturnedValueSource[]> {
  return { kind: "unresolved", reason, detail, node, trace: { declarations: [], origin: node } };
}

function valueLeaf(value: Node, path: readonly string[], context: ReturnedValueContext): ReferenceFact<readonly ReturnedValueSource[]> {
  return { kind: "resolved", value: [{ value, path, bindings: context.bindings, present: true }], trace: { declarations: [], origin: value } };
}

function valueAlternatives(node: Node, facts: readonly ReferenceFact<readonly ReturnedValueSource[]>[]): ReferenceFact<readonly ReturnedValueSource[]> {
  const failure = facts.find((fact) => fact.kind === "unresolved");
  return (
    failure ?? { kind: "resolved", value: facts.flatMap((fact) => (fact.kind === "resolved" ? fact.value : [])), trace: { declarations: [], origin: node } }
  );
}

function returnedPropertyValue(
  property: Exclude<ReturnType<ObjectLiteralExpression["getProperties"]>[number], import("ts-morph").SpreadAssignment>,
  name: string,
  rest: readonly string[],
  context: ReturnedValueContext,
): ReferenceFact<readonly ReturnedValueSource[]> | undefined {
  const key = property.getNameNode();
  const known = N.isComputedPropertyName(key) ? readStaticString(key.getExpression()) : undefined;
  if (known?.kind === "unresolved") {
    return valueRefusal(property, known.reason, "a computed returned-object key can overwrite the projected value");
  }
  const keyName = known?.kind === "resolved" ? known.value : property.getName();
  if (keyName !== name) {
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

function returnedCallValue(call: CallExpression, path: readonly string[], context: ReturnedValueContext): ReferenceFact<readonly ReturnedValueSource[]> {
  if (context.terminals.has(call.compilerNode)) {
    return valueLeaf(call, path, context);
  }
  const observed = context.program.byCall.get(call.compilerNode);
  if (observed === undefined) {
    return valueRefusal(call, "missing", "the returned call was not supplied in this native invocation");
  }
  if (observed.target.kind === "unresolved") {
    return observed.target;
  }
  if (observed.returns.kind === "unresolved") {
    return observed.returns;
  }
  const next = { ...context, bindings: readCallBindings(call, observed.target.value, context.bindings) };
  return valueAlternatives(
    call,
    observed.returns.value.map((value) => returnedValue(value, path, next)),
  );
}

function returnedIdentifierValue(
  node: import("ts-morph").Identifier,
  path: readonly string[],
  context: ReturnedValueContext,
): ReferenceFact<readonly ReturnedValueSource[]> {
  const declaration = lexicalReferenceSymbol(node)?.getValueDeclaration();
  const bound = declaration === undefined ? undefined : context.bindings.get(declaration);
  if (bound !== undefined) {
    return returnedValue(bound, path, context);
  }
  const stable = resolveStableExpression(node);
  const value = stable.kind === "resolved" ? stable.value : stable.node;
  if (stable.kind === "unresolved" && !["dynamic", "missing"].includes(stable.reason)) {
    return stable;
  }
  if (N.isBindingElement(value)) {
    const parent = value.getParentIfKind(SyntaxKind.ObjectBindingPattern)?.getParentIfKind(SyntaxKind.VariableDeclaration);
    const initializer = parent?.getInitializer();
    if (initializer === undefined || value.getDotDotDotToken() !== undefined || value.getInitializer() !== undefined) {
      return valueRefusal(value, "unsupported", "the returned destructuring source is opaque");
    }
    return returnedValue(initializer, [value.getPropertyNameNode()?.getText() ?? value.getName(), ...path], context);
  }
  return value.compilerNode === node.compilerNode || N.isParameterDeclaration(value) ? valueLeaf(node, path, context) : returnedValue(value, path, context);
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
    return valueAlternatives(value, [returnedValue(value.getWhenTrue(), path, next), returnedValue(value.getWhenFalse(), path, next)]);
  }
  if (N.isObjectLiteralExpression(value)) {
    return returnedObjectValue(value, path, next);
  }
  if (N.isCallExpression(value)) {
    return returnedCallValue(value, path, next);
  }
  const member = staticMemberAccess(value);
  return member === undefined ? valueLeaf(value, path, next) : returnedValue(member.receiver, [member.name, ...path], next);
}

/** Read-oriented value provenance: terminal declarations are supplied by the consumer, never guessed by name.
 * An unbound parameter remains caller input; this observation cannot mint persisted-row authority. */
export function readReturnedValue(
  node: Node,
  path: readonly string[],
  observations: CallReturnObservations,
  terminals: ReadonlySet<ts.CallExpression>,
): ReferenceFact<readonly ReturnedValueSource[]> {
  const program = readCallReturnProgram(node, observations);
  return program.kind === "unresolved" ? program : returnedValue(node, path, { program: program.value, terminals, bindings: new Map(), active: new Set() });
}
