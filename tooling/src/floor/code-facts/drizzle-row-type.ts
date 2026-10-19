// Type-node origin reading for the open-json parity fact: which schema table, if any, a declared row type
// (`typeof t.$inferSelect`, a standard-library projection of it, a union, intersection or array of them) denotes.
import type { SourceFile, Node as TsNode, Type, TypeReferenceNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";

import type { RowOrigin } from "./drizzle-row-contract.ts";
import { DRIZZLE_SELECT_ROW_MODEL } from "./drizzle-vocabulary.ts";

export function origin(kind: RowOrigin["kind"], sourceType: Type, table?: TsNode, dropsMembers = false): RowOrigin {
  return { sourceType, kind, table, dropsMembers };
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

export function schemaTableIn(origins: readonly RowOrigin[]): TsNode | undefined {
  return origins.find((item) => item.table !== undefined)?.table;
}

// TypeScript's own projections of an object type keep every kept field's type, so a projected row is still a row.
export const ROW_PROJECTIONS: ReadonlySet<string> = new Set(["Pick", "Omit", "Readonly", "Partial", "Required", "NonNullable"]);
const MEMBER_DROPPING_PROJECTIONS: ReadonlySet<string> = new Set(["Pick", "Omit"]);

/** `Pick<Row, K>` and its kin, declared by the program's default library files: the projection of a schema row keeps that row's
 *  table. Only a first argument that is exactly one schema row qualifies; any other argument stays unprovable. */
/** The compiler's own verdict on a default library file; a project file that is merely named `lib.*.d.ts` is not one. */
function isDefaultLibraryFile(sourceFile: SourceFile): boolean {
  return sourceFile.getProject().getProgram().compilerObject.isSourceFileDefaultLibrary(sourceFile.compilerNode);
}

function projectedRowOrigins(typeNode: TypeReferenceNode, seen: ReadonlySet<TsNode>): readonly RowOrigin[] | undefined {
  const symbol = typeNode.getTypeName().getSymbol();
  const declarations = (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations().filter(Node.isTypeAliasDeclaration) ?? [];
  const declaration = declarations.length === 1 ? declarations[0] : undefined;
  const first = typeNode.getTypeArguments()[0];
  if (declaration === undefined || first === undefined || !ROW_PROJECTIONS.has(declaration.getName()) || !isDefaultLibraryFile(declaration.getSourceFile())) {
    return;
  }
  const rows = typeOrigins(first, new Set(seen));
  const row = rows.length === 1 ? rows[0] : undefined;
  return row?.kind === "schema" && row.table !== undefined
    ? [origin("schema", typeNode.getType(), row.table, MEMBER_DROPPING_PROJECTIONS.has(declaration.getName()))]
    : undefined;
}

function referenceRowOrigins(typeNode: TypeReferenceNode, seen: ReadonlySet<TsNode>): readonly RowOrigin[] {
  const projected = projectedRowOrigins(typeNode, seen);
  if (projected !== undefined) {
    return projected;
  }
  const alias = aliasBody(typeNode);
  const argumentsOrigins = typeNode.getTypeArguments().flatMap((argument) => typeOrigins(argument, new Set(seen)));
  if (alias !== undefined) {
    const bodyOrigins = typeOrigins(alias.body, new Set(seen));
    return alias.generic ? [origin("unresolved", typeNode.getType(), schemaTableIn([...bodyOrigins, ...argumentsOrigins]))] : bodyOrigins;
  }
  const schemaArgument = argumentsOrigins.some((item) => item.kind !== "plain");
  return [origin(schemaArgument ? "unresolved" : "plain", typeNode.getType(), schemaTableIn(argumentsOrigins))];
}

export function typeOrigins(typeNode: TsNode, seen = new Set<TsNode>()): readonly RowOrigin[] {
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
      Node.isQualifiedName(member) && member.getRight().getText() === DRIZZLE_SELECT_ROW_MODEL
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
  // A sibling arm of a Pick/Omit projection can re-supply a member the projection dropped, so the row's table no longer owns it.
  const reSupplied = parts.length > 1 && parts.some((part) => part.dropsMembers === true);
  if (reSupplied || parts.some((part) => part.kind === "unresolved") || tables.some((part) => !sameTable(part.table, tables[0]?.table ?? part.table))) {
    return [origin("unresolved", typeNode.getType(), schemaTableIn(parts))];
  }
  return [tables[0] === undefined ? origin("plain", typeNode.getType()) : origin("schema", typeNode.getType(), tables[0].table)];
}

export function arrayTypeOrigins(typeNode: TsNode, seen = new Set<TsNode>()): readonly RowOrigin[] {
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

/** The declaration behind a schema table reference. A syntactic name alone is never provenance. */
export function tableDeclarations(reference: TsNode): readonly TsNode[] {
  const symbol = reference.getSymbol();
  return (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? [];
}

export function sameTable(left: TsNode, right: TsNode): boolean {
  return tableDeclarations(left).some((a) =>
    tableDeclarations(right).some((b) => a.getSourceFile().getFilePath() === b.getSourceFile().getFilePath() && a.getStart() === b.getStart()),
  );
}
