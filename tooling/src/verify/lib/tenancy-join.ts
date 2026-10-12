// The JOIN half of the tenancy read readers: which tables a drizzle read binds (`.from`, every join verb and the
// relational `db.query.<t>` verbs), what terms its predicates carry, and which owner terms or FK edges scope a table.
import { staticMemberAccess } from "@orb/tooling/floor/code-facts/reference-fact";
import type { CallExpression, Identifier } from "ts-morph";
import { Node, SyntaxKind, VariableDeclarationKind } from "ts-morph";
import type { ChainTerm, ConjunctLeaves, ReadAnchor, SchemaTableIndex } from "../contract/tenancy.ts";
import { unwrapExpression } from "./ast-read.ts";
import { MEMBER_ACCESS_KINDS } from "./symbol-reference.ts";
import { callsDrizzleOperator, declaredTableOf, enclosingFn, RELATIONAL_VERBS, relationalOperatorName } from "./tenancy-read.ts";
import { EDGE_ARROW, foreignKeyColumnKey } from "./tenancy-scope.ts";

const FROM_VERB = "from";
const RELATIONAL_ROOT = "query";
const UNDEFINED_VALUE = "undefined";
const PUSH_METHOD = "push";
const MAP_METHOD = "map";
/** The drizzle select-builder verbs that bind a second table into a read. */
const JOIN_VERBS: ReadonlySet<string> = new Set(["innerJoin", "leftJoin", "rightJoin", "fullJoin", "crossJoin"]);
const EQ_OPERATOR = "eq";
const IN_ARRAY_OPERATOR = "inArray";
const AND_OPERATOR = "and";
const OWNER_COL = "ownerId";
const MAX_HELPER_DEPTH = 1;
// The existential leaf reader follows nested predicate helpers further than the owner arm: a deeper read only
// finds more terms, and a helper past the cap is opaque, never absent.
const MAX_LEAF_HELPER_DEPTH = 3;
/** The value operators a predicate expression can evaluate to either side of: each side may be the predicate. */
const EITHER_SIDE_OPERATORS: ReadonlySet<SyntaxKind> = new Set([SyntaxKind.QuestionQuestionToken, SyntaxKind.BarBarToken]);

/** The table a `.from(T)` or a join call binds into a read, however the member is spelled; undefined for every
 *  other call. This is the syntactic candidate only: the caller confirms the verb by its declaration. */
export function readAnchorOf(node: Node): ReadAnchor | undefined {
  if (!node.isKind(SyntaxKind.CallExpression)) {
    return;
  }
  const verb = staticMemberAccess(node.getExpression())?.name;
  if (verb !== undefined && RELATIONAL_VERBS.has(verb)) {
    return relationalAnchorOf(node);
  }
  const [table, on] = node.getArguments();
  if (verb === undefined || table === undefined) {
    return;
  }
  if (verb === FROM_VERB) {
    return { kind: "from", call: node, table };
  }
  return JOIN_VERBS.has(verb) ? { kind: "join", call: node, table, on } : undefined;
}

/** The relational-API read `<db>.query.<t>.findFirst|findMany(config)`: the `<t>` member names the table. */
function relationalAnchorOf(call: CallExpression): ReadAnchor | undefined {
  const verb = staticMemberAccess(call.getExpression());
  const table = verb === undefined ? undefined : staticMemberAccess(unwrapExpression(verb.receiver));
  const root = table === undefined ? undefined : staticMemberAccess(unwrapExpression(table.receiver));
  return table !== undefined && root?.name === RELATIONAL_ROOT
    ? { kind: "relational", call, table: table.nameNode, config: call.getArguments()[0] }
    : undefined;
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
export function readsTable(node: Node, ident: string): boolean {
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
  return fn === undefined ? undefined : functionReturns(fn);
}

/** Every value a function returns, on the same terms as {@link helperReturns}. */
function functionReturns(fn: Node): readonly Node[] | undefined {
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

/** The value side of an owner term on the table written `ident`: `eq(T.ownerId, value)` or
 *  `inArray(T.ownerId, owners)` by its drizzle import, where the value does not read `T` itself; undefined for
 *  any other conjunct. `or`, `ne`, `isNotNull`, a `sql` template and `eq(T.ownerId, T.ownerId)` all name the
 *  column and scope nothing. Whether a column or subselect value is pinned is the caller's second question. */
export function ownerTermValue(conjunct: Node, ident: string): Node | undefined {
  if (!conjunct.isKind(SyntaxKind.CallExpression)) {
    return;
  }
  const [left, right] = conjunct.getArguments();
  if (left === undefined || right === undefined) {
    return;
  }
  if (callsDrizzleOperator(conjunct, IN_ARRAY_OPERATOR)) {
    return isOwnerColumn(left, ident) && !readsTable(right, ident) ? right : undefined;
  }
  if (!callsDrizzleOperator(conjunct, EQ_OPERATOR)) {
    return;
  }
  if (isOwnerColumn(left, ident) && !readsTable(right, ident)) {
    return right;
  }
  return isOwnerColumn(right, ident) && !readsTable(left, ident) ? left : undefined;
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

const NO_LEAVES: ConjunctLeaves = { leaves: [], opaque: false };

function mergeLeaves(parts: readonly ConjunctLeaves[]): ConjunctLeaves {
  return { leaves: parts.flatMap((part) => part.leaves), opaque: parts.some((part) => part.opaque) };
}

/** Every term these predicates can carry, for the existential questions (does SOME term select by id?): through
 *  `and(…)`, `const` bindings, array spreads with the terms a local `.push(…)` adds, and one helper hop. A
 *  conjunct no reader resolves marks the predicate opaque, so the caller treats it as unproven, never as absent. */
export function conjunctLeaves(predicates: readonly (Node | undefined)[], depth = 0): ConjunctLeaves {
  return mergeLeaves(predicates.map((predicate) => (predicate === undefined ? NO_LEAVES : leavesOf(predicate, depth))));
}

function leavesOf(predicate: Node, depth: number): ConjunctLeaves {
  const value = unwrapExpression(predicate);
  if (value.isKind(SyntaxKind.CallExpression) && callsDrizzleOperator(value, AND_OPERATOR)) {
    return conjunctLeaves(value.getArguments(), depth);
  }
  if (value.isKind(SyntaxKind.SpreadElement)) {
    return spreadLeaves(value.getExpression(), depth);
  }
  if (value.isKind(SyntaxKind.Identifier)) {
    if (value.getText() === UNDEFINED_VALUE) {
      return NO_LEAVES;
    }
    const bound = constInitializerOf(value);
    return bound === undefined ? { leaves: [value], opaque: true } : leavesOf(bound, depth);
  }
  if (value.isKind(SyntaxKind.CallExpression) && isLocalHelperCall(value)) {
    const values = depth >= MAX_LEAF_HELPER_DEPTH ? undefined : helperReturns(value);
    return values === undefined ? { leaves: [value], opaque: true } : conjunctLeaves(values, depth + 1);
  }
  return { leaves: [value], opaque: false };
}

/** Is the callee a function this program authors (a local or imported helper), rather than an operator from a
 *  package or an unresolved module? Only an authored helper can hide its terms behind its name. */
function isLocalHelperCall(call: CallExpression): boolean {
  const callee = unwrapExpression(call.getExpression());
  if (!callee.isKind(SyntaxKind.Identifier) || relationalOperatorName(callee) !== undefined) {
    return false;
  }
  const definitions = callee.getDefinitionNodes();
  return (
    definitions.length > 0 && !definitions.some((definition) => definition.isKind(SyntaxKind.ImportSpecifier) || definition.getSourceFile().isDeclarationFile())
  );
}

/** The terms `ids.map((id) => term)` builds: every value its inline callback returns. */
function mappedTerms(call: CallExpression): readonly Node[] | undefined {
  const [callback] = call.getArguments();
  const isMap = staticMemberAccess(call.getExpression())?.name === MAP_METHOD;
  return isMap && callback !== undefined && (callback.isKind(SyntaxKind.ArrowFunction) || callback.isKind(SyntaxKind.FunctionExpression))
    ? functionReturns(callback)
    : undefined;
}

/** The terms an `and(...terms)` spread can carry: an array literal's elements (each arm of a conditional), or a
 *  `const` array's terms plus every `terms.push(…)` argument in its scope. Anything else is opaque. */
function spreadLeaves(spread: Node, depth: number): ConjunctLeaves {
  const value = unwrapExpression(spread);
  if (value.isKind(SyntaxKind.ArrayLiteralExpression)) {
    return conjunctLeaves(value.getElements(), depth);
  }
  if (value.isKind(SyntaxKind.ConditionalExpression)) {
    return mergeLeaves([spreadLeaves(value.getWhenTrue(), depth), spreadLeaves(value.getWhenFalse(), depth)]);
  }
  const mapped = value.isKind(SyntaxKind.CallExpression) ? mappedTerms(value) : undefined;
  if (mapped !== undefined) {
    return conjunctLeaves(mapped, depth);
  }
  const initializer = value.isKind(SyntaxKind.Identifier) ? constInitializerOf(value) : undefined;
  if (initializer === undefined) {
    return { leaves: [value], opaque: true };
  }
  const symbol = value.getSymbol()?.compilerSymbol;
  const scope = enclosingFn(value) ?? value.getSourceFile();
  const pushed = scope.getDescendantsOfKind(SyntaxKind.CallExpression).flatMap((call) => {
    const method = staticMemberAccess(call.getExpression());
    return method?.name === PUSH_METHOD && symbol !== undefined && method.receiver.getSymbol()?.compilerSymbol === symbol ? call.getArguments() : [];
  });
  return mergeLeaves([spreadLeaves(initializer, depth), conjunctLeaves(pushed, depth)]);
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
    const edge = `${foreignKeyColumnKey(bound.table, bound.name)}${EDGE_ARROW}${foreignKeyColumnKey(joined.table, joined.name)}`;
    return fkEdges.has(edge) ? [{ boundTable: bound.table, boundReceiver: bound.receiver, boundColumn: `${bound.receiver}.${bound.name}` }] : [];
  });
}
