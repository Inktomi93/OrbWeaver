// Shared readers for the TENANCY gates (`owner-scoped-reads` + `owner-scoped-writes` + `owner-scoped-upserts`)
// — ONE home for the questions all three must answer IDENTICALLY: what does this drizzle statement PREDICATE
// on (`.where` for a read/write, the `onConflictDoUpdate` config for an upsert), and (for `owner-scoped-reads`)
// whether a POST-FETCH filter relates the fetched row's owner to the caller's. Re-spelled per gate they would
// drift on exactly the question they exist to enforce (`tooling/src/floor/code-facts/schema-read.ts` is the same call
// for what a `sqliteTable(...)` DECLARES). The (a)-class table set they cross this with is derived by
// `gates/table-scoping-class.ts`. Homed here rather than in the gate file because these readers walk BOUNDED
// node subtrees (`getDescendantsOfKind` on a function body / statement / expression, never a `SourceFile`) —
// exactly the shape `verify/lib` exists for; the static `gate:contract` census globs only `gates/*.ts` and
// cannot see past the receiver to tell a bounded node walk from a repository one.
import type { DrizzleTableRef } from "@orb/tooling/floor/code-facts/drizzle-table-ref";
import { resolveDrizzleTableRefs } from "@orb/tooling/floor/code-facts/drizzle-table-ref";
import { resolveModuleMemberOrigin, resolveStableExpression, staticMemberAccess } from "@orb/tooling/floor/code-facts/reference-fact";
import type { VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readMemberUses } from "../../floor/code-facts/drizzle-column-reads.ts";
import { readReturnOccurrences, resultReferenceDepths } from "../../floor/code-facts/drizzle-row-flow.ts";
import { readFollowingBuilderChain } from "../../floor/code-facts/drizzle-statement.ts";
import { enclosingFn, readFunctionBodyNodes } from "../../floor/code-facts/function-context.ts";
import { MEMBER_ACCESS_KINDS } from "../../floor/code-facts/reference-fact-contract.ts";
import type { SchemaTableIndex, TableRef, TableTarget } from "../contract/tenancy.ts";
import { unwrapExpression } from "./ast-read.ts";

const OWNER_COL = "ownerId";
const SCHEMA_DIR = "/packages/db/src/schema/";
const CALLER_OWNER_BINDING_RE = /^(?:caller|(?:caller|owner|user)[A-Za-z0-9_]*Id)$/u;

/** The chained calls only a drizzle statement can carry. The DISCRIMINATOR for the unresolvable arm: an
 *  identifier the resolver cannot trace is a finding only when the statement is provably a drizzle write —
 *  `cache.delete(key)` / `hash.update(bytes)` are the SAME AST shape, and 72 of them live in
 *  `packages/server/src` (measured 2026-08-27), every one of them chain-free. */
const DRIZZLE_WRITE_CHAIN = new Set(["set", "values", "returning", "where", "onConflictDoUpdate", "onConflictDoNothing"]);

/** Does raw SQL text name any schema table by its SQL name? Only a constant that names none reads none. */
function namesSchemaTable(text: string, index: SchemaTableIndex): boolean {
  return [...index.identBySqlName.keys()].some((sqlName) => new RegExp(String.raw`\b${sqlName}\b`, "u").test(text));
}

/** The declared schema identifier one floor answer names, or undefined when it names none. */
function identOfRef(ref: DrizzleTableRef, index: SchemaTableIndex): string | undefined {
  if (ref.kind === "table") {
    return ref.declaration.getName();
  }
  if (ref.kind === "imported") {
    return index.idents.has(ref.name) ? ref.name : undefined;
  }
  return ref.kind === "sql-name" ? index.identBySqlName.get(ref.sqlName) : undefined;
}

/** The schema tables a reference can name, through the ONE table resolver `pnpm ast columns` shares
 *  (`floor/code-facts/drizzle-table-ref.ts`): declarations, renaming and namespace imports, drizzle `alias()`/
 *  `aliasedTable()`, both arms of a conditional, a subquery's inner select, and the drizzle type's table name. */
export function tableRefsOf(node: Node, index: SchemaTableIndex, nativeReferences?: readonly DrizzleTableRef[]): readonly TableRef[] {
  const isTable = (declaration: VariableDeclaration): boolean =>
    index.idents.has(declaration.getName()) && declaration.getSourceFile().getFilePath().includes(SCHEMA_DIR);
  return (nativeReferences ?? resolveDrizzleTableRefs(node, isTable)).map((ref): TableRef => {
    if (ref.kind === "subquery") {
      return { kind: "subquery", select: ref.select };
    }
    if (ref.kind === "raw-sql") {
      return ref.interpolates || namesSchemaTable(ref.text, index) ? { kind: "unresolved" } : { kind: "no-table" };
    }
    const ident = identOfRef(ref, index);
    return ident === undefined ? { kind: "unresolved" } : { kind: "table", ident };
  });
}

/** Classify a drizzle table argument against `classTableIdents` — the CLASS THE CALLER IS ASKING ABOUT (the
 *  three `owner-scoped-*` gates pass the `ownerId` set; `membership-write-fan` passes the `membership` set,
 *  #1734). The full index is the denominator that separates "reads fine, simply not that class" from "I could
 *  not read this at all": an argument any arm of which the resolver cannot name is `unresolvable`. */
export function tableTargetOf(node: Node | undefined, classTableIdents: ReadonlySet<string>, index: SchemaTableIndex): TableTarget | undefined {
  if (node === undefined || Node.isLiteralLike(node)) {
    return;
  }
  const refs = tableRefsOf(node, index);
  const ident = node.getText();
  if (refs.some((ref) => ref.kind === "unresolved")) {
    return { kind: "unresolvable", ident };
  }
  return refs.some((ref) => ref.kind === "table" && classTableIdents.has(ref.ident)) ? { kind: "in-class", ident } : { kind: "other-table" };
}

/** The ONE declared table a reference names, or undefined when it names none or more than one. */
export function declaredTableOf(node: Node, index: SchemaTableIndex, nativeReferences?: readonly DrizzleTableRef[]): string | undefined {
  const refs = tableRefsOf(node, index, nativeReferences);
  const [first] = refs;
  return refs.length === 1 && first?.kind === "table" ? first.ident : undefined;
}

/** Is the statement this table anchor starts provably a DRIZZLE write? The fence the unresolvable arm needs:
 *  `db.delete(T)` and `cache.delete(key)` are one AST shape, so only the chained drizzle-only builders
 *  (`.set` / `.values` / `.where` / `.returning` / `.onConflict…`) can tell them apart without a type graph
 *  the pure-AST harness does not build. DECLARED LIMIT: a CHAIN-FREE statement (`db.delete(T);` unbounded)
 *  is indistinguishable from a `Map.delete` and stays out of the unresolvable arm. */
export function isDrizzleWriteStatement(anchor: Node): boolean {
  return readFollowingBuilderChain(anchor).calls.some((call) => {
    const callee = staticMemberAccess(call.getExpression());
    return callee !== undefined && DRIZZLE_WRITE_CHAIN.has(callee.name);
  });
}

/** Immutable aliases retain receiver identity; SQL aliases remain distinct call values, not their base table. */
export function sameReadReceiver(left: Node, right: Node | string): boolean {
  if (typeof right === "string") {
    return left.getText() === right;
  }
  if (left.getProject() !== right.getProject()) {
    return false;
  }
  const identity = (receiver: Node): { readonly node: Node; readonly member: string } | undefined => {
    const origin = resolveModuleMemberOrigin(receiver);
    if (origin.kind === "resolved" && origin.value.canonical.kind === "external-door") {
      return { node: origin.value.canonical.declaration, member: [origin.value.exportedName, ...origin.value.memberPath].join(".") };
    }
    const declaration =
      origin.kind === "resolved" && origin.value.canonical.kind === "project" && origin.value.memberPath.length === 0
        ? origin.value.canonical.declaration
        : undefined;
    const name = declaration?.isKind(SyntaxKind.VariableDeclaration) === true ? declaration.getNameNode() : receiver;
    const fact = resolveStableExpression(name);
    if (fact.kind === "resolved") {
      return { node: fact.value, member: "" };
    }
    return fact.reason === "dynamic" || (fact.reason === "missing" && fact.node.isKind(SyntaxKind.Parameter)) ? { node: fact.node, member: "" } : undefined;
  };
  const a = identity(left);
  const b = identity(right);
  return a !== undefined && b !== undefined && a.node.compilerNode === b.node.compilerNode && a.member === b.member;
}

/** Does this predicate name the exact local table binding's column? Text elsewhere in the expression is not
 *  evidence: only a property access rooted at the write target can scope that target. */
export function predicatesTableColumn(predicate: Node, tableIdent: string, column: string): boolean {
  const descendants = MEMBER_ACCESS_KINDS.flatMap((kind) => predicate.getDescendantsOfKind(kind));
  const candidates = MEMBER_ACCESS_KINDS.some((kind) => predicate.isKind(kind)) ? [predicate, ...descendants] : descendants;
  return candidates.some((candidate) => {
    const read = staticMemberAccess(candidate);
    // The RECEIVER is compared by TEXT rather than required to be an Identifier (#2199): the write target is
    // whatever `tableTargetOf` named it, which for a namespace-spelled table is `schema.characters`. Requiring
    // an identifier receiver here would have ACQUITTED nothing and ACCUSED everything on the namespace side —
    // the owner predicate that is plainly there (`eq(schema.characters.ownerId, callerId)`) would read as
    // absent, turning a spelling into a false finding on code that is correctly scoped.
    return read !== undefined && read.name === column && read.receiver.getText() === tableIdent;
  });
}

/** The `.where(…)` argument of the statement this table anchor starts, or undefined (NO where clause at all —
 *  which means a LIST read on the read side and an UNBOUNDED write on the write side; the two halves judge
 *  that differently, so this reader only reports the absence). */
export function whereArgOf(anchor: Node): Node | undefined {
  const whereCall = readFollowingBuilderChain(anchor).calls.find((call) => staticMemberAccess(call.getExpression())?.name === "where");
  return whereCall?.getArguments()[0];
}

/** The `onConflictDoUpdate({ … })` CONFIG of the statement this `insert(T)` anchor starts, or undefined —
 *  which means a plain insert or an `onConflictDoNothing`, neither of which can overwrite an existing row.
 *  This is the upsert's answer to `whereArgOf`: an upsert's collision is decided by the conflict TARGET (a
 *  unique index) and the optional `targetWhere`/`setWhere`, never by a `.where` on the statement. */
export function upsertConfigOf(anchor: Node): Node | undefined {
  const upsertCall = readFollowingBuilderChain(anchor).calls.find((call) => staticMemberAccess(call.getExpression())?.name === "onConflictDoUpdate");
  return upsertCall?.getArguments()[0];
}

/** Does this WHERE constrain the table's OWN id — `eq(T.id, x)` or `inArray(T.id, ids)`? That is the shape
 *  whose answer is "whatever id the caller supplies, whoever owns it"; a predicate on any other column is a
 *  different (unenforced-here) question. */
export function predicatesOwnId(whereText: string, tableIdent: string): boolean {
  // The ident is ESCAPED because it is no longer always a bare word: a namespace-spelled target is
  // `schema.characters`, whose `.` would otherwise match any character (#2199).
  return new RegExp(String.raw`\b${tableIdent.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)}\.id\b`, "u").test(whereText);
}

/** Owner-member attribution is a consumer judgment over real member/lineage observations. */
function resultOwnerReads(side: Node, resultDecl: Node): readonly Node[] {
  return readMemberUses(side).flatMap((fact) =>
    fact.kind === "resolved" && fact.value.name === OWNER_COL && resultReferenceDepths(fact.value.receiver, resultDecl).some((depth) => depth <= 1)
      ? [fact.value.access]
      : [],
  );
}

function expressionDerivesFromReadResult(expression: Node, resultDecl: Node): boolean {
  return resultReferenceDepths(unwrapExpression(expression), resultDecl).some((depth) => depth <= 1);
}

/** Does this expression name the caller-side owner identity rather than another fetched/ambient row? The
 *  accepted forms are an explicit local binding (`ownerId`, `caller`, `callerUserId`) or the authenticated
 *  identity projection (`principal.userId` / `caller.userId`). An arbitrary `other.ownerId` is not an
 *  authority relationship merely because it shares the column name. */
function isCallerOwnerBinding(side: Node, resultDecl: Node): boolean {
  const value = unwrapExpression(side);
  if (expressionDerivesFromReadResult(value, resultDecl)) {
    return false;
  }
  if (value.isKind(SyntaxKind.Identifier)) {
    return CALLER_OWNER_BINDING_RE.test(value.getText());
  }
  if (!value.isKind(SyntaxKind.PropertyAccessExpression) || value.getName() !== "userId") {
    return false;
  }
  const principalText = value.getExpression().getText();
  return principalText === "principal" || principalText === "caller" || principalText.endsWith(".principal") || principalText.endsWith(".caller");
}

/** A mismatch branch protects egress only when it definitely leaves without returning the fetched result.
 *  This deliberately recognises the guard-clause register (`throw`, `return null`, or a block ending in one)
 *  and rejects a logging-only branch or `return row`. */
function rejectsFetchedResult(statement: Node, resultDecl: Node): boolean {
  if (statement.isKind(SyntaxKind.ThrowStatement)) {
    return true;
  }
  if (statement.isKind(SyntaxKind.ReturnStatement)) {
    const expression = statement.getExpression();
    return expression === undefined || !expressionDerivesFromReadResult(expression, resultDecl);
  }
  if (!statement.isKind(SyntaxKind.Block)) {
    return false;
  }
  const outerFn = enclosingFn(statement);
  const leaksOnAnyBranch = readReturnOccurrences(statement).some((ret) => {
    if (enclosingFn(ret) !== outerFn) {
      return false;
    }
    const expression = ret.getExpression();
    return expression !== undefined && expressionDerivesFromReadResult(expression, resultDecl);
  });
  if (leaksOnAnyBranch) {
    return false;
  }
  const last = statement.getStatements().at(-1);
  return last !== undefined && rejectsFetchedResult(last, resultDecl);
}

/** Walk a `!==` mismatch through parentheses / OR clauses to the `if` it makes true. `&&` is intentionally
 *  excluded: a second false conjunct would let a mismatched row continue to egress. */
function rejectingGuardOf(comparison: Node, resultDecl: Node): boolean {
  let condition: Node = comparison;
  for (;;) {
    const parent = condition.getParent();
    if (parent?.isKind(SyntaxKind.ParenthesizedExpression) === true) {
      condition = parent;
      continue;
    }
    if (parent?.isKind(SyntaxKind.BinaryExpression) === true && parent.getOperatorToken().getKind() === SyntaxKind.BarBarToken) {
      condition = parent;
      continue;
    }
    if (parent?.isKind(SyntaxKind.IfStatement) !== true || parent.getExpression() !== condition) {
      return false;
    }
    return rejectsFetchedResult(parent.getThenStatement(), resultDecl);
  }
}

/** A verifier may return the ownership relationship itself instead of loading the row for egress. Keep
 *  this arm deliberately narrow: the exact `===` comparison must be the return expression. */
function returnsOwnerVerdict(comparison: Node): boolean {
  let expression = comparison;
  while (expression.getParent()?.isKind(SyntaxKind.ParenthesizedExpression) === true) {
    expression = expression.getParentOrThrow();
  }
  return expression.getParent()?.isKind(SyntaxKind.ReturnStatement) === true;
}

/** The POST-FETCH-FILTER arm `owner-scoped-reads` accepts as an alternative to putting the owner in the
 *  WHERE: the enclosing function must relate the exact fetched result's `.ownerId` to the caller's authorized
 *  owner binding. A row-loading function rejects a mismatch; a boolean verifier may return the exact equality
 *  relationship directly. */
export function hasPostFetchFilter(read: Node, fn: Node | undefined): boolean {
  if (fn === undefined) {
    return false;
  }
  const resultDecl = read.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  if (resultDecl === undefined) {
    return false;
  }
  return readFunctionBodyNodes(fn)
    .filter(Node.isBinaryExpression)
    .some((b) => {
      const op = b.getOperatorToken().getKind();
      if (op !== SyntaxKind.ExclamationEqualsEqualsToken && op !== SyntaxKind.EqualsEqualsEqualsToken) {
        return false;
      }
      const left = b.getLeft();
      const right = b.getRight();
      const leftIsResultOwner = resultOwnerReads(left, resultDecl).length > 0;
      const rightIsResultOwner = resultOwnerReads(right, resultDecl).length > 0;
      if (leftIsResultOwner === rightIsResultOwner) {
        return false;
      }
      const callerOwner = leftIsResultOwner ? right : left;
      if (!isCallerOwnerBinding(callerOwner, resultDecl)) {
        return false;
      }
      return op === SyntaxKind.EqualsEqualsEqualsToken ? returnsOwnerVerdict(b) : rejectingGuardOf(b, resultDecl);
    });
}
