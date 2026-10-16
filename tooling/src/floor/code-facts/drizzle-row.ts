// Native column member/destructure facts preserve authored anchors and receiver occurrences.
import type { ArrowFunction, BindingElement, FunctionDeclaration, FunctionExpression, Node, ParameterDeclaration, Type } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import { readCallTarget } from "./call-returns.ts";
import type { ColumnRead, RowModels, RowReadServices } from "./drizzle-row-contract.ts";
import { ROW_PROJECTIONS } from "./drizzle-row-type.ts";
import { readStaticString, resolveLexicalValueDeclaration } from "./reference-fact.ts";
import { literalString as readStringValue } from "./reference-fact-static.ts";
import type { SchemaModel, SchemaQuery } from "./schema-model-contract.ts";
import { resolveTypeIdentityOrigin } from "./type-member-origin.ts";
import { resolveTypePropertyOrigin } from "./type-member-origin-core.ts";
import type { NativeSelectedType } from "./type-projection-contract.ts";

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
  return columnReadAtWith(node, readStaticString);
}

/** Supplied native scalar facts retain the existing candidate and authored-anchor grammar. */
export function columnReadAtWith(node: Node, string: typeof readStaticString): ColumnRead | undefined {
  if (N.isPropertyAccessExpression(node)) {
    const column = node.getName();
    return { column, anchor: node.getNameNode(), offset: 0, token: column, receiver: node.getExpression(), value: node };
  }
  if (N.isElementAccessExpression(node)) {
    return keyedRead(node.getArgumentExpression(), node.getExpression(), node, string);
  }
  return N.isBindingElement(node) ? destructuredRead(node) : undefined;
}

// `row["col"]` names the column in a literal (the position is inside the quotes); `row[KEY]` through a const string.
function keyedRead(key: Node | undefined, receiver: Node, value: Node, string: typeof readStaticString): ColumnRead | undefined {
  if (key === undefined) {
    return;
  }
  const literal = readStringValue(key);
  if (literal !== undefined) {
    return { column: literal, anchor: key, offset: 1, token: literal, receiver, value };
  }
  const bound = N.isIdentifier(key) ? string(key) : undefined;
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

// A table's own model by type identity, or a TypeScript projection of it, or an intersection carrying either.
interface ModelTypePart<Identity> {
  readonly identity: Identity;
  readonly alias: string | null;
  readonly arguments: readonly Identity[];
}

function modelPartsMatch<Identity>(parts: readonly ModelTypePart<Identity>[], matches: (identity: Identity) => boolean): boolean {
  return parts.some((part) => matches(part.identity) || (ROW_PROJECTIONS.has(part.alias ?? "") && part.arguments.some(matches)));
}

export function isModelType(type: Type, models: ReadonlySet<unknown>): boolean {
  const bare = type.getNonNullableType();
  return modelPartsMatch(
    (bare.isIntersection() ? [bare, ...bare.getIntersectionTypes()] : [bare]).map((part) => ({
      identity: part.compilerType,
      alias: part.getAliasSymbol()?.getName() ?? null,
      arguments: part.getAliasTypeArguments().map((argument) => argument.compilerType),
    })),
    (identity) => models.has(identity),
  );
}

/** Nonnullable selection and native identity links retain the same row-model grammar without a Type facade. */
export function isObservedModelType(type: NativeSelectedType | null, models: ReadonlySet<number>): boolean {
  return (
    type !== null &&
    modelPartsMatch(
      type.parts.map((part) => ({ identity: part.identity, alias: part.aliasName, arguments: part.aliasArguments })),
      (identity) => identity !== null && models.has(identity),
    )
  );
}

/** Native callers supply the canonical model/query; delivery captures these questions in the same world. */
export function nativeRowReadServices(models: RowModels, query: SchemaQuery): RowReadServices {
  return {
    model: (node, path): boolean => {
      let type: Type | undefined = node.getType();
      for (const key of path) {
        type = type?.getNonNullableType().getProperty(key)?.getTypeAtLocation(node);
      }
      return type !== undefined && isModelType(type, models.select);
    },
    exactModel: (node) => models.select.has(node.getType().compilerType),
    identity: resolveTypeIdentityOrigin,
    property: resolveTypePropertyOrigin,
    lexical: resolveLexicalValueDeclaration,
    target: readCallTarget,
    columnDeclaration: (node) => models.columns.has(node.compilerNode),
    columnReference: (node) => query.column(node).kind === "resolved",
  };
}

// `type X = Pick<Row, …>`: an authored alias over a TypeScript projection of a select model.
function aliasProjectsRow(receiver: Node, readers: RowReadServices): boolean {
  const origin = readers.identity(receiver);
  return (
    origin.kind === "resolved" &&
    origin.value.declarations.some((declaration) => {
      const node = N.isTypeAliasDeclaration(declaration) ? declaration.getTypeNode() : undefined;
      return (
        node !== undefined &&
        N.isTypeReference(node) &&
        ROW_PROJECTIONS.has(node.getTypeName().getText()) &&
        node.getTypeArguments().some((arg) => readers.exactModel(arg))
      );
    })
  );
}

// A select row by identity: the table's `$inferSelect` or a projection of it, a result row whose key the checker
// declares at the schema column (a batch or relational read), or a partial select keyed by a column reference.
// DELIBERATELY NOT `shapeFitsColumns`, the row-shape test `pnpm ast columns` reads by: that test is over-inclusive on
// purpose (a rot lens may over-count reads), and here it judges every verb input or insert object whose fields are all
// column names to be a row — measured 2026-10-11, 26 such sites on this tree.
function isRowNode(node: Node, column: string, readers: RowReadServices): boolean {
  if (readers.model(node, []) || aliasProjectsRow(node, readers)) {
    return true;
  }
  const origin = readers.property(node, column);
  return (
    origin.kind === "resolved" &&
    origin.value.some(
      (declaration) =>
        readers.columnDeclaration(declaration) || (N.isPropertyAssignment(declaration) && readers.columnReference(declaration.getInitializerOrThrow())),
    )
  );
}

// The parameter a receiver reads, and the property path below it: the parameter itself (`card.col`), its binding
// (`({ col }: Card)`), or a binding nested in its pattern (`({ card: { col } }: Wrap)` is path `["card"]`).
function parameterPath(receiver: Node, readers: RowReadServices): { readonly param: ParameterDeclaration; readonly path: readonly string[] } | undefined {
  let node: Node = receiver;
  if (N.isIdentifier(receiver)) {
    const binding = readers.lexical(receiver);
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
function argumentRowAt(arg: Node, path: readonly string[], readers: RowReadServices, isRow: (node: Node) => boolean): boolean {
  return path.length === 0 ? isRow(arg) : readers.model(arg, path);
}

// One hop: a parameter of a function in this file that some call in this file hands a select row, read directly or
// through its destructuring pattern. A hand-typed parameter does not launder the row it receives.
function parameterTakesRow(receiver: Node, column: string, readers: RowReadServices): boolean {
  const reached = parameterPath(receiver, readers);
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
        helperOfWith(call.getExpression(), readers.target)?.compilerNode === fn.compilerNode &&
        argumentRowAt(arg, reached.path, readers, (node) => isRowNode(node, column, readers))
      );
    });
}

/** Is the read taken off a select row, directly or through one parameter hop? */
export function readsSelectRow(read: ColumnRead, models: RowModels, query: SchemaQuery): boolean {
  return readsSelectRowWith(read, nativeRowReadServices(models, query));
}

/** The canonical same-file helper fence and row grammar consume either native or delivered questions. */
export function readsSelectRowWith(read: ColumnRead, readers: RowReadServices): boolean {
  return isRowNode(read.receiver, read.column, readers) || parameterTakesRow(read.receiver, read.column, readers);
}

type Helper = FunctionDeclaration | ArrowFunction | FunctionExpression;

function asHelper(node: Node): Helper | undefined {
  return N.isFunctionDeclaration(node) || N.isArrowFunction(node) || N.isFunctionExpression(node) ? node : undefined;
}

/** The canonical authored body of a callee occurrence, not a second binding/import reader. */
export function helperOf(callee: Node): Helper | undefined {
  return helperOfWith(callee, readCallTarget);
}

/** Supplied target facts retain the helper reader's exact authored callable grammar. */
export function helperOfWith(callee: Node, targetOf: RowReadServices["target"]): Helper | undefined {
  const call = callee.getParentIfKind(SyntaxKind.CallExpression);
  if (call === undefined || call.getExpression() !== callee) {
    return;
  }
  const target = targetOf(call);
  return target.kind === "resolved" ? asHelper(target.value) : undefined;
}
