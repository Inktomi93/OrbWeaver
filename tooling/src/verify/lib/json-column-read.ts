// The reader behind `json-column-read-parsed`: which member reads take a typed JSON column off a SELECT row, and
// whether the value reaches a parse before anything consumes it. A row and a write are judged by the drizzle column facts
// `pnpm ast columns` shares (`floor/code-facts/drizzle-columns.ts`), never by a receiver's name, and a parse by the
// parser's declaration (zod, or the versioned-config codec that wraps a zod schema), never by a callee name.
import type {
  ArrowFunction,
  BindingElement,
  CallExpression,
  FunctionDeclaration,
  FunctionExpression,
  Node,
  ObjectLiteralExpression,
  ParameterDeclaration,
  Type,
} from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import { drizzleWriteOf } from "../../floor/code-facts/drizzle-columns.ts";
import { readStaticString, resolveLexicalValueDeclaration, resolveModuleMemberOrigin, resolveStableExpression } from "../../floor/code-facts/reference-fact.ts";
import type { SchemaModel, SchemaQuery } from "../contract/schema-fact.ts";
import { readStringValue } from "./ast-read.ts";
import { declaredByPackage, resolveTypeIdentityOrigin, resolveTypeMemberOrigin, resolveTypePropertyOrigin } from "./type-member-origin.ts";

const ZOD_PACKAGE = "zod";
const ZOD_PARSE_METHODS: ReadonlySet<string> = new Set(["parse", "safeParse", "parseAsync", "safeParseAsync"]);
// The versioned-config codec (Spine-Config-and-Serialization) owns a zod schema plus its lifts; its two read doors parse.
const VERSIONED_CONFIG_HOME = "/packages/contracts/src/versioned-config/";
const VERSIONED_CONFIG_PARSE_METHODS: ReadonlySet<string> = new Set(["parse", "parseOutcome"]);
const EQUALITY_OPERATORS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.EqualsEqualsEqualsToken,
  SyntaxKind.ExclamationEqualsEqualsToken,
  SyntaxKind.EqualsEqualsToken,
  SyntaxKind.ExclamationEqualsToken,
]);

/** One member read of a column name: `row.col`, `row["col"]`, `row[KEY]` or a `{ col }` destructure. */
export interface ColumnRead {
  readonly column: string;
  /** The node the finding anchors on, and the authored text at `offset` that names the read. */
  readonly anchor: Node;
  readonly offset: number;
  readonly token: string;
  /** The node whose type is the receiver's. */
  readonly receiver: Node;
  /** The node carrying the read value: the access itself, or the destructured binding's name. */
  readonly value: Node;
}

/** What the reader judges a row by: each table's select- and insert-model type identity, and every column's
 *  declaration node. */
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
    const column = node.getName();
    return { column, anchor: node.getNameNode(), offset: 0, token: column, receiver: node.getExpression(), value: node };
  }
  if (N.isElementAccessExpression(node)) {
    return keyedRead(node.getArgumentExpression(), node.getExpression(), node);
  }
  return N.isBindingElement(node) ? destructuredRead(node) : undefined;
}

// `row["col"]` names the column in a literal (the position is inside the quotes); `row[KEY]` through a const string.
function keyedRead(key: Node | undefined, receiver: Node, value: Node): ColumnRead | undefined {
  if (key === undefined) {
    return;
  }
  const literal = readStringValue(key);
  if (literal !== undefined) {
    return { column: literal, anchor: key, offset: 1, token: literal, receiver, value };
  }
  const bound = N.isIdentifier(key) ? readStaticString(key) : undefined;
  return bound?.kind === "resolved" ? { column: bound.value, anchor: key, offset: 0, token: key.getText(), receiver, value } : undefined;
}

// `const { col } = row`, `({ col: alias }: Row) => …`, `const { col: { field } } = row`: one keyed binding of an
// object pattern. A nested pattern consumes the value where it stands and binds no name, so no later use can clear it.
function destructuredRead(node: BindingElement): ColumnRead | undefined {
  const nameNode = node.getNameNode();
  if (!N.isObjectBindingPattern(node.getParent()) || node.getDotDotDotToken() !== undefined) {
    return;
  }
  const keyNode = node.getPropertyNameNode();
  const column = keyNode === undefined ? nameNode.getText() : (readStringValue(keyNode) ?? keyNode.getText());
  // A destructuring declaration's own type is the pattern's; the value destructured is its initializer.
  const holder = node.getParent().getParent();
  const receiver = N.isVariableDeclaration(holder) ? (holder.getInitializer() ?? holder) : holder;
  const anchor = keyNode ?? nameNode;
  return { column, anchor, offset: 0, token: anchor.getText(), receiver, value: nameNode };
}

/** The type of the column value a read takes, off its receiver. */
export function columnValueType(read: ColumnRead): Type {
  return read.receiver.getType().getNonNullableType().getProperty(read.column)?.getTypeAtLocation(read.receiver) ?? read.value.getType();
}

// TypeScript's own projections of an object type keep every kept field's type, so a projected row is still a row.
const ROW_PROJECTIONS: ReadonlySet<string> = new Set(["Pick", "Omit", "Readonly", "Partial", "Required", "NonNullable"]);

// A table's own model by type identity, or a TypeScript projection of it, or an intersection carrying either.
function isModelType(type: Type, models: ReadonlySet<unknown>): boolean {
  const bare = type.getNonNullableType();
  return (bare.isIntersection() ? [bare, ...bare.getIntersectionTypes()] : [bare]).some(
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

// A select row by identity: the table's `$inferSelect` or a projection of it, a result row whose key the checker
// declares at the schema column (a batch or relational read), or a partial select keyed by a column reference.
// DELIBERATELY NOT `shapeFitsColumns`, the row-shape test `pnpm ast columns` reads by: that test is over-inclusive on
// purpose (a rot lens may over-count reads), and here it judges every verb input or insert object whose fields are all
// column names to be a row — measured 2026-10-11, 26 such sites on this tree.
function isRowNode(node: Node, column: string, models: RowModels, query: SchemaQuery): boolean {
  if (isModelType(node.getType(), models.select) || aliasProjectsRow(node, models.select)) {
    return true;
  }
  const origin = resolveTypePropertyOrigin(node, column);
  return (
    origin.kind === "resolved" &&
    origin.value.some(
      (declaration) =>
        models.columns.has(declaration.compilerNode) ||
        (N.isPropertyAssignment(declaration) && query.column(declaration.getInitializerOrThrow()).kind === "resolved"),
    )
  );
}

// The parameter a receiver reads, and the property path below it: the parameter itself (`card.col`), its binding
// (`({ col }: Card)`), or a binding nested in its pattern (`({ card: { col } }: Wrap)` is path `["card"]`).
function parameterPath(receiver: Node): { readonly param: ParameterDeclaration; readonly path: readonly string[] } | undefined {
  let node: Node = receiver;
  if (N.isIdentifier(receiver)) {
    const binding = resolveLexicalValueDeclaration(receiver);
    if (binding.kind === "unresolved") {
      return;
    }
    node = binding.value;
  }
  const path: string[] = [];
  while (N.isBindingElement(node)) {
    const key = node.getPropertyNameNode();
    path.unshift(key === undefined ? node.getNameNode().getText() : (readStringValue(key) ?? key.getText()));
    node = node.getParent().getParent();
  }
  return N.isParameterDeclaration(node) ? { param: node, path } : undefined;
}

// A call argument's value at a property path is a select row: the argument itself, or the model type its path reaches.
function argumentRowAt(arg: Node, path: readonly string[], models: RowModels, isRow: (node: Node) => boolean): boolean {
  if (path.length === 0) {
    return isRow(arg);
  }
  let type: Type | undefined = arg.getType();
  for (const key of path) {
    type = type?.getNonNullableType().getProperty(key)?.getTypeAtLocation(arg);
  }
  return type !== undefined && isModelType(type, models.select);
}

// One hop: a parameter of a function in this file that some call in this file hands a select row, read directly or
// through its destructuring pattern. A hand-typed parameter does not launder the row it receives.
function parameterTakesRow(receiver: Node, column: string, models: RowModels, query: SchemaQuery): boolean {
  const reached = parameterPath(receiver);
  const fn = reached === undefined ? undefined : asHelper(reached.param.getParent());
  if (reached === undefined || fn === undefined) {
    return false;
  }
  const index = fn.getParameters().indexOf(reached.param);
  return receiver
    .getSourceFile()
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .some((call) => {
      const arg = call.getArguments()[index];
      return (
        arg !== undefined &&
        helperOf(call.getExpression())?.compilerNode === fn.compilerNode &&
        argumentRowAt(arg, reached.path, models, (node) => isRowNode(node, column, models, query))
      );
    });
}

/** Is the read taken off a select row, directly or through one parameter hop? */
export function readsSelectRow(read: ColumnRead, models: RowModels, query: SchemaQuery): boolean {
  return isRowNode(read.receiver, read.column, models, query) || parameterTakesRow(read.receiver, read.column, models, query);
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

// `schema.parse(v)` whose method zod declares, or the codec's `parse`/`parseOutcome`. A helper merely HANDED a schema is
// not a parse; it is judged one hop in, by what its body does with the value.
function isDirectParse(call: CallExpression): boolean {
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
  return false;
}

function parsedDirectly(node: Node): boolean {
  const site = valueSite(node);
  const parent = site.getParent();
  if (parent === undefined || !N.isCallExpression(parent)) {
    return false;
  }
  const index = argumentIndex(parent, site);
  return index >= 0 && (isDirectParse(parent) || parsedAsArgumentOfParse(parent));
}

// `schema.parse(heal(row.col))`: the value's only way out of the inner call is into the parse.
function parsedAsArgumentOfParse(call: CallExpression): boolean {
  const site = valueSite(call);
  const parent = site.getParent();
  if (parent === undefined || !N.isCallExpression(parent)) {
    return false;
  }
  const index = argumentIndex(parent, site);
  return index >= 0 && isDirectParse(parent);
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

/** Does the value reach a parse: a zod or codec parse directly, or one hop into a helper whose body parses it? */
export function isParsedValue(node: Node): boolean {
  return parsedDirectly(node) || parsedThroughHelper(node);
}

// The drizzle write whose argument is `site`, judged by the shared write detector, when its chain names a schema
// table that owns `column`.
function writesColumn(site: Node, column: string, query: SchemaQuery): boolean {
  const call = site.getFirstAncestorByKind(SyntaxKind.CallExpression);
  const write = call === undefined ? undefined : drizzleWriteOf(call);
  const table = write === undefined || write.arg !== site ? undefined : query.table(write.target);
  return table?.kind === "resolved" && table.value.columns.some((candidate) => candidate.identity.propertyName === column);
}

// The key a carried value enters a literal under: a property or shorthand name, never a spread.
function keyEntering(child: Node | undefined): string | undefined {
  return child !== undefined && (N.isPropertyAssignment(child) || N.isShorthandPropertyAssignment(child)) ? child.getName() : undefined;
}

// Every object literal the value is carried into, innermost first, with the key it entered under and the literal's
// own node: the write's row is whichever of them a drizzle write takes as its argument (or as a batch element), or
// whose contextual type is an insert model.
function carryingLiterals(node: Node): readonly { readonly literal: ObjectLiteralExpression; readonly key: string | undefined }[] {
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

/** Does the value go straight back into the same column: an assignment target, the column's own key in a drizzle
 *  write builder's row, or that key in an insert-model literal? A value written under another key is still read. */
export function isWriteSink(node: Node, column: string, models: RowModels, query: SchemaQuery): boolean {
  const parent = node.getParent();
  if (N.isBinaryExpression(parent) && parent.getLeft() === node && parent.getOperatorToken().getKind() === SyntaxKind.EqualsToken) {
    return true;
  }
  return carryingLiterals(node).some(({ literal, key }) => {
    if (key !== column) {
      return false;
    }
    const batch = literal.getParent();
    const row = N.isArrayLiteralExpression(batch) ? batch : literal;
    const contextual = literal.getContextualType();
    return writesColumn(row, column, query) || (contextual !== undefined && isModelType(contextual, models.insert));
  });
}

/** Is every use of a destructured column binding a parse, a presence test or a write? */
export function bindingUsesJudged(read: ColumnRead, models: RowModels, query: SchemaQuery): boolean {
  const scope = read.value.getFirstAncestor((ancestor) => N.isFunctionLikeDeclaration(ancestor) || N.isSourceFile(ancestor)) ?? read.value.getSourceFile();
  const uses = referencesOf(read.value, scope);
  return uses.length > 0 && uses.every((use) => isParsedValue(use) || isPresenceTest(use) || isWriteSink(use, read.column, models, query));
}
