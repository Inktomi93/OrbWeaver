// Trace the actual persisted producer through Drizzle reads, callable bodies, immutable aliases,
// selected object/array projections and proved schema normalizers. An annotated Row alone is identity.
import { readCallBindings, readCallReturns } from "@orb/tooling/floor/code-facts/call-returns";
import { resolveModuleMemberOrigin, resolveStableExpression, staticMemberAccess } from "@orb/tooling/floor/code-facts/reference-fact";
import { lexicalReferenceSymbol } from "@orb/tooling/floor/code-facts/reference-fact-alias";
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { DrizzleNormalization, DrizzleOriginReaders, DrizzleValueContext, JsonColumnOrigin } from "./drizzle-origin-contract.ts";
import { schemaRowOriginIdentity } from "./drizzle-row-origin.ts";
import { readDrizzleSelection } from "./drizzle-select.ts";
import { declaredInDrizzle, readCalledMember } from "./drizzle-write-chain.ts";
import { unwrapTarget as unwrapExpression } from "./reference-fact-alias.ts";
import type { SchemaProjectedTable } from "./schema-projection-contract.ts";
import { propertyValue } from "./value-carrier.ts";

const NATIVE_READERS: DrizzleOriginReaders = {
  module: resolveModuleMemberOrigin,
  stable: resolveStableExpression,
  member: (node) => staticMemberAccess(node),
  valueDeclaration: (node) => (Node.isIdentifier(node) ? lexicalReferenceSymbol(node)?.getValueDeclaration() : node.getSymbol()?.getValueDeclaration()),
  declarations: (node) => node.getSymbol()?.getDeclarations() ?? [],
  calledMember: readCalledMember,
  selection: readDrizzleSelection,
  rowIdentity: schemaRowOriginIdentity,
  returns: readCallReturns,
  bindings: readCallBindings,
};

/** Delivered callbacks never fall through to a syntax checker after native registration. */
export function drizzleValueReaders(context: DrizzleValueContext): DrizzleOriginReaders {
  return context.readers ?? NATIVE_READERS;
}

const CALLER: JsonColumnOrigin = { kind: "caller" };
const MISSING: JsonColumnOrigin = { kind: "missing" };
const ARRAY_ITEM = "[item]";

function refusal(node: MorphNode, detail: string): never {
  throw new Error(`json-column-writes: cannot prove persisted column origin at ${node.getSourceFile().getFilePath()}:${node.getStartLineNumber()}: ${detail}`);
}

function tableOf(node: MorphNode, context: DrizzleValueContext): SchemaProjectedTable | undefined {
  const origin = drizzleValueReaders(context).module(node);
  if (origin.kind !== "resolved" || origin.value.memberPath.length > 0 || origin.value.canonical.kind !== "project") {
    return;
  }
  const declaration = origin.value.canonical.declaration;
  return context.schema.tables.find((table) => table.declaration.compilerNode === declaration.compilerNode);
}

export function jsonStoredColumnReference(node: MorphNode, context: DrizzleValueContext): JsonColumnOrigin | undefined {
  const origin = drizzleValueReaders(context).module(node);
  if (origin.kind !== "resolved" || origin.value.canonical.kind !== "project" || origin.value.memberPath.length !== 1) {
    return;
  }
  const table = context.schema.tables.find((candidate) => candidate.declaration.compilerNode === origin.value.canonical.declaration.compilerNode);
  const column = table?.columns.find((candidate) => candidate.identity.propertyName === origin.value.memberPath[0]);
  return table === undefined || column?.json === null || column === undefined
    ? undefined
    : { kind: "column", table, column, field: undefined, historicalHeal: false };
}

function producerCall(call: import("ts-morph").CallExpression, context: DrizzleValueContext): JsonColumnOrigin | undefined {
  const selection = drizzleValueReaders(context).selection(call);
  if (
    selection === undefined ||
    !selection.calls.every((candidate) => {
      const member = drizzleValueReaders(context).calledMember(candidate);
      return member.kind === "resolved" && member.value.declarations.length > 0 && declaredInDrizzle(member.value.declarations);
    })
  ) {
    return;
  }
  const table = selection.source === undefined ? undefined : tableOf(selection.source, context);
  return table === undefined
    ? refusal(selection.root, "Drizzle select does not name a readable table")
    : { kind: selection.output, table, projection: selection.projection };
}

export function readDrizzleNormalization(call: import("ts-morph").CallExpression, context: DrizzleValueContext): DrizzleNormalization | undefined {
  if (context.readNormalizer !== undefined) {
    const fact = context.readNormalizer(call);
    if (fact.kind === "unresolved") {
      throw new Error(fact.detail);
    }
    return fact.value;
  }
  const snapshot = context.normalizers.get(call.compilerNode);
  if (
    snapshot === undefined ||
    snapshot.source !== call.getSourceFile().compilerNode ||
    snapshot.program !== call.getSourceFile().getProject().getProgram().compilerObject
  ) {
    return refusal(call, "normalizer facts are missing or belong to another native snapshot");
  }
  if (snapshot.fact.kind === "unresolved") {
    throw new Error(snapshot.fact.detail);
  }
  return snapshot.fact.value;
}

function projectionMember(
  origin: Extract<JsonColumnOrigin, { kind: "rows" | "row" }>,
  path: readonly string[],
  context: DrizzleValueContext,
): readonly JsonColumnOrigin[] {
  const [member, ...rest] = path;
  if (member === undefined) {
    return [origin];
  }
  if (origin.kind === "rows") {
    return member === ARRAY_ITEM ? project({ ...origin, kind: "row" }, rest, context) : [CALLER];
  }
  if (origin.projection !== undefined) {
    const projection = unwrapExpression(origin.projection);
    const property = Node.isObjectLiteralExpression(projection) ? projection.getProperty(member) : undefined;
    const value = propertyValue(property);
    if (value === undefined) {
      return refusal(projection, "selected object projection is opaque");
    }
    const table = tableOf(value, context);
    const column = jsonStoredColumnReference(value, context);
    if (column !== undefined) {
      return project(column, rest, context);
    }
    return table === undefined ? traceJsonColumnValue(value, rest, context) : project({ kind: "row", table, projection: undefined }, rest, context);
  }
  const column = origin.table.columns.find((candidate) => candidate.identity.propertyName === member);
  return column?.json === null || column === undefined
    ? [CALLER]
    : project({ kind: "column", table: origin.table, column, field: undefined, historicalHeal: false }, rest, context);
}

function project(origin: JsonColumnOrigin, path: readonly string[], context: DrizzleValueContext): readonly JsonColumnOrigin[] {
  if (path.length === 0) {
    return [origin];
  }
  if (origin.kind === "rows" || origin.kind === "row") {
    return projectionMember(origin, path, context);
  }
  if (origin.kind === "column") {
    return [{ ...origin, field: origin.field ?? path[0] }];
  }
  return [origin];
}

function objectMember(object: import("ts-morph").ObjectLiteralExpression, path: readonly string[], context: DrizzleValueContext): readonly JsonColumnOrigin[] {
  const [name, ...rest] = path;
  if (name === undefined) {
    return [CALLER];
  }
  for (const property of object.getProperties().toReversed()) {
    if (Node.isSpreadAssignment(property)) {
      const values = traceJsonColumnValue(property.getExpression(), path, context);
      if (values.some((value) => value.kind !== "caller" && value.kind !== "missing")) {
        return values;
      }
    } else if ((Node.isPropertyAssignment(property) || Node.isShorthandPropertyAssignment(property)) && property.getName() === name) {
      const value = propertyValue(property);
      return value === undefined ? [MISSING] : traceJsonColumnValue(value, rest, context);
    }
  }
  return [MISSING];
}

function traceNormalizer(
  call: import("ts-morph").CallExpression,
  path: readonly string[],
  context: DrizzleValueContext,
  normalizer: DrizzleNormalization,
): readonly JsonColumnOrigin[] {
  const argument = call.getArguments()[0];
  if (argument === undefined) {
    return refusal(call, "normalizer has no input");
  }
  const inputs = traceJsonColumnValue(argument, [], context);
  for (const origin of inputs) {
    if (origin.kind !== "column") {
      continue;
    }
    const match = normalizer.matches.get(origin.column);
    const allowed = origin.field === undefined ? match?.whole : match?.fields.has(origin.field);
    if (allowed !== true) {
      return refusal(call, "known schema output does not own the same column/member shape");
    }
  }
  return traceJsonColumnValue(argument, path, context).map((origin) =>
    origin.kind === "column" ? { ...origin, historicalHeal: origin.historicalHeal || normalizer.proof.historicalHeal } : origin,
  );
}

function traceCallableBody(call: import("ts-morph").CallExpression, path: readonly string[], context: DrizzleValueContext): readonly JsonColumnOrigin[] {
  const member = drizzleValueReaders(context).member(call.getExpression());
  const opaqueInputs = [...call.getArguments(), ...(member === undefined ? [] : [member.receiver])];
  if (
    member?.name === "parse" &&
    opaqueInputs.some((input) => traceJsonColumnValue(input, [], context).some((value) => value.kind === "column" || value.kind === "row"))
  ) {
    return refusal(call, "custom parse is not a proved normalizer");
  }
  const returns = drizzleValueReaders(context).returns(call);
  if (returns.kind === "unresolved") {
    if (
      drizzleValueReaders(context).rowIdentity(call) !== undefined ||
      opaqueInputs.some((input) => traceJsonColumnValue(input, [], context).some((value) => value.kind === "column" || value.kind === "row"))
    ) {
      return refusal(call, "opaque producer/view cannot certify persisted field provenance");
    }
    return [CALLER];
  }
  const next = { ...context, bindings: drizzleValueReaders(context).bindings(call, returns.trace.origin, context.bindings) };
  return returns.value.flatMap((value) => traceJsonColumnValue(value, path, next));
}

function traceCall(call: import("ts-morph").CallExpression, path: readonly string[], context: DrizzleValueContext): readonly JsonColumnOrigin[] {
  const producer = producerCall(call, context);
  if (producer !== undefined) {
    return project(producer, path, context);
  }
  const normalizer = readDrizzleNormalization(call, context);
  return normalizer === undefined ? traceCallableBody(call, path, context) : traceNormalizer(call, path, context, normalizer);
}

function traceIdentifier(node: import("ts-morph").Identifier, path: readonly string[], context: DrizzleValueContext): readonly JsonColumnOrigin[] {
  const declaration = drizzleValueReaders(context).valueDeclaration(node);
  const bound = declaration === undefined ? undefined : context.bindings.get(declaration);
  if (bound !== undefined) {
    return traceJsonColumnValue(bound, path, context);
  }
  const stable = drizzleValueReaders(context).stable(node);
  if (stable.kind === "resolved" && stable.value.compilerNode !== node.compilerNode) {
    return traceJsonColumnValue(stable.value, path, context);
  }
  if (stable.kind === "unresolved" && stable.reason === "dynamic" && !Node.isBindingElement(stable.node) && stable.node.compilerNode !== node.compilerNode) {
    return traceJsonColumnValue(stable.node, path, context);
  }
  if (stable.kind === "unresolved" && Node.isBindingElement(stable.node)) {
    const binding = stable.node;
    const parent = binding.getParentIfKind(SyntaxKind.ObjectBindingPattern)?.getParentIfKind(SyntaxKind.VariableDeclaration);
    const initializer = parent?.getInitializer();
    const name = binding.getPropertyNameNode()?.getText() ?? binding.getName();
    if (initializer !== undefined && binding.getDotDotDotToken() === undefined && binding.getInitializer() === undefined) {
      return traceJsonColumnValue(initializer, [name, ...path], context);
    }
  }
  const declarations = drizzleValueReaders(context).declarations(node);
  if (node.getText() === "undefined" && declarations.every((item) => /^lib\..*\.d\.ts$/u.test(item.getSourceFile().getBaseName()))) {
    return [MISSING];
  }
  return [CALLER];
}

function traceEntered(node: MorphNode, path: readonly string[], context: DrizzleValueContext): readonly JsonColumnOrigin[] {
  if (Node.isAwaitExpression(node)) {
    return traceJsonColumnValue(node.getExpression(), path, context);
  }
  if (Node.isIdentifier(node)) {
    return traceIdentifier(node, path, context);
  }
  if (Node.isConditionalExpression(node)) {
    return [...traceJsonColumnValue(node.getWhenTrue(), path, context), ...traceJsonColumnValue(node.getWhenFalse(), path, context)];
  }
  if (Node.isObjectLiteralExpression(node)) {
    return objectMember(node, path, context);
  }
  if (Node.isCallExpression(node)) {
    return traceCall(node, path, context);
  }
  if (Node.isElementAccessExpression(node) && Node.isNumericLiteral(node.getArgumentExpression())) {
    return traceJsonColumnValue(node.getExpression(), [ARRAY_ITEM, ...path], context);
  }
  const member = drizzleValueReaders(context).member(node);
  return member === undefined ? [CALLER] : traceJsonColumnValue(member.receiver, [member.name, ...path], context);
}

function unboundRootParameter(node: MorphNode, context: DrizzleValueContext): boolean {
  const binding = drizzleValueReaders(context).stable(node);
  const declaration = binding.kind === "resolved" ? binding.value : binding.node;
  return Node.isParameterDeclaration(declaration) && !context.bindings.has(declaration);
}

interface IncomingField {
  readonly root: MorphNode;
  readonly path: readonly string[];
}

function parameterProjection(
  binding: import("ts-morph").BindingElement,
  path: readonly string[],
  context: DrizzleValueContext,
  seen: ReadonlySet<object>,
): IncomingField | undefined {
  const parameter = binding.getParentIfKind(SyntaxKind.ObjectBindingPattern)?.getParentIfKind(SyntaxKind.Parameter);
  if (
    parameter === undefined ||
    parameter.getInitializer() !== undefined ||
    binding.getInitializer() !== undefined ||
    binding.getDotDotDotToken() !== undefined ||
    !Node.isIdentifier(binding.getNameNode())
  ) {
    return;
  }
  const key = binding.getPropertyNameNode() ?? binding.getNameNode();
  const literalName = Node.isStringLiteral(key) ? key.getLiteralText() : undefined;
  const name = Node.isIdentifier(key) ? key.getText() : literalName;
  if (name === undefined) {
    return;
  }
  const projected = [name, ...path];
  const argument = context.bindings.get(parameter);
  return argument === undefined ? { root: parameter, path: projected } : incomingField(argument, projected, context, new Set(seen));
}

function incomingField(node: MorphNode, path: readonly string[], context: DrizzleValueContext, seen = new Set<object>()): IncomingField | undefined {
  const current = unwrapExpression(node);
  if (seen.has(current.compilerNode)) {
    return;
  }
  const next = new Set(seen).add(current.compilerNode);
  if (Node.isCallExpression(current) && readDrizzleNormalization(current, context) !== undefined) {
    const input = current.getArguments()[0];
    return input === undefined ? undefined : incomingField(input, path, context, next);
  }
  const member = drizzleValueReaders(context).member(current);
  if (member !== undefined) {
    return incomingField(member.receiver, [member.name, ...path], context, next);
  }
  if (!Node.isIdentifier(current)) {
    return;
  }
  const declaration = drizzleValueReaders(context).valueDeclaration(current);
  const bound = declaration === undefined ? undefined : context.bindings.get(declaration);
  if (bound !== undefined) {
    return incomingField(bound, path, context, next);
  }
  const binding = drizzleValueReaders(context).stable(current);
  const value = binding.kind === "resolved" ? binding.value : binding.node;
  if (Node.isBindingElement(value)) {
    return parameterProjection(value, path, context, next);
  }
  if (Node.isParameterDeclaration(value)) {
    const argument = context.bindings.get(value);
    return argument === undefined ? { root: value, path } : incomingField(argument, path, context, next);
  }
  return value.compilerNode === current.compilerNode ? undefined : incomingField(value, path, context, next);
}

function sameField(left: IncomingField, right: IncomingField | undefined): boolean {
  return (
    right !== undefined &&
    left.root.compilerNode === right.root.compilerNode &&
    left.path.length === right.path.length &&
    left.path.every((key, i) => key === right.path[i])
  );
}

function providedField(node: MorphNode, expected: IncomingField, context: DrizzleValueContext, seen = new Set<object>()): boolean {
  const current = unwrapExpression(node);
  if (seen.has(current.compilerNode)) {
    return false;
  }
  const next = new Set(seen).add(current.compilerNode);
  const reference = incomingField(current, [], context);
  if (reference !== undefined) {
    return sameField(expected, reference);
  }
  if (Node.isBinaryExpression(current) && current.getOperatorToken().getKind() === SyntaxKind.QuestionQuestionToken) {
    const right = unwrapExpression(current.getRight());
    return (
      (right.getKind() === SyntaxKind.NullKeyword || traceJsonColumnValue(right, [], context).every((origin) => origin.kind === "missing")) &&
      providedField(current.getLeft(), expected, context, next)
    );
  }
  if (Node.isArrayLiteralExpression(current)) {
    const elements = current.getElements();
    const spread = elements.length === 1 ? elements[0] : undefined;
    return Node.isSpreadElement(spread) && providedField(spread.getExpression(), expected, context, next);
  }
  if (Node.isIdentifier(current)) {
    const binding = drizzleValueReaders(context).stable(current);
    return binding.kind === "resolved" && binding.value.compilerNode !== current.compilerNode && providedField(binding.value, expected, context, next);
  }
  if (!Node.isCallExpression(current)) {
    return false;
  }
  const returns = drizzleValueReaders(context).returns(current);
  if (returns.kind === "unresolved") {
    return false;
  }
  const args = current.getArguments();
  const supplied = args.filter((argument) => !traceJsonColumnValue(argument, [], context).every((origin) => origin.kind === "column"));
  const bodyContext = { ...context, bindings: drizzleValueReaders(context).bindings(current, returns.trace.origin, context.bindings) };
  // Calls may derive the supplied field (the RPG record merge does); every incoming input and
  // captured field must still be this exact receiver/member, not an unrelated optional axis.
  const captures = returns.trace.origin
    .getDescendants()
    .filter((child) => drizzleValueReaders(context).member(child) !== undefined)
    .map((child) => incomingField(child, [], bodyContext))
    .filter((field) => field !== undefined);
  return (
    supplied.length > 0 &&
    supplied.every((argument) => providedField(argument, expected, context, next)) &&
    captures.every((field) => sameField(expected, field))
  );
}

/** Compare lexical caller identity after real helper bindings and immutable member aliases. */
export function jsonColumnGuardMatchesProvided(guard: MorphNode, provided: MorphNode, context: DrizzleValueContext, member?: string): boolean {
  const reference = incomingField(guard, member === undefined ? [] : [member], context);
  return reference !== undefined && reference.path.length > 0 && providedField(provided, reference, context);
}

/** Actual source/body trace. Schema identity annotations are checked against, never substituted for, the producer. */
export function traceJsonColumnValue(node: MorphNode, path: readonly string[], context: DrizzleValueContext): readonly JsonColumnOrigin[] {
  const current = unwrapExpression(node);
  if (context.active.has(current.compilerNode)) {
    return refusal(current, "producer binding/body cycle");
  }
  const next = { ...context, active: new Set(context.active).add(current.compilerNode) };
  const values = traceEntered(current, path, next);
  if (path.length > 0 && !unboundRootParameter(current, context)) {
    const claimed = drizzleValueReaders(context).rowIdentity(current);
    if (claimed !== undefined) {
      const table = tableOf(claimed, context);
      if (table !== undefined && values.some((value) => value.kind !== "missing" && (value.kind !== "column" || value.table !== table))) {
        return refusal(current, "fabricated/foreign annotated row is not the persisted producer it claims");
      }
    }
  }
  return values;
}
