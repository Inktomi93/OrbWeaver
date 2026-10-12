// The JOIN half of the tenancy read readers: which tables a drizzle read binds (`.from` and every join verb), and
// whether a joined table's ON/WHERE conjuncts scope it, by an owner predicate or an FK edge pointing AT it.
import type { CallExpression } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { ReadAnchor } from "../contract/tenancy.ts";
import { unwrapExpression } from "./ast-read.ts";
import { readMemberAccess } from "./symbol-reference.ts";
import { callsDrizzleOperator, declaredTableOf, enclosingFn } from "./tenancy-read.ts";
import { foreignKeyColumnKey } from "./tenancy-scope.ts";

const FROM_VERB = "from";
/** The drizzle select-builder verbs that bind a second table into a read. */
const JOIN_VERBS: ReadonlySet<string> = new Set(["innerJoin", "leftJoin", "rightJoin", "fullJoin", "crossJoin"]);
const EQ_OPERATOR = "eq";
const AND_OPERATOR = "and";
const MAX_HELPER_DEPTH = 1;

/** The table a `.from(T)` or a join call binds into a read, however the member is spelled; undefined for every
 *  other call. This is the syntactic candidate only: the caller confirms the verb by its declaration. */
export function readAnchorOf(node: Node): ReadAnchor | undefined {
  if (!node.isKind(SyntaxKind.CallExpression)) {
    return;
  }
  const verb = readMemberAccess(node.getExpression())?.name;
  const [table, on] = node.getArguments();
  if (verb === undefined || table === undefined) {
    return;
  }
  if (verb === FROM_VERB) {
    return { kind: "from", call: node, table };
  }
  return JOIN_VERBS.has(verb) ? { kind: "join", call: node, table, on } : undefined;
}

/** A column read whose receiver traces to a declared table: its local receiver text and its FK key. */
function columnOf(node: Node, schemaTableIdents: ReadonlySet<string>): { readonly receiver: string; readonly key: string } | undefined {
  const read = readMemberAccess(unwrapExpression(node));
  const table = read === undefined ? undefined : declaredTableOf(read.receiver, schemaTableIdents);
  return read === undefined || table === undefined ? undefined : { receiver: read.receiver.getText(), key: foreignKeyColumnKey(table, read.name) };
}

/** The conjuncts of a predicate: the arguments of a drizzle `and(…)`, recursively, else the predicate itself. An
 *  `or(…)` stays one opaque conjunct, because no single disjunct binds the row. */
function conjunctsOf(predicate: Node): readonly Node[] {
  const value = unwrapExpression(predicate);
  if (value.isKind(SyntaxKind.CallExpression) && callsDrizzleOperator(value, AND_OPERATOR)) {
    return value.getArguments().flatMap((argument) => conjunctsOf(argument));
  }
  return [value];
}

/** Every value a predicate helper can return: the expression body of an arrow, or each `return` expression of a
 *  function body. Undefined when the callee resolves to no function, or one path returns nothing. */
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
  const returns = body.getDescendantsOfKind(SyntaxKind.ReturnStatement).filter((ret) => enclosingFn(ret) === fn);
  const values = returns.map((ret) => ret.getExpression());
  return values.length === 0 || values.includes(undefined) ? undefined : values.filter((value) => value !== undefined);
}

/** Does `holds` accept some conjunct of these predicates? A conjunct that calls a local or imported predicate
 *  helper (`ownedThemeCluster(ownerId, id)`) counts when `holds` accepts EVERY value the helper can return, one
 *  helper hop deep: a helper with an unscoped branch proves nothing. */
export function predicateHolds(predicates: readonly (Node | undefined)[], holds: (conjunct: Node) => boolean, depth = 0): boolean {
  const conjuncts = predicates.flatMap((predicate) => (predicate === undefined ? [] : conjunctsOf(predicate)));
  return conjuncts.some((conjunct) => {
    if (holds(conjunct)) {
      return true;
    }
    if (depth >= MAX_HELPER_DEPTH || !conjunct.isKind(SyntaxKind.CallExpression)) {
      return false;
    }
    const values = helperReturns(conjunct);
    return values?.every((value) => predicateHolds([value], holds, depth + 1)) === true;
  });
}

/** Does a conjunct bind the joined table J to ANOTHER table's row along a declared foreign key that POINTS AT J
 *  — an `eq(J.col, T.col)` term where `T.col -> J.col` is a schema FK edge? This is the FK-chain inheritance
 *  (Spine-Identity-and-Auth §2b): the joined row is the one a bound row references. The reverse edge
 *  (`J.col -> T.col`) is no chain: it fans out to every owner's rows that reference `T`. A term against a
 *  value (a caller-supplied id) or an undeclared column pairing binds whatever the value names. */
export function chainsThroughForeignKey(
  predicates: readonly (Node | undefined)[],
  joinedIdent: string,
  schemaTableIdents: ReadonlySet<string>,
  fkEdges: ReadonlySet<string>,
): boolean {
  return predicateHolds(predicates, (conjunct) => {
    if (!(conjunct.isKind(SyntaxKind.CallExpression) && callsDrizzleOperator(conjunct, EQ_OPERATOR))) {
      return false;
    }
    const [left, right] = conjunct.getArguments().map((argument) => columnOf(argument, schemaTableIdents));
    if (left === undefined || right === undefined || (left.receiver === joinedIdent) === (right.receiver === joinedIdent)) {
      return false;
    }
    const [joined, bound] = left.receiver === joinedIdent ? [left, right] : [right, left];
    return fkEdges.has(`${bound.key}->${joined.key}`);
  });
}
