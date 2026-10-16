// Native row/column origins through aliases, destructuring, callbacks and narrowed union/intersection types.
// A row annotation supplies identity, never evidence of a stored producer.
import type { BindingElement, Node as TsNode, Type } from "ts-morph";
import { Node, SyntaxKind, VariableDeclarationKind } from "ts-morph";
import type { RowOrigin } from "./drizzle-row-contract.ts";
import { arrayTypeOrigins, origin, sameTable, typeOrigins } from "./drizzle-row-type.ts";
import { readStaticString, resolveGlobalMemberOrigin, resolveStableExpression } from "./reference-fact.ts";
import { unwrapTarget as unwrap } from "./reference-fact-alias.ts";

/** The trailing name of a receiver expression (`row.captionMeta` → captionMeta, `metadata` → metadata). */
export function tailName(expr: TsNode): string | undefined {
  const e = unwrap(expr);
  if (Node.isIdentifier(e)) {
    return e.getText();
  }
  return Node.isPropertyAccessExpression(e) ? e.getName() : undefined;
}

interface ColumnReceiver {
  readonly property: string | undefined;
  readonly row: TsNode;
  readonly ambiguous: boolean;
}

function bindingProperty(binding: BindingElement): string | undefined {
  const name = binding.getPropertyNameNode() ?? binding.getNameNode();
  if (Node.isIdentifier(name)) {
    return name.getText();
  }
  const literal = readStaticString(Node.isComputedPropertyName(name) ? name.getExpression() : name);
  return literal.kind === "resolved" ? literal.value : undefined;
}

function destructuredColumn(binding: BindingElement): ColumnReceiver | undefined {
  const pattern = binding.getParentIfKind(SyntaxKind.ObjectBindingPattern);
  const declaration = pattern?.getParentIfKind(SyntaxKind.VariableDeclaration);
  const row = declaration?.getInitializer();
  if (
    row === undefined ||
    declaration?.getVariableStatement()?.getDeclarationKind() !== VariableDeclarationKind.Const ||
    binding.getDotDotDotToken() !== undefined
  ) {
    return;
  }
  const property = bindingProperty(binding);
  return { property, row, ambiguous: property === undefined || binding.getInitializer() !== undefined };
}

/** Preserve the row occurrence: narrowing before destructuring determines the captured column's origin. */
export function columnReceiver(receiver: TsNode, seen = new Set<TsNode>()): ColumnReceiver | undefined {
  const e = unwrap(receiver);
  if (Node.isPropertyAccessExpression(e)) {
    return { property: e.getName(), row: e.getExpression(), ambiguous: false };
  }
  if (!Node.isIdentifier(e)) {
    return;
  }
  const definitions = e.getDefinitionNodes();
  const declaration = definitions.length === 1 ? definitions[0] : undefined;
  if (declaration === undefined || declaration.getSourceFile() !== e.getSourceFile() || seen.has(declaration)) {
    return;
  }
  seen.add(declaration);
  if (Node.isBindingElement(declaration)) {
    return destructuredColumn(declaration);
  }
  if (!Node.isVariableDeclaration(declaration) || declaration.getVariableStatement()?.getDeclarationKind() !== VariableDeclarationKind.Const) {
    return;
  }
  const initializer = declaration.getInitializer();
  if (initializer === undefined) {
    return;
  }
  return columnReceiver(initializer, seen);
}

const ELEMENT_CALLBACKS: ReadonlySet<string> = new Set([
  "every",
  "filter",
  "find",
  "findIndex",
  "findLast",
  "findLastIndex",
  "flatMap",
  "forEach",
  "map",
  "some",
]);

/** Immutable aliases and array sources preserve alternatives; narrowing happens only at the read. */
export function rowOrigins(receiver: TsNode, seen = new Set<TsNode>()): readonly RowOrigin[] {
  const value = unwrap(receiver);
  if (seen.has(value)) {
    return [origin("unresolved", value.getType())];
  }
  const next = new Set(seen).add(value);
  if (Node.isElementAccessExpression(value)) {
    const partitionType = value.getExpression().getType().getArrayElementType();
    return collectionOrigins(value.getExpression(), next).map((source) => ({ ...source, partitionType }));
  }
  if (Node.isConditionalExpression(value)) {
    return [...rowOrigins(value.getWhenTrue(), new Set(next)), ...rowOrigins(value.getWhenFalse(), new Set(next))];
  }
  if (!Node.isIdentifier(value)) {
    return [];
  }
  const definitions = value.getDefinitionNodes();
  const declaration = definitions.length === 1 ? definitions[0] : undefined;
  if (Node.isParameterDeclaration(declaration)) {
    const typeNode = declaration.getTypeNode();
    return typeNode === undefined ? callbackOrigins(declaration, next) : typeOrigins(typeNode);
  }
  if (!Node.isVariableDeclaration(declaration)) {
    return [];
  }
  const typeNode = declaration.getTypeNode();
  if (typeNode !== undefined) {
    return typeOrigins(typeNode);
  }
  const initializer = declaration.getVariableStatement()?.getDeclarationKind() === VariableDeclarationKind.Const ? declaration.getInitializer() : undefined;
  return initializer === undefined ? [] : rowOrigins(initializer, next);
}

function collectionOrigins(receiver: TsNode, seen = new Set<TsNode>()): readonly RowOrigin[] {
  const value = unwrap(receiver);
  if (seen.has(value)) {
    return [origin("unresolved", value.getType())];
  }
  const next = new Set(seen).add(value);
  if (Node.isArrayLiteralExpression(value)) {
    return value
      .getElements()
      .flatMap((element) => (Node.isSpreadElement(element) ? collectionOrigins(element.getExpression(), new Set(next)) : rowOrigins(element, new Set(next))));
  }
  if (Node.isConditionalExpression(value)) {
    return [...collectionOrigins(value.getWhenTrue(), new Set(next)), ...collectionOrigins(value.getWhenFalse(), new Set(next))];
  }
  if (!Node.isIdentifier(value)) {
    return [];
  }
  const definitions = value.getDefinitionNodes();
  const declaration = definitions.length === 1 ? definitions[0] : undefined;
  if (!(Node.isParameterDeclaration(declaration) || Node.isVariableDeclaration(declaration))) {
    return [];
  }
  const typeNode = declaration.getTypeNode();
  if (typeNode !== undefined) {
    return arrayTypeOrigins(typeNode);
  }
  const initializer =
    Node.isVariableDeclaration(declaration) && declaration.getVariableStatement()?.getDeclarationKind() === VariableDeclarationKind.Const
      ? declaration.getInitializer()
      : undefined;
  return initializer === undefined ? [] : collectionOrigins(initializer, next);
}

function callbackOrigins(parameter: TsNode | undefined, seen = new Set<TsNode>()): readonly RowOrigin[] {
  if (!Node.isParameterDeclaration(parameter)) {
    return [];
  }
  const callback = parameter.getParent();
  if (!(Node.isArrowFunction(callback) || Node.isFunctionExpression(callback)) || callback.getParameters()[0] !== parameter) {
    return [];
  }
  const call = callback.getParentIfKind(SyntaxKind.CallExpression);
  const method = call?.getExpression().asKind(SyntaxKind.PropertyAccessExpression);
  if (call?.getArguments()[0] !== callback || method === undefined || !ELEMENT_CALLBACKS.has(method.getName())) {
    return [];
  }
  const sources = collectionOrigins(method.getExpression(), seen);
  const declaration = call.getSourceFile().getProject().getTypeChecker().getResolvedSignature(call)?.getDeclaration();
  const owner = declaration?.getParentIfKind(SyntaxKind.InterfaceDeclaration);
  const collectionType = method.getExpression().getType();
  const standardArrayMethod =
    (owner?.getName() === "Array" || owner?.getName() === "ReadonlyArray") && /^lib\..*\.d\.ts$/u.test(owner.getSourceFile().getBaseName());
  if (!standardArrayMethod) {
    return sources.some((source) => source.kind === "schema") ? [...sources, origin("unresolved", parameter.getType())] : [];
  }
  const partitionType = collectionType.getArrayElementType();
  if (partitionType === undefined && sources.length > 1 && sources.some((source) => source.table !== undefined)) {
    return [...sources, origin("unresolved", parameter.getType())];
  }
  return sources.map((source) => ({ ...source, partitionType }));
}

/** Canonical row narrowing refusal remains distinct from compiler/infrastructure failure. */
export class DrizzleRowOriginRefusal extends Error {}

function mixedOriginError(site: TsNode): never {
  throw new DrizzleRowOriginRefusal(
    `open-json parity: cannot prove schema-row origin of mixed read at ${site.getSourceFile().getFilePath()}:${site.getStartLineNumber()}`,
  );
}

export function narrowedTable(receiver: TsNode, sources: readonly RowOrigin[], liveType: Type = receiver.getType()): TsNode | undefined {
  if (!sources.some((source) => source.table !== undefined)) {
    return;
  }
  if (sources.some((source) => source.kind === "unresolved")) {
    mixedOriginError(receiver);
  }
  const partitionType = sources[0]?.partitionType;
  if (partitionType !== undefined) {
    const partitionArms = partitionType.isUnion() ? partitionType.getUnionTypes() : [partitionType];
    const sourceTypes = new Set(sources.map((source) => source.sourceType.compilerType));
    if (
      partitionArms.length < sourceTypes.size ||
      sources.some((source) => !partitionArms.some((arm) => arm.compilerType === source.sourceType.compilerType))
    ) {
      mixedOriginError(receiver);
    }
  }
  const live = liveType.compilerType;
  const matches = sources.filter((source) => source.sourceType.compilerType === live);
  if (matches.length === 0) {
    mixedOriginError(receiver);
  }
  const table = matches[0]?.table;
  if (table === undefined) {
    return matches.some((source) => source.kind === "schema") ? mixedOriginError(receiver) : undefined;
  }
  if (matches.some((source) => source.kind !== "schema" || source.table === undefined || !sameTable(table, source.table))) {
    mixedOriginError(receiver);
  }
  return table;
}

const PROMISE = "Promise";

function libraryPromise(reference: TsNode): boolean {
  const globalOrigin = resolveGlobalMemberOrigin(reference);
  return globalOrigin.kind === "resolved" && globalOrigin.value.globalName === PROMISE && globalOrigin.value.memberPath.length === 0;
}

function promiseType(type: Type): boolean {
  // A declaration name denotes the whole merged symbol; the canonical reader validates its
  // trusted library anchor and every augmentation, not the first declaration's pathname.
  return (
    type
      .getSymbol()
      ?.getDeclarations()
      .filter(Node.isInterfaceDeclaration)
      .some((declaration) => libraryPromise(declaration.getNameNode())) === true
  );
}

function rowValueType(value: TsNode): Type {
  let type = value.getType().getNonNullableType();
  if (type.getSymbol()?.getName() === PROMISE) {
    const promised = type.getTypeArguments()[0];
    if (promised === undefined || !promiseType(type)) {
      mixedOriginError(value);
    }
    type = promised.getNonNullableType();
  }
  return type;
}

/** Schema-row identity only. A writer must separately prove its actual persisted producer body. */
export function schemaRowOriginIdentity(receiver: TsNode): TsNode | undefined {
  const value = unwrap(receiver);
  const type = rowValueType(value);
  const direct = rowOrigins(value);
  if (direct.length > 0) {
    return narrowedTable(value, direct, type);
  }
  const stable = resolveStableExpression(value);
  const terminal = stable.kind === "resolved" ? stable.value : stable.node;
  const call = Node.isAwaitExpression(terminal) ? terminal.getExpression() : terminal;
  if (!Node.isCallExpression(call)) {
    return;
  }
  const declaration = call.getSourceFile().getProject().getTypeChecker().getResolvedSignature(call)?.getDeclaration();
  let annotation =
    Node.isFunctionDeclaration(declaration) ||
    Node.isMethodDeclaration(declaration) ||
    Node.isArrowFunction(declaration) ||
    Node.isFunctionExpression(declaration)
      ? declaration.getReturnTypeNode()
      : undefined;
  if (annotation !== undefined && Node.isTypeReference(annotation) && annotation.getTypeName().getText() === PROMISE) {
    if (!libraryPromise(annotation.getTypeName())) {
      mixedOriginError(receiver);
    }
    annotation = annotation.getTypeArguments()[0];
  }
  return annotation === undefined ? undefined : narrowedTable(value, typeOrigins(annotation), type);
}
