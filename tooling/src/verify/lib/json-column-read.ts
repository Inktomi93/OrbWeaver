// The reader behind `json-column-read-parsed`: which member reads take a typed JSON column off a SELECT row, and
// whether the value reaches a parse before anything consumes it. A row is judged by type identity against the
// schema's own `$inferSelect` (or a partial select's column-backed key), never by a receiver's name, and a parse is
// judged by the parser's declaration (zod, or the versioned-config codec that wraps a zod schema), never by a callee name.
import type { ArrowFunction, BindingElement, CallExpression, FunctionDeclaration, FunctionExpression, Node, Type } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import { resolveLexicalValueDeclaration, resolveModuleMemberOrigin, resolveStableExpression } from "../../floor/code-facts/reference-fact.ts";
import type { SchemaModel, SchemaQuery } from "../contract/schema-fact.ts";
import { readStringValue } from "./ast-read.ts";
import { declaredByPackage, resolveTypeIdentityOrigin, resolveTypeMemberOrigin, resolveTypePropertyOrigin } from "./type-member-origin.ts";

const ZOD_PACKAGE = "zod";
const ZOD_PARSE_METHODS: ReadonlySet<string> = new Set(["parse", "safeParse", "parseAsync", "safeParseAsync"]);
// The versioned-config codec (Spine-Config-and-Serialization) owns a zod schema plus its lifts; its two read doors parse.
const VERSIONED_CONFIG_HOME = "/packages/contracts/src/versioned-config/";
const VERSIONED_CONFIG_PARSE_METHODS: ReadonlySet<string> = new Set(["parse", "parseOutcome"]);
const WRITE_BUILDERS: ReadonlySet<string> = new Set(["values", "set", "onConflictDoUpdate"]);
const EQUALITY_OPERATORS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.EqualsEqualsEqualsToken,
  SyntaxKind.ExclamationEqualsEqualsToken,
  SyntaxKind.EqualsEqualsToken,
  SyntaxKind.ExclamationEqualsToken,
]);
// TypeScript's own projections of an object type keep every kept field's type, so a projected row is still a row.
const ROW_PROJECTIONS: ReadonlySet<string> = new Set(["Pick", "Omit", "Readonly", "Partial", "Required", "NonNullable"]);

/** One member read of a column name: `row.col`, `row["col"]` or a `{ col }` destructure. */
export interface ColumnRead {
  readonly column: string;
  /** The node the finding anchors on; its text at `offset` is the column name. */
  readonly anchor: Node;
  readonly offset: number;
  /** The node whose type is the receiver's. */
  readonly receiver: Node;
  /** The node carrying the read value: the access itself, or the destructured binding's name. */
  readonly value: Node;
}

/** The compiler type identities of every table's select and insert model, and every column's declaration node. */
export interface RowModels {
  readonly select: ReadonlySet<unknown>;
  readonly insert: ReadonlySet<unknown>;
  readonly columns: ReadonlySet<unknown>;
}

export function rowModels(model: SchemaModel): RowModels {
  const select = new Set<unknown>();
  const insert = new Set<unknown>();
  const columns = new Set<unknown>(model.tables.flatMap((table) => table.columns.map((column) => column.declaration.compilerNode)));
  for (const { declaration } of model.tables) {
    const tableType = declaration.getType();
    const selected = tableType.getProperty("$inferSelect")?.getTypeAtLocation(declaration);
    const inserted = tableType.getProperty("$inferInsert")?.getTypeAtLocation(declaration);
    if (selected !== undefined) {
      select.add(selected.compilerType);
    }
    if (inserted !== undefined) {
      insert.add(inserted.compilerType);
    }
  }
  return { select, insert, columns };
}

/** The candidate column read at `node`, or undefined for any other node. */
export function columnReadAt(node: Node): ColumnRead | undefined {
  if (N.isPropertyAccessExpression(node)) {
    return { column: node.getName(), anchor: node.getNameNode(), offset: 0, receiver: node.getExpression(), value: node };
  }
  if (N.isElementAccessExpression(node)) {
    const key = node.getArgumentExpression();
    const column = key === undefined ? undefined : readStringValue(key);
    return key === undefined || column === undefined ? undefined : { column, anchor: key, offset: 1, receiver: node.getExpression(), value: node };
  }
  return N.isBindingElement(node) ? destructuredRead(node) : undefined;
}

// `const { col } = row`, `({ col: alias }: Row) => …`: one plain named binding of an object pattern.
function destructuredRead(node: BindingElement): ColumnRead | undefined {
  const nameNode = node.getNameNode();
  if (!(N.isObjectBindingPattern(node.getParent()) && N.isIdentifier(nameNode)) || node.getDotDotDotToken() !== undefined) {
    return;
  }
  const keyNode = node.getPropertyNameNode();
  const column = keyNode === undefined ? node.getName() : (readStringValue(keyNode) ?? keyNode.getText());
  // A destructuring declaration's own type is the pattern's; the value destructured is its initializer.
  const holder = node.getParent().getParent();
  const receiver = N.isVariableDeclaration(holder) ? (holder.getInitializer() ?? holder) : holder;
  return { column, anchor: keyNode ?? nameNode, offset: 0, receiver, value: nameNode };
}

function typeMatches(type: Type, models: ReadonlySet<unknown>): boolean {
  const bare = type.getNonNullableType();
  const parts = bare.isIntersection() ? [bare, ...bare.getIntersectionTypes()] : [bare];
  return parts.some(
    (part) =>
      models.has(part.compilerType) ||
      (ROW_PROJECTIONS.has(part.getAliasSymbol()?.getName() ?? "") && part.getAliasTypeArguments().some((arg) => models.has(arg.compilerType))),
  );
}

// `type X = Pick<Row, …>`: an authored alias over a TypeScript projection of a select model.
function aliasProjectsRow(receiver: Node, models: ReadonlySet<unknown>): boolean {
  const origin = resolveTypeIdentityOrigin(receiver);
  return (
    origin.kind === "resolved" &&
    origin.value.declarations.some((declaration) => {
      const node = N.isTypeAliasDeclaration(declaration) ? declaration.getTypeNode() : undefined;
      return (
        node !== undefined &&
        N.isTypeReference(node) &&
        ROW_PROJECTIONS.has(node.getTypeName().getText()) &&
        node.getTypeArguments().some((arg) => models.has(arg.getType().compilerType))
      );
    })
  );
}

/** Is the read taken off a select row? A full or projected `$inferSelect`, a result row whose key the checker
 *  declares at the schema column itself (a batch or relational read), or a partial select keyed by a column. */
export function readsSelectRow(read: ColumnRead, models: RowModels, query: SchemaQuery): boolean {
  if (typeMatches(read.receiver.getType(), models.select) || aliasProjectsRow(read.receiver, models.select)) {
    return true;
  }
  const origin = resolveTypePropertyOrigin(read.receiver, read.column);
  return (
    origin.kind === "resolved" &&
    origin.value.some(
      (declaration) =>
        models.columns.has(declaration.compilerNode) ||
        (N.isPropertyAssignment(declaration) && query.column(declaration.getInitializerOrThrow()).kind === "resolved"),
    )
  );
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

function argumentIndex(call: CallExpression, site: Node): number {
  return call.getArguments().findIndex((arg) => arg === site);
}

function declaredByZod(node: Node): boolean {
  const origin = resolveTypeIdentityOrigin(node);
  return origin.kind === "resolved" && declaredByPackage(origin.value.declarations, ZOD_PACKAGE);
}

// `schema.parse(v)` on a zod schema, the codec's `parse`/`parseOutcome`, or any call handed a zod schema beside the value.
function isDirectParse(call: CallExpression, index: number): boolean {
  const callee = call.getExpression();
  if (N.isPropertyAccessExpression(callee)) {
    const method = resolveTypeMemberOrigin(callee);
    const declarations = method.kind === "resolved" ? method.value.declarations : [];
    if (ZOD_PARSE_METHODS.has(callee.getName()) && declaredByPackage(declarations, ZOD_PACKAGE)) {
      return true;
    }
    if (
      VERSIONED_CONFIG_PARSE_METHODS.has(callee.getName()) &&
      declarations.length > 0 &&
      declarations.every((d) => d.getSourceFile().getFilePath().replaceAll("\\", "/").includes(VERSIONED_CONFIG_HOME))
    ) {
      return true;
    }
  }
  return call.getArguments().some((arg, i) => i !== index && declaredByZod(arg));
}

function parsedDirectly(node: Node): boolean {
  const site = valueSite(node);
  const parent = site.getParent();
  if (parent === undefined || !N.isCallExpression(parent)) {
    return false;
  }
  const index = argumentIndex(parent, site);
  return index >= 0 && (isDirectParse(parent, index) || parsedAsArgumentOfParse(parent));
}

// `schema.parse(heal(row.col))`: the value's only way out of the inner call is into the parse.
function parsedAsArgumentOfParse(call: CallExpression): boolean {
  const site = valueSite(call);
  const parent = site.getParent();
  if (parent === undefined || !N.isCallExpression(parent)) {
    return false;
  }
  const index = argumentIndex(parent, site);
  return index >= 0 && isDirectParse(parent, index);
}

/** The references to a binding inside `scope`, excluding the binding's own name. */
function referencesOf(name: Node, scope: Node): readonly Node[] {
  const symbol = name.getSymbol()?.compilerSymbol;
  return symbol === undefined ? [] : scope.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => id !== name && id.getSymbol()?.compilerSymbol === symbol);
}

/** A presence test (`=== null`, `!== undefined`, `typeof`) reads no field of the value. */
export function isPresenceTest(node: Node): boolean {
  const site = valueSite(node);
  const parent = site.getParent();
  if (parent !== undefined && N.isTypeOfExpression(parent)) {
    return true;
  }
  if (parent === undefined || !N.isBinaryExpression(parent) || !EQUALITY_OPERATORS.has(parent.getOperatorToken().getKind())) {
    return false;
  }
  const other = parent.getLeft() === site ? parent.getRight() : parent.getLeft();
  return other.getKind() === SyntaxKind.NullKeyword || (N.isIdentifier(other) && other.getText() === "undefined");
}

type Helper = FunctionDeclaration | ArrowFunction | FunctionExpression;

function asHelper(node: Node): Helper | undefined {
  return N.isFunctionDeclaration(node) || N.isArrowFunction(node) || N.isFunctionExpression(node) ? node : undefined;
}

// The function a callee names: an imported export, a local function declaration, or a const-bound arrow.
function helperOf(callee: Node): Helper | undefined {
  const imported = resolveModuleMemberOrigin(callee);
  if (imported.kind === "resolved") {
    return asHelper(imported.value.declaration);
  }
  const stable = resolveStableExpression(callee);
  if (stable.kind === "resolved" && asHelper(stable.value) !== undefined) {
    return asHelper(stable.value);
  }
  const lexical = resolveLexicalValueDeclaration(callee);
  return lexical.kind === "resolved" ? asHelper(lexical.value) : undefined;
}

// One hop into a local or imported helper: every use of the receiving parameter in its body is parsed or a presence test.
function parsedThroughHelper(node: Node): boolean {
  const site = valueSite(node);
  const call = site.getParent();
  if (call === undefined || !N.isCallExpression(call)) {
    return false;
  }
  const index = argumentIndex(call, site);
  const helper = index < 0 ? undefined : helperOf(call.getExpression());
  if (helper === undefined) {
    return false;
  }
  const param = helper.getParameters()[index];
  const body = helper.getBody();
  if (param === undefined || body === undefined || !N.isIdentifier(param.getNameNode())) {
    return false;
  }
  const uses = referencesOf(param.getNameNode(), body);
  return uses.length > 0 && uses.every((use) => parsedDirectly(use) || isPresenceTest(use));
}

/** Does the value reach a parse: directly, through a helper handed the schema, or one hop into a parsing helper? */
export function isParsedValue(node: Node): boolean {
  return parsedDirectly(node) || parsedThroughHelper(node);
}

/** Does the value go straight back into a write: an assignment target, a write builder, or an insert-model literal? */
export function isWriteSink(node: Node, models: RowModels): boolean {
  const parent = node.getParent();
  if (N.isBinaryExpression(parent) && parent.getLeft() === node && parent.getOperatorToken().getKind() === SyntaxKind.EqualsToken) {
    return true;
  }
  const builder = node.getFirstAncestor((ancestor) => {
    if (!N.isCallExpression(ancestor)) {
      return false;
    }
    const callee = ancestor.getExpression();
    return N.isPropertyAccessExpression(callee) && WRITE_BUILDERS.has(callee.getName());
  });
  if (builder !== undefined) {
    return true;
  }
  // The nearest object literal the value is carried into, judged by the type it is checked against.
  const site = valueSite(node);
  const literal = node.getFirstAncestorByKind(SyntaxKind.ObjectLiteralExpression);
  const carried = literal !== undefined && site.getStart() <= literal.getStart() && literal.getEnd() <= site.getEnd();
  const contextual = carried ? literal.getContextualType() : undefined;
  return contextual !== undefined && typeMatches(contextual, models.insert);
}

/** Is every use of a destructured column binding a parse, a presence test or a write? */
export function bindingUsesJudged(read: ColumnRead, models: RowModels): boolean {
  const scope = read.value.getFirstAncestor((ancestor) => N.isFunctionLikeDeclaration(ancestor) || N.isSourceFile(ancestor)) ?? read.value.getSourceFile();
  const uses = referencesOf(read.value, scope);
  return uses.length > 0 && uses.every((use) => isParsedValue(use) || isPresenceTest(use) || isWriteSink(use, models));
}
