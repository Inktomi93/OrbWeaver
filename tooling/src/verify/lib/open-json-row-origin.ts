// Row/column origin resolution for the open-json parity fact (split out of open-json-parity-fact.ts at
// the size cap, docs/law/Core-Tooling-Law.md §4.3). Given a receiver expression, this answers which
// schema-derived open column, if any, it addresses — narrowing through aliases, destructuring, array
// element callbacks and union/intersection types until a live schema table can be proved or refused.
import type { BindingElement, Node as TsNode, Type, TypeReferenceNode } from "ts-morph";
import { Node, SyntaxKind, VariableDeclarationKind } from "ts-morph";
import { readStaticString } from "../../_shared/reference-fact.ts";
import type { OpenJsonColumn } from "./open-json-vocabulary.ts";
import { isOpenBag, unwrap } from "./open-json-vocabulary.ts";

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
function columnReceiver(receiver: TsNode, seen = new Set<TsNode>()): ColumnReceiver | undefined {
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

/** Keep every contributing source type and origin until TypeScript narrows the actual read. */
interface RowOrigin {
  readonly sourceType: Type;
  readonly kind: "schema" | "plain" | "unresolved";
  readonly table?: TsNode | undefined;
  readonly partitionType?: Type | undefined;
}

function origin(kind: RowOrigin["kind"], sourceType: Type, table?: TsNode): RowOrigin {
  return { sourceType, kind, table };
}

function aliasBody(typeNode: TsNode): { readonly body: TsNode; readonly generic: boolean } | undefined {
  if (!Node.isTypeReference(typeNode)) {
    return;
  }
  const symbol = typeNode.getTypeName().getSymbol();
  const declarations = (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations().filter(Node.isTypeAliasDeclaration) ?? [];
  const declaration = declarations.length === 1 ? declarations[0] : undefined;
  const body = declaration?.getTypeNode();
  return declaration === undefined || body === undefined ? undefined : { body, generic: declaration.getTypeParameters().length > 0 };
}

function schemaTableIn(origins: readonly RowOrigin[]): TsNode | undefined {
  return origins.find((item) => item.table !== undefined)?.table;
}

function referenceRowOrigins(typeNode: TypeReferenceNode, seen: ReadonlySet<TsNode>): readonly RowOrigin[] {
  const alias = aliasBody(typeNode);
  const argumentsOrigins = typeNode.getTypeArguments().flatMap((argument) => typeOrigins(argument, new Set(seen)));
  if (alias !== undefined) {
    const bodyOrigins = typeOrigins(alias.body, new Set(seen));
    return alias.generic ? [origin("unresolved", typeNode.getType(), schemaTableIn([...bodyOrigins, ...argumentsOrigins]))] : bodyOrigins;
  }
  const schemaArgument = argumentsOrigins.some((item) => item.kind !== "plain");
  return [origin(schemaArgument ? "unresolved" : "plain", typeNode.getType(), schemaTableIn(argumentsOrigins))];
}

function typeOrigins(typeNode: TsNode, seen = new Set<TsNode>()): readonly RowOrigin[] {
  if (seen.has(typeNode)) {
    return [origin("unresolved", typeNode.getType())];
  }
  const next = new Set(seen).add(typeNode);
  if (Node.isParenthesizedTypeNode(typeNode)) {
    return typeOrigins(typeNode.getTypeNode(), next);
  }
  if (Node.isTypeQuery(typeNode)) {
    const member = typeNode.getExprName();
    return [
      Node.isQualifiedName(member) && member.getRight().getText() === "$inferSelect"
        ? origin("schema", typeNode.getType(), member.getLeft())
        : origin("plain", typeNode.getType()),
    ];
  }
  if (Node.isUnionTypeNode(typeNode)) {
    return typeNode.getTypeNodes().flatMap((arm) => typeOrigins(arm, next));
  }
  if (Node.isIntersectionTypeNode(typeNode)) {
    return intersectionOrigins(typeNode, next);
  }
  if (Node.isTypeReference(typeNode)) {
    return referenceRowOrigins(typeNode, next);
  }
  if (Node.isTypeLiteral(typeNode) || typeNode.getKindName().endsWith("Keyword")) {
    return [origin("plain", typeNode.getType())];
  }
  const nestedOrigins = typeNode.getDescendantsOfKind(SyntaxKind.TypeQuery).flatMap((query) => typeOrigins(query, next));
  return [origin("unresolved", typeNode.getType(), schemaTableIn(nestedOrigins))];
}

function intersectionOrigins(typeNode: TsNode, seen: ReadonlySet<TsNode>): readonly RowOrigin[] {
  if (!Node.isIntersectionTypeNode(typeNode)) {
    return [];
  }
  const parts = typeNode.getTypeNodes().flatMap((part) => typeOrigins(part, new Set(seen)));
  const tables = parts.filter((part): part is RowOrigin & { table: TsNode } => part.kind === "schema" && part.table !== undefined);
  if (parts.some((part) => part.kind === "unresolved") || tables.some((part) => !sameTable(part.table, tables[0]?.table ?? part.table))) {
    return [origin("unresolved", typeNode.getType(), schemaTableIn(parts))];
  }
  return [tables[0] === undefined ? origin("plain", typeNode.getType()) : origin("schema", typeNode.getType(), tables[0].table)];
}

function arrayTypeOrigins(typeNode: TsNode, seen = new Set<TsNode>()): readonly RowOrigin[] {
  if (seen.has(typeNode)) {
    return [origin("unresolved", typeNode.getType())];
  }
  const next = new Set(seen).add(typeNode);
  if (Node.isParenthesizedTypeNode(typeNode)) {
    return arrayTypeOrigins(typeNode.getTypeNode(), next);
  }
  if (Node.isTypeOperatorTypeNode(typeNode) && typeNode.getOperator() === SyntaxKind.ReadonlyKeyword) {
    return arrayTypeOrigins(typeNode.getTypeNode(), next);
  }
  if (Node.isArrayTypeNode(typeNode)) {
    return typeOrigins(typeNode.getElementTypeNode());
  }
  if (Node.isUnionTypeNode(typeNode)) {
    return typeNode.getTypeNodes().flatMap((arm) => arrayTypeOrigins(arm, next));
  }
  if (Node.isTypeReference(typeNode)) {
    return referenceArrayOrigins(typeNode, next);
  }
  return [origin("unresolved", typeNode.getType())];
}

function referenceArrayOrigins(typeNode: TypeReferenceNode, seen: ReadonlySet<TsNode>): readonly RowOrigin[] {
  const name = typeNode.getTypeName().getText();
  if (name === "Array" || name === "ReadonlyArray") {
    const element = typeNode.getTypeArguments()[0];
    return element === undefined ? [origin("unresolved", typeNode.getType())] : typeOrigins(element);
  }
  const alias = aliasBody(typeNode);
  const argumentsOrigins = typeNode.getTypeArguments().flatMap((argument) => typeOrigins(argument, new Set(seen)));
  if (alias !== undefined) {
    const bodyOrigins = arrayTypeOrigins(alias.body, new Set(seen));
    return alias.generic ? [origin("unresolved", typeNode.getType(), schemaTableIn([...bodyOrigins, ...argumentsOrigins]))] : bodyOrigins;
  }
  return [origin(argumentsOrigins.some((item) => item.kind !== "plain") ? "unresolved" : "plain", typeNode.getType(), schemaTableIn(argumentsOrigins))];
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

/** The declaration behind a schema table reference. A syntactic name alone is never provenance. */
function tableDeclarations(reference: TsNode): readonly TsNode[] {
  const symbol = reference.getSymbol();
  return (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? [];
}

function sameTable(left: TsNode, right: TsNode): boolean {
  return tableDeclarations(left).some((a) =>
    tableDeclarations(right).some((b) => a.getSourceFile().getFilePath() === b.getSourceFile().getFilePath() && a.getStart() === b.getStart()),
  );
}

/** Immutable aliases and array sources preserve alternatives; narrowing happens only at the read. */
function rowOrigins(receiver: TsNode, seen = new Set<TsNode>()): readonly RowOrigin[] {
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

function mixedOriginError(site: TsNode): never {
  throw new Error(`open-json parity: cannot prove schema-row origin of mixed read at ${site.getSourceFile().getFilePath()}:${site.getStartLineNumber()}`);
}

function narrowedTable(receiver: TsNode, sources: readonly RowOrigin[]): TsNode | undefined {
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
  const live = receiver.getType().compilerType;
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

function ownsColumn(tableRef: TsNode, column: OpenJsonColumn): boolean {
  const schemaTable = column.node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  return (
    schemaTable !== undefined &&
    tableDeclarations(tableRef).some(
      (declaration) =>
        declaration.getSourceFile().getFilePath() === schemaTable.getSourceFile().getFilePath() && declaration.getStart() === schemaTable.getStart(),
    )
  );
}

/** The open columns a blob receiver names, or [] when it is not one. */
export function blobTargets(receiver: TsNode, byProp: ReadonlyMap<string, readonly OpenJsonColumn[]>): readonly OpenJsonColumn[] {
  if (!isOpenBag(receiver.getType())) {
    return [];
  }
  const column = columnReceiver(receiver);
  if (column === undefined) {
    return [];
  }
  const cols = column.property === undefined ? [...byProp.values()].flat() : (byProp.get(column.property) ?? []);
  if (!cols.some((c) => c.open)) {
    return [];
  }
  const table = narrowedTable(column.row, rowOrigins(column.row));
  const targets = table === undefined ? [] : cols.filter((candidate) => ownsColumn(table, candidate));
  if (column.ambiguous && targets.some((target) => target.open)) {
    throw new Error(`open-json parity: cannot prove destructured column origin at ${receiver.getSourceFile().getFilePath()}:${receiver.getStartLineNumber()}`);
  }
  return targets;
}
