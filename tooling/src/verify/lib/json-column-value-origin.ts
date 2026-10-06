// Trace the actual persisted producer through Drizzle reads, callable bodies, immutable aliases,
// selected object/array projections and proved schema normalizers. An annotated Row alone is identity.
import { resolveModuleMemberOrigin, resolveStableExpression } from "@orb/tooling/_shared/reference-fact";
import { lexicalReferenceSymbol } from "@orb/tooling/_shared/reference-fact-alias";
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { JsonColumnOrigin, JsonColumnOriginContext } from "../contract/json-column-origin.ts";
import type { SchemaTable } from "../contract/schema-fact.ts";
import { unwrapExpression } from "./ast-read.ts";
import { readCallReturns } from "./authored-key-set.ts";
import { readDrizzleClientCall } from "./drizzle-client-call.ts";
import { jsonColumnNormalizer, jsonColumnPropertyValue } from "./json-column-normalizer.ts";
import { schemaRowOriginIdentity } from "./open-json-row-origin.ts";
import { readMemberAccess } from "./symbol-reference.ts";

const CALLER: JsonColumnOrigin = { kind: "caller" };
const MISSING: JsonColumnOrigin = { kind: "missing" };
const ARRAY_ITEM = "[item]";

function refusal(node: MorphNode, detail: string): never {
  throw new Error(`json-column-writes: cannot prove persisted column origin at ${node.getSourceFile().getFilePath()}:${node.getStartLineNumber()}: ${detail}`);
}

function tableOf(node: MorphNode, context: JsonColumnOriginContext): SchemaTable | undefined {
  const origin = resolveModuleMemberOrigin(node);
  if (origin.kind !== "resolved" || origin.value.memberPath.length > 0 || origin.value.canonical.kind !== "project") {
    return;
  }
  const declaration = origin.value.canonical.declaration;
  return context.schema.tables.find((table) => table.declaration.compilerNode === declaration.compilerNode);
}

export function jsonStoredColumnReference(node: MorphNode, context: JsonColumnOriginContext): JsonColumnOrigin | undefined {
  const origin = resolveModuleMemberOrigin(node);
  if (origin.kind !== "resolved" || origin.value.canonical.kind !== "project" || origin.value.memberPath.length !== 1) {
    return;
  }
  const table = context.schema.tables.find((candidate) => candidate.declaration.compilerNode === origin.value.canonical.declaration.compilerNode);
  const column = table?.columns.find((candidate) => candidate.identity.propertyName === origin.value.memberPath[0]);
  return table === undefined || column?.json === null || column === undefined
    ? undefined
    : { kind: "column", table, column, field: undefined, historicalHeal: false };
}

function producerCall(call: import("ts-morph").CallExpression, context: JsonColumnOriginContext): JsonColumnOrigin | undefined {
  let current: MorphNode = call;
  let table: SchemaTable | undefined;
  let projection: MorphNode | undefined;
  let output: JsonColumnOrigin | undefined;
  const result = readMemberAccess(call.getExpression())?.name === "get" ? "row" : "rows";
  while (Node.isCallExpression(current)) {
    const member = readMemberAccess(current.getExpression());
    if (member === undefined || readDrizzleClientCall(current).kind !== "drizzle") {
      return;
    }
    if (member.name === "from") {
      const argument = current.getArguments()[0];
      table = argument === undefined ? undefined : tableOf(argument, context);
    }
    if (member.name === "select") {
      projection = current.getArguments()[0];
      output = table === undefined ? refusal(current, "Drizzle select does not name a readable table") : { kind: result, table, projection };
      break;
    }
    current = member.receiver;
  }
  return output;
}

export function jsonColumnCallContext(call: import("ts-morph").CallExpression, owner: MorphNode, context: JsonColumnOriginContext): JsonColumnOriginContext {
  const bindings = new Map(context.bindings);
  if (Node.isFunctionDeclaration(owner) || Node.isArrowFunction(owner) || Node.isFunctionExpression(owner) || Node.isMethodDeclaration(owner)) {
    owner.getParameters().forEach((parameter, index) => {
      const argument = call.getArguments()[index];
      if (argument !== undefined) {
        bindings.set(parameter, argument);
      }
    });
  }
  return { ...context, bindings };
}

function projectionMember(
  origin: Extract<JsonColumnOrigin, { kind: "rows" | "row" }>,
  path: readonly string[],
  context: JsonColumnOriginContext,
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
    const value = jsonColumnPropertyValue(property);
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

function project(origin: JsonColumnOrigin, path: readonly string[], context: JsonColumnOriginContext): readonly JsonColumnOrigin[] {
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

function objectMember(
  object: import("ts-morph").ObjectLiteralExpression,
  path: readonly string[],
  context: JsonColumnOriginContext,
): readonly JsonColumnOrigin[] {
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
      const value = jsonColumnPropertyValue(property);
      return value === undefined ? [MISSING] : traceJsonColumnValue(value, rest, context);
    }
  }
  return [MISSING];
}

function traceNormalizer(
  call: import("ts-morph").CallExpression,
  path: readonly string[],
  context: JsonColumnOriginContext,
  normalizer: NonNullable<ReturnType<typeof jsonColumnNormalizer>>,
): readonly JsonColumnOrigin[] {
  const argument = call.getArguments()[0];
  if (argument === undefined) {
    return refusal(call, "normalizer has no input");
  }
  const inputs = traceJsonColumnValue(argument, [], context);
  const receiver = normalizer.schema;
  const output = receiver.getType().getProperty("_output")?.getTypeAtLocation(receiver);
  for (const origin of inputs) {
    if (origin.kind !== "column") {
      continue;
    }
    const shape = origin.column.typeOverride?.type;
    const expected = origin.field === undefined ? shape : shape?.getProperty(origin.field)?.getTypeAtLocation(argument);
    if (output === undefined || expected === undefined || !output.isAssignableTo(expected) || !expected.isAssignableTo(output)) {
      return refusal(call, "known schema output does not own the same column/member shape");
    }
  }
  return traceJsonColumnValue(argument, path, context).map((origin) =>
    origin.kind === "column" ? { ...origin, historicalHeal: origin.historicalHeal || normalizer.historicalHeal } : origin,
  );
}

function traceCallableBody(call: import("ts-morph").CallExpression, path: readonly string[], context: JsonColumnOriginContext): readonly JsonColumnOrigin[] {
  const member = readMemberAccess(call.getExpression());
  const opaqueInputs = [...call.getArguments(), ...(member === undefined ? [] : [member.receiver])];
  if (
    member?.name === "parse" &&
    opaqueInputs.some((input) => traceJsonColumnValue(input, [], context).some((value) => value.kind === "column" || value.kind === "row"))
  ) {
    return refusal(call, "custom parse is not a proved normalizer");
  }
  const returns = readCallReturns(call);
  if (returns.kind === "unresolved") {
    if (
      schemaRowOriginIdentity(call) !== undefined ||
      opaqueInputs.some((input) => traceJsonColumnValue(input, [], context).some((value) => value.kind === "column" || value.kind === "row"))
    ) {
      return refusal(call, "opaque producer/view cannot certify persisted field provenance");
    }
    return [CALLER];
  }
  const next = jsonColumnCallContext(call, returns.trace.origin, context);
  return returns.value.flatMap((value) => traceJsonColumnValue(value, path, next));
}

function traceCall(call: import("ts-morph").CallExpression, path: readonly string[], context: JsonColumnOriginContext): readonly JsonColumnOrigin[] {
  const producer = producerCall(call, context);
  if (producer !== undefined) {
    return project(producer, path, context);
  }
  const normalizer = jsonColumnNormalizer(call);
  return normalizer === undefined ? traceCallableBody(call, path, context) : traceNormalizer(call, path, context, normalizer);
}

function traceIdentifier(node: import("ts-morph").Identifier, path: readonly string[], context: JsonColumnOriginContext): readonly JsonColumnOrigin[] {
  const declaration = lexicalReferenceSymbol(node)?.getValueDeclaration();
  const bound = declaration === undefined ? undefined : context.bindings.get(declaration);
  if (bound !== undefined) {
    return traceJsonColumnValue(bound, path, context);
  }
  const stable = resolveStableExpression(node);
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
  const declarations = node.getSymbol()?.getDeclarations() ?? [];
  if (node.getText() === "undefined" && declarations.every((item) => /^lib\..*\.d\.ts$/u.test(item.getSourceFile().getBaseName()))) {
    return [MISSING];
  }
  return [CALLER];
}

function traceEntered(node: MorphNode, path: readonly string[], context: JsonColumnOriginContext): readonly JsonColumnOrigin[] {
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
  const member = readMemberAccess(node);
  return member === undefined ? [CALLER] : traceJsonColumnValue(member.receiver, [member.name, ...path], context);
}

function unboundRootParameter(node: MorphNode, context: JsonColumnOriginContext): boolean {
  const binding = resolveStableExpression(node);
  const declaration = binding.kind === "resolved" ? binding.value : binding.node;
  return Node.isParameterDeclaration(declaration) && !context.bindings.has(declaration);
}

interface IncomingField {
  readonly root: MorphNode;
  readonly path: readonly string[];
}

function incomingField(node: MorphNode, path: readonly string[], context: JsonColumnOriginContext, seen = new Set<object>()): IncomingField | undefined {
  const current = unwrapExpression(node);
  if (seen.has(current.compilerNode)) {
    return;
  }
  const next = new Set(seen).add(current.compilerNode);
  if (Node.isCallExpression(current) && jsonColumnNormalizer(current) !== undefined) {
    const input = current.getArguments()[0];
    return input === undefined ? undefined : incomingField(input, path, context, next);
  }
  const member = readMemberAccess(current);
  if (member !== undefined) {
    return incomingField(member.receiver, [member.name, ...path], context, next);
  }
  if (!Node.isIdentifier(current)) {
    return;
  }
  const declaration = lexicalReferenceSymbol(current)?.getValueDeclaration();
  const bound = declaration === undefined ? undefined : context.bindings.get(declaration);
  if (bound !== undefined) {
    return incomingField(bound, path, context, next);
  }
  const binding = resolveStableExpression(current);
  const value = binding.kind === "resolved" ? binding.value : binding.node;
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

function providedField(node: MorphNode, expected: IncomingField, context: JsonColumnOriginContext, seen = new Set<object>()): boolean {
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
    const binding = resolveStableExpression(current);
    return binding.kind === "resolved" && binding.value.compilerNode !== current.compilerNode && providedField(binding.value, expected, context, next);
  }
  if (!Node.isCallExpression(current)) {
    return false;
  }
  const returns = readCallReturns(current);
  if (returns.kind === "unresolved") {
    return false;
  }
  const args = current.getArguments();
  const supplied = args.filter((argument) => !traceJsonColumnValue(argument, [], context).every((origin) => origin.kind === "column"));
  const bodyContext = jsonColumnCallContext(current, returns.trace.origin, context);
  // Calls may derive the supplied field (the RPG record merge does); every incoming input and
  // captured field must still be this exact receiver/member, not an unrelated optional axis.
  const captures = returns.trace.origin
    .getDescendants()
    .filter((child) => readMemberAccess(child) !== undefined)
    .map((child) => incomingField(child, [], bodyContext))
    .filter((field) => field !== undefined);
  return (
    supplied.length > 0 &&
    supplied.every((argument) => providedField(argument, expected, context, next)) &&
    captures.every((field) => sameField(expected, field))
  );
}

/** Compare lexical caller identity after real helper bindings and immutable member aliases. */
export function jsonColumnGuardMatchesProvided(guard: MorphNode, provided: MorphNode, context: JsonColumnOriginContext, member?: string): boolean {
  const reference = incomingField(guard, member === undefined ? [] : [member], context);
  return reference !== undefined && reference.path.length > 0 && providedField(provided, reference, context);
}

/** Actual source/body trace. Schema identity annotations are checked against, never substituted for, the producer. */
export function traceJsonColumnValue(node: MorphNode, path: readonly string[], context: JsonColumnOriginContext): readonly JsonColumnOrigin[] {
  const current = unwrapExpression(node);
  if (context.active.has(current.compilerNode)) {
    return refusal(current, "producer binding/body cycle");
  }
  const next = { ...context, active: new Set(context.active).add(current.compilerNode) };
  const values = traceEntered(current, path, next);
  if (path.length > 0 && !unboundRootParameter(current, context)) {
    const claimed = schemaRowOriginIdentity(current);
    if (claimed !== undefined) {
      const table = tableOf(claimed, context);
      if (table !== undefined && values.some((value) => value.kind !== "missing" && (value.kind !== "column" || value.table !== table))) {
        return refusal(current, "fabricated/foreign annotated row is not the persisted producer it claims");
      }
    }
  }
  return values;
}
