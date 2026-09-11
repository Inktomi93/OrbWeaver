// The shared "external-id-single-writer" family reader (Spine-Identity-and-Auth.md U1): the ONE
// `users.externalId`/`external_id` write-shape predicate, the two sanctioned capability files, and the
// atomic-claim-writer name. `external-id-single-writer.ts` (per-file detector) and
// `external-id-single-writer-health.ts` (whole-population carve-out proof) both read this module instead of
// each carrying its own copy — a family means a shared `lib/` reader, never a shared theme
// (gate-runtime-standardization.md).
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { unwrapExpression } from "./ast-read.ts";

export const EXTERNAL_ID_KEYS: ReadonlySet<string> = new Set(["externalId", "external_id"]);
/** The users-row write verbs: the two sessions persistence wrappers + the raw drizzle write surface. An
 *  `externalId` object-key whose nearest enclosing call is one of these is a COLUMN write; the same key in a
 *  `.select(...)` map / an `audit(...)` metadata object / a bare return object is not. */
export const EXTERNAL_ID_WRITE_VERBS: ReadonlySet<string> = new Set(["insertUser", "updateUser", "set", "values", "onConflictDoUpdate"]);

const SESSIONS = "packages/server/src/domain/sessions/";
export const LINK_CAPABILITY = `${SESSIONS}verbs/link-external-id.ts`;
export const PROVISION_CAPABILITY = `${SESSIONS}verbs/provision-identity.ts`;
export const CLAIM_WRITER = "claimExternalIdIfUnbound";
/** WHO MAY CALL THE ATOMIC CLAIM: the TWO sanctioned capability VERBS this family's message names, and
 *  nobody else. It was LINK-only until 2026-09-05 (#1451), which forbade the consolidation U1 asks for:
 *  provision-identity could bind the column by hand (`changes.externalId = …`, its carve-out below) but not
 *  through the ONE atomic writer — so the owner-flip bind stayed a read-then-plain-UPDATE and two concurrent
 *  owner logins with different subjects both won it. Widening this set REDUCES the bind mechanisms from two
 *  to one; a THIRD caller is still the fragmentation hole. */
export const EXTERNAL_ID_CLAIM_CALLERS: ReadonlySet<string> = new Set([LINK_CAPABILITY, PROVISION_CAPABILITY]);
/** The TWO physical externalId writers serving the sanctioned capabilities. Named individually so a stale
 *  finding can name the dead one. */
export const EXTERNAL_ID_SANCTIONED_FILES = [PROVISION_CAPABILITY, `${SESSIONS}persistence/users.ts`] as const;

/** The simple name of a call's callee: `insertUser(…)` → "insertUser"; `db.x(…).set(…)` → "set". */
export function externalIdCalleeName(call: Node): string | undefined {
  if (!call.isKind(SyntaxKind.CallExpression)) {
    return;
  }
  const callee = call.getExpression();
  if (callee.isKind(SyntaxKind.PropertyAccessExpression)) {
    return callee.getName();
  }
  return callee.isKind(SyntaxKind.Identifier) ? callee.getText() : undefined;
}

/** A literal `null` / `undefined` value — a non-binding write (the local-user default + the un-bind). Seen
 *  through `as`/`satisfies`/parens (`null as ExternalId | null`). */
function isNullish(value: Node | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  const inner = unwrapExpression(value);
  return inner.isKind(SyntaxKind.NullKeyword) || (inner.isKind(SyntaxKind.Identifier) && inner.getText() === "undefined");
}

/** Is an `externalId`/`external_id` object-KEY (assignment or shorthand) a users-COLUMN BIND — its nearest
 *  enclosing call is a write verb AND its value is not literal null? A key in a `.select()` map / `audit()`
 *  metadata / a bare return object has no enclosing write call; `externalId: null` binds no subject. A
 *  ShorthandPropertyAssignment carries a live variable (never a null literal) so it always binds. */
export function isExternalIdWriteKey(node: Node): boolean {
  if (node.isKind(SyntaxKind.PropertyAssignment)) {
    if (!EXTERNAL_ID_KEYS.has(node.getNameNode().getText().replace(/["']/gu, "")) || isNullish(node.getInitializer())) {
      return false;
    }
  } else if (node.isKind(SyntaxKind.ShorthandPropertyAssignment)) {
    if (!EXTERNAL_ID_KEYS.has(node.getNameNode().getText())) {
      return false;
    }
  } else {
    return false;
  }
  const enclosingCall = node.getFirstAncestorByKind(SyntaxKind.CallExpression);
  return enclosingCall !== undefined && EXTERNAL_ID_WRITE_VERBS.has(externalIdCalleeName(enclosingCall) ?? "");
}

/** Is `node` an `<expr>.externalId = <value>` (or `.external_id =`) assignment of a NON-null value — the
 *  patch-building bind (`changes.externalId = …`)? `===` (an equality read) is a different token and is NOT
 *  matched; `= null` (the un-bind) is not a bind. */
export function isExternalIdAssignment(node: Node): boolean {
  if (!node.isKind(SyntaxKind.BinaryExpression) || node.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) {
    return false;
  }
  const lhs = node.getLeft();
  return lhs.isKind(SyntaxKind.PropertyAccessExpression) && EXTERNAL_ID_KEYS.has(lhs.getName()) && !isNullish(node.getRight());
}

export function isClaimWriterCall(node: Node): boolean {
  return node.isKind(SyntaxKind.CallExpression) && externalIdCalleeName(node) === CLAIM_WRITER;
}

/** The exact node/token pair to report a claim-writer call at — the callee's own name node, never the
 *  whole call (`report.node` requires the token be an exact slice of the reported node's text at its
 *  offset, and a call's text starts with its arguments' receiver for a member form). */
export function claimWriterAnchor(call: Node): { readonly node: Node; readonly token: string } {
  const callee = call.isKind(SyntaxKind.CallExpression) ? call.getExpression() : call;
  const nameNode = callee.isKind(SyntaxKind.PropertyAccessExpression) ? callee.getNameNode() : callee;
  return { node: nameNode, token: nameNode.getText() };
}

/** The exact node/token pair for one detected externalId write — the property NAME node (assignment,
 *  shorthand, or the LHS of `<x>.externalId = …`), never the whole guarded node: `report.node` requires
 *  its token be an exact slice of the reported node's OWN text, and a keyed assignment's or a patch
 *  assignment's full text does not start with the key. Returns the AUTHORED spelling
 *  (`external_id` stays `external_id`) rather than a hardcoded literal. */
export function externalIdWriteAnchor(node: Node): { readonly node: Node; readonly token: string } {
  if (node.isKind(SyntaxKind.ShorthandPropertyAssignment)) {
    return { node: node.getNameNode(), token: node.getNameNode().getText() };
  }
  if (node.isKind(SyntaxKind.PropertyAssignment)) {
    const nameNode = node.getNameNode();
    return { node: nameNode, token: nameNode.getText() };
  }
  const lhs = node.asKindOrThrow(SyntaxKind.BinaryExpression).getLeft().asKindOrThrow(SyntaxKind.PropertyAccessExpression);
  const nameNode = lhs.getNameNode();
  return { node: nameNode, token: nameNode.getText() };
}
