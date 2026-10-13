// Native column member/destructure facts preserve authored anchors and receiver occurrences.
import type { ArrowFunction, BindingElement, FunctionDeclaration, FunctionExpression, Node, ParameterDeclaration, Type } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import { readCallTarget } from "./call-returns.ts";
import type { ColumnRead, RowModels } from "./drizzle-row-contract.ts";
import { ROW_PROJECTIONS } from "./drizzle-row-type.ts";
import { readStaticString, resolveLexicalValueDeclaration } from "./reference-fact.ts";
import { literalString as readStringValue } from "./reference-fact-static.ts";
import type { SchemaModel, SchemaQuery } from "./schema-model-contract.ts";
import { resolveTypeIdentityOrigin } from "./type-member-origin.ts";
import { resolveTypePropertyOrigin } from "./type-member-origin-core.ts";

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

// A table's own model by type identity, or a TypeScript projection of it, or an intersection carrying either.
export function isModelType(type: Type, models: ReadonlySet<unknown>): boolean {
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

type Helper = FunctionDeclaration | ArrowFunction | FunctionExpression;

function asHelper(node: Node): Helper | undefined {
  return N.isFunctionDeclaration(node) || N.isArrowFunction(node) || N.isFunctionExpression(node) ? node : undefined;
}

/** The canonical authored body of a callee occurrence, not a second binding/import reader. */
export function helperOf(callee: Node): Helper | undefined {
  const call = callee.getParentIfKind(SyntaxKind.CallExpression);
  if (call === undefined || call.getExpression() !== callee) {
    return;
  }
  const target = readCallTarget(call);
  return target.kind === "resolved" ? asHelper(target.value) : undefined;
}
