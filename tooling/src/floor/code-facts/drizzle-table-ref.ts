// Which schema TABLE a drizzle table expression names: the one resolver `pnpm ast columns` and the tenancy gates
// share. It walks declarations (local and cross-file bindings, `schema.<t>` hops, renaming imports, drizzle
// `alias()`/`aliasedTable()`, both arms of a conditional), names a `.as()` subquery or `$with` CTE by its inner
// select, follows a destructured helper result, and falls back to the drizzle table type's literal name.
// Anything else is an honest `unresolved`.
import type { CallExpression, Identifier, Node as MorphNode, Type, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { unwrapTarget } from "./reference-fact-alias.ts";

/** One answer for a table expression. A conditional yields one per arm, so the caller judges every arm. */
export type DrizzleTableRef =
  /** A declaration the caller's `isTable` accepted. */
  | { readonly kind: "table"; readonly declaration: VariableDeclaration }
  /** A named or namespace import whose module did not resolve; `name` is the exported member it names. */
  | { readonly kind: "imported"; readonly name: string }
  /** The drizzle type's literal SQL table name, read when no declaration reaches a table (a typed parameter). */
  | { readonly kind: "sql-name"; readonly sqlName: string }
  /** A `.as()` subquery or a `$with` CTE: `select` is the inner select expression the subquery runs. */
  | { readonly kind: "subquery"; readonly select: MorphNode }
  /** A drizzle `sql` template used as a row source: its literal text, and whether it interpolates any value. */
  | { readonly kind: "raw-sql"; readonly text: string; readonly interpolates: boolean }
  | { readonly kind: "unresolved"; readonly node: MorphNode };

const DRIZZLE_SPECIFIER = "drizzle-orm";
const ALIAS_EXPORTS: ReadonlySet<string> = new Set(["alias", "aliasedTable"]);
const SUBQUERY_VERB = "as";
const SQL_TAG = "sql";
const CTE_VERB = "$with";
const TABLE_META = "_";
const TABLE_BRAND = "brand";
const TABLE_BRAND_VALUE = "Table";
const TABLE_NAME = "name";
const MAX_DEPTH = 8;

type IsTable = (declaration: VariableDeclaration) => boolean;

/** The exported member a callee names off a drizzle-orm import (`alias`, `drizzle.aliasedTable`), by its import. */
function drizzleExportOf(callee: MorphNode): string | undefined {
  if (Node.isIdentifier(callee)) {
    const specifier = callee
      .getSymbol()
      ?.getDeclarations()
      .find((declaration) => Node.isImportSpecifier(declaration));
    const module = specifier?.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)?.getModuleSpecifierValue();
    return Node.isImportSpecifier(specifier) && module?.startsWith(DRIZZLE_SPECIFIER) === true ? specifier.getName() : undefined;
  }
  if (!Node.isPropertyAccessExpression(callee)) {
    return;
  }
  const module = namespaceModuleOf(callee.getExpression());
  return module?.startsWith(DRIZZLE_SPECIFIER) === true ? callee.getName() : undefined;
}

/** The module an `import * as ns` binding names, or undefined for any other receiver. */
function namespaceModuleOf(receiver: MorphNode): string | undefined {
  if (!Node.isIdentifier(receiver)) {
    return;
  }
  const namespace = receiver
    .getSymbol()
    ?.getDeclarations()
    .find((declaration) => Node.isNamespaceImport(declaration));
  return namespace?.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)?.getModuleSpecifierValue();
}

/** The member a namespace import is read for, dotted or bracketed (`schema.characters`, `schema["characters"]`). */
function namespaceMemberOf(node: MorphNode): string | undefined {
  if (Node.isPropertyAccessExpression(node)) {
    return namespaceModuleOf(node.getExpression()) === undefined ? undefined : node.getName();
  }
  if (!Node.isElementAccessExpression(node) || namespaceModuleOf(node.getExpression()) === undefined) {
    return;
  }
  const argument = node.getArgumentExpression();
  return Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument) ? argument.getLiteralValue() : undefined;
}

function unresolved(node: MorphNode): DrizzleTableRef {
  return { kind: "unresolved", node };
}

/** The literal SQL name a drizzle table type carries in `_.name`, or undefined for any other type. */
function tableTypeName(type: Type, at: MorphNode): string | undefined {
  const meta = type.getProperty(TABLE_META)?.getTypeAtLocation(at);
  const brand = meta?.getProperty(TABLE_BRAND)?.getTypeAtLocation(at);
  const name = meta?.getProperty(TABLE_NAME)?.getTypeAtLocation(at);
  if (brand?.getLiteralValue() !== TABLE_BRAND_VALUE || name?.isStringLiteral() !== true) {
    return;
  }
  const value = name.getLiteralValue();
  return typeof value === "string" ? value : undefined;
}

/** The table names the expression's drizzle type carries: one per union member, or none when any member is not one. */
function typeRefs(node: MorphNode): readonly DrizzleTableRef[] {
  const type = node.getType();
  const names = (type.isUnion() ? type.getUnionTypes() : [type]).map((member) => tableTypeName(member, node));
  if (names.length === 0 || names.some((name) => name === undefined)) {
    return [unresolved(node)];
  }
  return names.flatMap((sqlName) => (sqlName === undefined ? [] : [{ kind: "sql-name", sqlName }]));
}

function callRefs(call: CallExpression, isTable: IsTable, depth: number): readonly DrizzleTableRef[] {
  const callee = unwrapTarget(call.getExpression());
  const exported = drizzleExportOf(callee);
  const [first] = call.getArguments();
  if (exported !== undefined && ALIAS_EXPORTS.has(exported)) {
    return first === undefined ? [unresolved(call)] : walk(first, isTable, depth + 1);
  }
  if (Node.isPropertyAccessExpression(callee) && callee.getName() === SUBQUERY_VERB) {
    const receiver = unwrapTarget(callee.getExpression());
    const cteHead = Node.isCallExpression(receiver) ? unwrapTarget(receiver.getExpression()) : undefined;
    const isCte = Node.isPropertyAccessExpression(cteHead) && cteHead.getName() === CTE_VERB;
    const select = isCte ? first : receiver;
    return select === undefined ? [unresolved(call)] : [{ kind: "subquery", select }];
  }
  return typeRefs(call);
}

/** The single value a function-like returns: an arrow's expression body, or a block's only `return` expression. */
function soleReturn(fn: MorphNode): MorphNode | undefined {
  if (Node.isArrowFunction(fn)) {
    const body = fn.getBody();
    if (!Node.isBlock(body)) {
      return body;
    }
  }
  const block = fn.getFirstChildByKind(SyntaxKind.Block);
  const returns = block
    ?.getDescendantsOfKind(SyntaxKind.ReturnStatement)
    .filter((ret) => ret.getFirstAncestor((a) => Node.isFunctionLikeDeclaration(a)) === fn);
  return returns?.length === 1 ? returns[0]?.getExpression() : undefined;
}

/** The value one property of an object expression holds: a literal's own property, or the property of the object a
 *  local helper returns (`const { activity } = characterActivityCtes(db, ownerId)`). */
function memberValue(source: MorphNode, name: string): MorphNode | undefined {
  let object = unwrapTarget(source);
  if (Node.isCallExpression(object)) {
    const callee = unwrapTarget(object.getExpression());
    const fn = Node.isIdentifier(callee)
      ? callee
          .getDefinitionNodes()
          .map((definition) => (Node.isVariableDeclaration(definition) ? definition.getInitializer() : definition))
          .find((definition) => definition !== undefined && Node.isFunctionLikeDeclaration(definition))
      : undefined;
    const returned = fn === undefined ? undefined : soleReturn(fn);
    if (returned === undefined) {
      return;
    }
    object = unwrapTarget(returned);
  }
  if (!Node.isObjectLiteralExpression(object)) {
    return;
  }
  const property = object.getProperty(name);
  if (Node.isPropertyAssignment(property)) {
    return property.getInitializer();
  }
  return Node.isShorthandPropertyAssignment(property) ? property.getNameNode() : undefined;
}

/** The value a destructured binding takes (`const { activity } = …`), or undefined for any other binding. */
function destructuredValue(element: MorphNode): MorphNode | undefined {
  if (!Node.isBindingElement(element)) {
    return;
  }
  const declaration = element.getParent().getParent();
  const source = Node.isVariableDeclaration(declaration) ? declaration.getInitializer() : undefined;
  const name = element.getPropertyNameNode()?.getText() ?? element.getName();
  return source === undefined ? undefined : memberValue(source, name);
}

/** The refs an identifier's declarations reach, or undefined when they reach none (the caller then reads the type). */
function bindingRefs(name: Identifier, isTable: IsTable, depth: number): readonly DrizzleTableRef[] | undefined {
  const definitions = name.getDefinitionNodes();
  for (const definition of definitions) {
    // An import from a module the program cannot resolve defines itself; its imported name is all there is.
    if (Node.isImportSpecifier(definition)) {
      return [{ kind: "imported", name: definition.getName() }];
    }
    const destructured = destructuredValue(definition);
    if (destructured !== undefined) {
      return walk(destructured, isTable, depth + 1);
    }
    if (!Node.isVariableDeclaration(definition)) {
      continue;
    }
    if (isTable(definition)) {
      return [{ kind: "table", declaration: definition }];
    }
    const initializer = definition.getInitializer();
    if (initializer !== undefined) {
      return walk(initializer, isTable, depth + 1);
    }
  }
  if (definitions.length > 0) {
    return;
  }
  const specifier = name
    .getSymbol()
    ?.getDeclarations()
    .find((declaration) => Node.isImportSpecifier(declaration));
  return Node.isImportSpecifier(specifier) ? [{ kind: "imported", name: specifier.getName() }] : undefined;
}

/** A drizzle `sql` template used as a row source, or undefined for any other node. */
function rawSqlRef(value: MorphNode): DrizzleTableRef | undefined {
  if (!(Node.isTaggedTemplateExpression(value) && drizzleExportOf(unwrapTarget(value.getTag())) === SQL_TAG)) {
    return;
  }
  const template = value.getTemplate();
  const constant = Node.isNoSubstitutionTemplateLiteral(template);
  return { kind: "raw-sql", text: constant ? template.getLiteralText() : template.getText(), interpolates: !constant };
}

/** A namespace member's refs: its declaration, else its drizzle type, else the imported member name. */
function namespaceRefs(value: MorphNode, isTable: IsTable, depth: number): readonly DrizzleTableRef[] | undefined {
  const namespaced = namespaceMemberOf(value);
  if (namespaced === undefined) {
    return;
  }
  const viaDeclaration = Node.isPropertyAccessExpression(value) ? bindingRefs(value.getNameNode(), isTable, depth) : undefined;
  const typed = viaDeclaration ?? typeRefs(value);
  return typed.every((ref) => ref.kind !== "unresolved") ? typed : [{ kind: "imported", name: namespaced }];
}

function walk(node: MorphNode, isTable: IsTable, depth: number): readonly DrizzleTableRef[] {
  const value = unwrapTarget(node);
  if (depth > MAX_DEPTH) {
    return [unresolved(value)];
  }
  if (Node.isConditionalExpression(value)) {
    return [...walk(value.getWhenTrue(), isTable, depth + 1), ...walk(value.getWhenFalse(), isTable, depth + 1)];
  }
  if (Node.isCallExpression(value)) {
    return callRefs(value, isTable, depth);
  }
  const raw = rawSqlRef(value);
  if (raw !== undefined) {
    return [raw];
  }
  const namespaced = namespaceRefs(value, isTable, depth);
  if (namespaced !== undefined) {
    return namespaced;
  }
  const name = Node.isPropertyAccessExpression(value) ? value.getNameNode() : value;
  const refs = Node.isIdentifier(name) ? bindingRefs(name, isTable, depth) : undefined;
  return refs ?? typeRefs(value);
}

/** Every table the expression can name. `isTable` says which declarations are schema tables; the walk stops there. */
export function resolveDrizzleTableRefs(expression: MorphNode, isTable: IsTable): readonly DrizzleTableRef[] {
  return walk(expression, isTable, 0);
}
