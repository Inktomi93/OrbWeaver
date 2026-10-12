// The JOIN half of the tenancy read readers: which tables a drizzle read binds (`.from` and every join verb), and
// whether the statement's conjuncts scope one, by an owner term or by an FK edge pointing AT it.
import { staticMemberAccess } from "@orb/tooling/floor/code-facts/reference-fact";
import type { CallExpression, Identifier } from "ts-morph";
import { Node, SyntaxKind, VariableDeclarationKind } from "ts-morph";
import type { ChainTerm, ReadAnchor, SchemaTableIndex } from "../contract/tenancy.ts";
import { unwrapExpression } from "./ast-read.ts";
import { MEMBER_ACCESS_KINDS } from "./symbol-reference.ts";
import { callsDrizzleOperator, declaredTableOf, enclosingFn } from "./tenancy-read.ts";
import { foreignKeyColumnKey } from "./tenancy-scope.ts";

const FROM_VERB = "from";
/** The drizzle select-builder verbs that bind a second table into a read. */
const JOIN_VERBS: ReadonlySet<string> = new Set(["innerJoin", "leftJoin", "rightJoin", "fullJoin", "crossJoin"]);
const EQ_OPERATOR = "eq";
const IN_ARRAY_OPERATOR = "inArray";
const AND_OPERATOR = "and";
const OWNER_COL = "ownerId";
const MAX_HELPER_DEPTH = 1;
/** The value operators a predicate expression can evaluate to either side of: each side may be the predicate. */
const EITHER_SIDE_OPERATORS: ReadonlySet<SyntaxKind> = new Set([SyntaxKind.QuestionQuestionToken, SyntaxKind.BarBarToken]);

/** The table a `.from(T)` or a join call binds into a read, however the member is spelled; undefined for every
 *  other call. This is the syntactic candidate only: the caller confirms the verb by its declaration. */
export function readAnchorOf(node: Node): ReadAnchor | undefined {
  if (!node.isKind(SyntaxKind.CallExpression)) {
    return;
  }
  const verb = staticMemberAccess(node.getExpression())?.name;
  const [table, on] = node.getArguments();
  if (verb === undefined || table === undefined) {
    return;
  }
  if (verb === FROM_VERB) {
    return { kind: "from", call: node, table };
  }
  return JOIN_VERBS.has(verb) ? { kind: "join", call: node, table, on } : undefined;
}

/** Every table a subquery's inner select binds: the read anchors within that one bounded expression. */
export function innerReadAnchorsOf(select: Node): readonly ReadAnchor[] {
  return [select, ...select.getDescendantsOfKind(SyntaxKind.CallExpression)].flatMap((node) => {
    const anchor = readAnchorOf(node);
    return anchor === undefined ? [] : [anchor];
  });
}

interface ColumnRead {
  readonly receiver: string;
  readonly table: string;
  readonly name: string;
}

/** A column read whose receiver names one declared table: its written receiver, that table and the column. */
function columnOf(node: Node, index: SchemaTableIndex): ColumnRead | undefined {
  const read = staticMemberAccess(unwrapExpression(node));
  const table = read === undefined ? undefined : declaredTableOf(read.receiver, index);
  return read === undefined || table === undefined ? undefined : { receiver: read.receiver.getText(), table, name: read.name };
}

/** Does this node read any column of the table written `ident`? */
function readsTable(node: Node, ident: string): boolean {
  const reads = MEMBER_ACCESS_KINDS.flatMap((kind) => node.getDescendantsOfKind(kind));
  return [node, ...reads].some((candidate) => {
    const read = staticMemberAccess(candidate);
    return read !== undefined && read.receiver.getText() === ident;
  });
}

/** The conjuncts of a predicate: the arguments of a drizzle `and(…)`, recursively, else the predicate itself. An
 *  `or(…)` stays one opaque conjunct, because no single disjunct binds the row. */
function conjunctsOf(predicate: Node): readonly Node[] {
  const value = unwrapExpression(predicate);
  if (value.isKind(SyntaxKind.CallExpression) && callsDrizzleOperator(value, AND_OPERATOR)) {
    return value.getArguments().flatMap((argument) => conjunctsOf(argument));
  }
  if (value.isKind(SyntaxKind.SpreadElement)) {
    return spreadConjuncts(value.getExpression()) ?? [value];
  }
  const bound = value.isKind(SyntaxKind.Identifier) ? constInitializerOf(value) : undefined;
  return bound === undefined ? [value] : conjunctsOf(bound);
}

/** The initializer of the `const` an identifier names, or undefined for anything that can be reassigned. */
function constInitializerOf(identifier: Identifier): Node | undefined {
  const declaration = identifier.getDefinitionNodes().find((definition) => definition.isKind(SyntaxKind.VariableDeclaration));
  if (declaration === undefined || !declaration.isKind(SyntaxKind.VariableDeclaration)) {
    return;
  }
  const isConst = declaration.getFirstAncestorByKind(SyntaxKind.VariableDeclarationList)?.getDeclarationKind() === VariableDeclarationKind.Const;
  return isConst ? declaration.getInitializer() : undefined;
}

/** The terms an `and(...terms)` spread is known to carry: the elements of an array literal, inline or bound to a
 *  local `const`. A later `terms.push(…)` only adds conjuncts, so the declared elements are always among them. */
function spreadConjuncts(spread: Node): readonly Node[] | undefined {
  const value = unwrapExpression(spread);
  const literal = value.isKind(SyntaxKind.Identifier)
    ? value
        .getDefinitionNodes()
        .map((definition) => (definition.isKind(SyntaxKind.VariableDeclaration) ? definition.getInitializer() : undefined))
        .find((initializer) => initializer !== undefined)
    : value;
  const array = literal === undefined ? undefined : unwrapExpression(literal);
  return array?.isKind(SyntaxKind.ArrayLiteralExpression) === true ? array.getElements().flatMap((element) => conjunctsOf(element)) : undefined;
}

/** Every value a predicate helper can return: the expression body of an arrow, or each `return` expression of a
 *  function body. Undefined when the callee resolves to no function, a path returns nothing, or the block end is
 *  reachable (an implicit `undefined`, which scopes nothing). */
function helperReturns(call: CallExpression): readonly Node[] | undefined {
  const callee = unwrapExpression(call.getExpression());
  if (!callee.isKind(SyntaxKind.Identifier)) {
    return;
  }
  const fn = callee
    .getDefinitionNodes()
    .map((definition) => (definition.isKind(SyntaxKind.VariableDeclaration) ? definition.getInitializer() : definition))
    .find((definition) => definition !== undefined && Node.isFunctionLikeDeclaration(definition));
  if (fn === undefined) {
    return;
  }
  const body = fn.isKind(SyntaxKind.ArrowFunction) ? fn.getBody() : fn.getFirstChildByKind(SyntaxKind.Block);
  if (body === undefined || !body.isKind(SyntaxKind.Block)) {
    return body === undefined ? undefined : [body];
  }
  const last = body.getStatements().at(-1);
  if (!(last?.isKind(SyntaxKind.ReturnStatement) === true || last?.isKind(SyntaxKind.ThrowStatement) === true)) {
    return;
  }
  const values = body
    .getDescendantsOfKind(SyntaxKind.ReturnStatement)
    .filter((ret) => enclosingFn(ret) === fn)
    .map((ret) => ret.getExpression());
  return values.length === 0 || values.includes(undefined) ? undefined : values.filter((value) => value !== undefined);
}

/** Does `holds` accept this predicate VALUE on every path: both arms of a ternary, both sides of `??`/`||`? */
function valueHolds(value: Node, holds: (conjunct: Node) => boolean, depth: number): boolean {
  const unwrapped = unwrapExpression(value);
  if (unwrapped.isKind(SyntaxKind.ConditionalExpression)) {
    return valueHolds(unwrapped.getWhenTrue(), holds, depth) && valueHolds(unwrapped.getWhenFalse(), holds, depth);
  }
  if (unwrapped.isKind(SyntaxKind.BinaryExpression) && EITHER_SIDE_OPERATORS.has(unwrapped.getOperatorToken().getKind())) {
    return valueHolds(unwrapped.getLeft(), holds, depth) && valueHolds(unwrapped.getRight(), holds, depth);
  }
  return predicateHolds([unwrapped], holds, depth);
}

/** Does `holds` accept some conjunct of these predicates? A ternary or `??` conjunct counts only when every arm
 *  does. A conjunct that calls a local or imported predicate helper (`ownedThemeCluster(ownerId, id)`) counts when
 *  `holds` accepts EVERY value the helper can return, one helper hop deep: an unscoped branch proves nothing. */
export function predicateHolds(predicates: readonly (Node | undefined)[], holds: (conjunct: Node) => boolean, depth = 0): boolean {
  const conjuncts = predicates.flatMap((predicate) => (predicate === undefined ? [] : conjunctsOf(predicate)));
  return conjuncts.some((conjunct) => {
    if (holds(conjunct)) {
      return true;
    }
    if (conjunct.isKind(SyntaxKind.ConditionalExpression) || conjunct.isKind(SyntaxKind.BinaryExpression)) {
      return valueHolds(conjunct, holds, depth);
    }
    if (depth >= MAX_HELPER_DEPTH || !conjunct.isKind(SyntaxKind.CallExpression)) {
      return false;
    }
    const values = helperReturns(conjunct);
    return values?.every((value) => valueHolds(value, holds, depth + 1)) === true;
  });
}

function isOwnerColumn(node: Node, ident: string): boolean {
  const read = staticMemberAccess(unwrapExpression(node));
  return read?.name === OWNER_COL && read.receiver.getText() === ident;
}

/** Is this conjunct an owner term on the table written `ident`: `eq(T.ownerId, value)` or
 *  `inArray(T.ownerId, owners)` by its drizzle import, where the value does not read `T` itself? `or`, `ne`,
 *  `isNotNull`, a `sql` template and `eq(T.ownerId, T.ownerId)` all name the column and scope nothing. */
export function isOwnerTerm(conjunct: Node, ident: string): boolean {
  if (!conjunct.isKind(SyntaxKind.CallExpression)) {
    return false;
  }
  const [left, right] = conjunct.getArguments();
  if (left === undefined || right === undefined) {
    return false;
  }
  if (callsDrizzleOperator(conjunct, IN_ARRAY_OPERATOR)) {
    return isOwnerColumn(left, ident) && !readsTable(right, ident);
  }
  if (!callsDrizzleOperator(conjunct, EQ_OPERATOR)) {
    return false;
  }
  return (isOwnerColumn(left, ident) && !readsTable(right, ident)) || (isOwnerColumn(right, ident) && !readsTable(left, ident));
}

/** Does this conjunct select rows by a VALUE on the written column (`eq(chats.anchorPersonaId, personaId)`,
 *  `inArray(personas.id, ids)`)? A term against another table's column is a join condition, not a selection. */
export function selectsByValue(conjunct: Node, column: string, index: SchemaTableIndex): boolean {
  if (!(conjunct.isKind(SyntaxKind.CallExpression) && (callsDrizzleOperator(conjunct, EQ_OPERATOR) || callsDrizzleOperator(conjunct, IN_ARRAY_OPERATOR)))) {
    return false;
  }
  const [left, right] = conjunct.getArguments();
  const names = (node: Node | undefined): boolean => node !== undefined && unwrapExpression(node).getText() === column;
  const isValue = (node: Node | undefined): boolean => node !== undefined && columnOf(node, index) === undefined;
  return (names(left) && isValue(right)) || (names(right) && isValue(left));
}

/** Does `test` accept some plain conjunct (no helper hop) of these predicates? */
export function anyConjunct(predicates: readonly (Node | undefined)[], test: (conjunct: Node) => boolean): boolean {
  return predicates.some((predicate) => predicate !== undefined && conjunctsOf(predicate).some(test));
}

/** The conjuncts that bind the joined table J to ANOTHER table's row along a declared foreign key that POINTS AT
 *  J — an `eq(J.col, T.col)` term where `T.col -> J.col` is a schema FK edge. This is the FK-chain inheritance
 *  (Spine-Identity-and-Auth §2b): the joined row is the one a bound row references. The reverse edge
 *  (`J.col -> T.col`) is no chain: it fans out to every owner's rows that reference `T`. A term against a value
 *  (a caller-supplied id), an undeclared column pairing, or one inside `or(…)` binds whatever the value names. */
export function chainTermsOf(
  predicates: readonly (Node | undefined)[],
  joinedIdent: string,
  index: SchemaTableIndex,
  fkEdges: ReadonlySet<string>,
): readonly ChainTerm[] {
  const conjuncts = predicates.flatMap((predicate) => (predicate === undefined ? [] : conjunctsOf(predicate)));
  return conjuncts.flatMap((conjunct): ChainTerm[] => {
    if (!(conjunct.isKind(SyntaxKind.CallExpression) && callsDrizzleOperator(conjunct, EQ_OPERATOR))) {
      return [];
    }
    const [left, right] = conjunct.getArguments().map((argument) => columnOf(argument, index));
    if (left === undefined || right === undefined || (left.receiver === joinedIdent) === (right.receiver === joinedIdent)) {
      return [];
    }
    const [joined, bound] = left.receiver === joinedIdent ? [left, right] : [right, left];
    const edge = `${foreignKeyColumnKey(bound.table, bound.name)}->${foreignKeyColumnKey(joined.table, joined.name)}`;
    return fkEdges.has(edge) ? [{ boundTable: bound.table, boundColumn: `${bound.receiver}.${bound.name}` }] : [];
  });
}
