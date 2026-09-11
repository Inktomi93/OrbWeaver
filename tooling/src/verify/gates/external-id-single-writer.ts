// Gate: external-id-single-writer (Spine-Identity-and-Auth.md — the U1 bind-once identity invariant) —
// `users.externalId` / `external_id` is the STABLE SSO subject bound ONCE to a row; it may be WRITTEN only
// by the two sanctioned sessions capabilities (provision-identity.ts — the SSO-seam upsert;
// link-external-id.ts — the admin B5 link capability). BOTH capabilities bind through the ONE atomic writer
// (`claimExternalIdIfUnbound`) in sessions/persistence/users.ts — the claim arm admits exactly those two
// callers. A THIRD writer or caller is exactly the fragmented N-provisioning-paths hole
// OpenWebUI's W1 takeover rides — a future auth method that adds its own externalId linking site REDS here.
// A "write" = a BIND of a NON-NULL subject: an `externalId`/`external_id` object-KEY whose nearest enclosing
// call is a users write verb (insertUser/updateUser/set/values/onConflictDoUpdate), or an `<x>.externalId = …`
// assignment. A literal-`null` write (`externalId: null` — the local-user default in `ensure-user.ts`, and the
// operator-recovery un-bind `SET external_id = NULL`) binds no subject and is NOT the takeover vector, so it
// PASSES. Reads (`x.externalId`), the PROVISION_COLS SELECT map (no enclosing write call), and audit
// `metadata:{externalId}` (enclosing call is `audit`) are structurally excluded.
//
// FAMILY: this per-node detector is one half of the `external-id-single-writer` family; the whole-population
// stale-carve-out + blindness tripwire is `external-id-single-writer-health.ts` (GATE-AUTHORING.md's
// per-file-check-plus-whole-population-tripwire split). `hard`: there is no marker vocabulary here — a third
// caller is either one of the two sanctioned files or a defect, never a reviewable exemption.
// COMMENT POSTURE: comment-SAFE — pure node-kind subscription, no file text is matched.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { unwrapExpression } from "../lib/ast-read.ts";

const KEYS: ReadonlySet<string> = new Set(["externalId", "external_id"]);
/** The users-row write verbs: the two sessions persistence wrappers + the raw drizzle write surface. An
 *  `externalId` object-key whose nearest enclosing call is one of these is a COLUMN write; the same key in a
 *  `.select(...)` map / an `audit(...)` metadata object / a bare return object is not. */
const WRITE_VERBS: ReadonlySet<string> = new Set(["insertUser", "updateUser", "set", "values", "onConflictDoUpdate"]);

const MESSAGE =
  "a `users.externalId` write or atomic-claim call outside the two sanctioned sessions capabilities (Spine-Identity-and-Auth.md U1 — the bind-once identity chokepoint). `externalId` is the STABLE SSO subject; it is bound only by provision-identity.ts or link-external-id.ts through its single persistence writer. A second linking site is the fragmented-provisioning hole (OpenWebUI W1 takeover) this invariant forbids.";
const FIX =
  "route the link through the injected sessions `linkExternalId` capability (the admin path) or `provisionIdentity` — never write the externalId column directly; the bind-once guard (isSubjectMismatch) lives on those two verbs.";

const SESSIONS = "packages/server/src/domain/sessions/";
export const LINK_CAPABILITY = `${SESSIONS}verbs/link-external-id.ts`;
export const PROVISION_CAPABILITY = `${SESSIONS}verbs/provision-identity.ts`;
export const CLAIM_WRITER = "claimExternalIdIfUnbound";
/** WHO MAY CALL THE ATOMIC CLAIM: the TWO sanctioned capability VERBS this gate's own message names, and
 *  nobody else. It was LINK-only until 2026-09-05 (#1451), which forbade the consolidation U1 asks for:
 *  provision-identity could bind the column by hand (`changes.externalId = …`, its carve-out below) but not
 *  through the ONE atomic writer — so the owner-flip bind stayed a read-then-plain-UPDATE and two concurrent
 *  owner logins with different subjects both won it. Widening this set REDUCES the bind mechanisms from two
 *  to one; a THIRD caller is still the fragmentation hole (the `second-link.ts` mustFlag row). */
const CLAIM_CALLERS: ReadonlySet<string> = new Set([LINK_CAPABILITY, PROVISION_CAPABILITY]);
/** The TWO physical externalId writers serving the sanctioned capabilities (Spine-Identity-and-Auth.md U1).
 *  Shared with `external-id-single-writer-health.ts` by VALUE (not import — see that file's header for why a
 *  sibling family member keeps its own copy of this tiny, stable table rather than a new shared-lib home). */
export const SANCTIONED_FILES = [`${SESSIONS}verbs/provision-identity.ts`, `${SESSIONS}persistence/users.ts`] as const;

/** The simple name of a call's callee: `insertUser(…)` → "insertUser"; `db.x(…).set(…)` → "set". */
export function calleeName(call: Node): string | undefined {
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
    if (!KEYS.has(node.getNameNode().getText().replace(/["']/gu, "")) || isNullish(node.getInitializer())) {
      return false;
    }
  } else if (node.isKind(SyntaxKind.ShorthandPropertyAssignment)) {
    if (!KEYS.has(node.getNameNode().getText())) {
      return false;
    }
  } else {
    return false;
  }
  const enclosingCall = node.getFirstAncestorByKind(SyntaxKind.CallExpression);
  return enclosingCall !== undefined && WRITE_VERBS.has(calleeName(enclosingCall) ?? "");
}

/** Is `node` an `<expr>.externalId = <value>` (or `.external_id =`) assignment of a NON-null value — the
 *  patch-building bind (`changes.externalId = …`)? `===` (an equality read) is a different token and is NOT
 *  matched; `= null` (the un-bind) is not a bind. */
export function isExternalIdAssignment(node: Node): boolean {
  if (!node.isKind(SyntaxKind.BinaryExpression) || node.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) {
    return false;
  }
  const lhs = node.getLeft();
  return lhs.isKind(SyntaxKind.PropertyAccessExpression) && KEYS.has(lhs.getName()) && !isNullish(node.getRight());
}

export function isClaimWriterCall(node: Node): boolean {
  return node.isKind(SyntaxKind.CallExpression) && calleeName(node) === CLAIM_WRITER;
}

/** The exact node/token pair to report a claim-writer call at — the callee's own name node, never the
 *  whole call (`report.node` requires the token be an exact slice of the reported node's text at its
 *  offset, and a call's text starts with its arguments' receiver for a member form). */
function claimWriterAnchor(call: Node): { readonly node: Node; readonly token: string } {
  const callee = call.isKind(SyntaxKind.CallExpression) ? call.getExpression() : call;
  const nameNode = callee.isKind(SyntaxKind.PropertyAccessExpression) ? callee.getNameNode() : callee;
  return { node: nameNode, token: nameNode.getText() };
}

/** The exact node/token pair for one detected externalId write — the property NAME node (assignment,
 *  shorthand, or the LHS of `<x>.externalId = …`), never the whole guarded node: `report.node` requires
 *  its token be an exact slice of the reported node's OWN text, and a keyed assignment's or a patch
 *  assignment's full text does not start with the key. Returns the AUTHORED spelling
 *  (`external_id` stays `external_id`) rather than a hardcoded literal. */
function writeAnchor(node: Node): { readonly node: Node; readonly token: string } {
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

const SANCTIONED_SET: ReadonlySet<string> = new Set(SANCTIONED_FILES);

export const gate = defineGate({
  id: "external-id-single-writer",
  family: "external-id-single-writer",
  authority: "hard",
  severity: "error",
  population: "@backend",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.PropertyAssignment, SyntaxKind.ShorthandPropertyAssignment, SyntaxKind.BinaryExpression, SyntaxKind.CallExpression],
        visit: (node, sourceFile) => {
          const rel = ctx.relativePath(sourceFile);
          if (isClaimWriterCall(node)) {
            if (!CLAIM_CALLERS.has(rel)) {
              const anchor = claimWriterAnchor(node);
              ctx.report.node(anchor.node, { token: anchor.token, offset: 0 });
            }
            return;
          }
          if (!(isExternalIdWriteKey(node) || isExternalIdAssignment(node))) {
            return;
          }
          // A sanctioned file's write is the carve-out — never reported. The health sibling re-derives the
          // same predicate over the whole population to prove each sanctioned file still earns its carve-out.
          if (SANCTIONED_SET.has(rel)) {
            return;
          }
          const anchor = writeAnchor(node);
          ctx.report.node(anchor.node, { token: anchor.token, offset: 0 });
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/server/src/domain/sessions/verbs/second-link.ts":
          'import { updateUser } from "../persistence/users.ts";\n' +
          "export async function link(db: D, userId: U, externalId: E): Promise<void> {\n" +
          "  await updateUser(db, userId, { externalId, updatedAt: 0 });\n" +
          "}\n",
      },
      expect: { count: 1, token: "externalId" },
      why: "a THIRD externalId write site — a new linking verb calling updateUser({ externalId }) outside the two sanctioned files: the fragmented-provisioning hole U1 forbids, RED",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/sessions/verbs/second-link.ts":
          'import { claimExternalIdIfUnbound } from "../persistence/users.ts";\n' +
          "export async function secondLink(db: D, userId: U, externalId: E): Promise<void> {\n" +
          "  await claimExternalIdIfUnbound(db, userId, externalId, 0);\n" +
          "}\n",
      },
      expect: { count: 1, token: "claimExternalIdIfUnbound" },
      why: "a THIRD capability calling the atomic persistence writer — indirect fragmentation is the same takeover surface, RED",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/admin/verbs/rogue-link.ts":
          "export function patch(changes: { externalId?: string }, externalId: string): void {\n  changes.externalId = externalId;\n}\n",
      },
      expect: { count: 1 },
      why: "the assignment-shape write (`changes.externalId = …`) — the patch-building form, in a non-sanctioned domain, RED",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/sessions/verbs/raw-set.ts":
          'import { users } from "@orb/db";\nexport const w = (db: DB, sub: string) => db.update(users).set({ external_id: sub });\n',
      },
      expect: { count: 1 },
      why: "a RAW drizzle `.set({ external_id })` write bypassing the persistence wrappers — still a column write, RED",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        [LINK_CAPABILITY]:
          'import { claimExternalIdIfUnbound } from "../persistence/users.ts";\n' +
          "export async function linkExternalId(db: D, userId: U, externalId: E): Promise<void> {\n" +
          "  await claimExternalIdIfUnbound(db, userId, externalId, 0);\n" +
          "}\n",
      },
      why: "the sanctioned admin capability calling its exact persistence writer, passes",
    },
    {
      mode: "source",
      files: {
        [PROVISION_CAPABILITY]:
          'import { claimExternalIdIfUnbound } from "../persistence/users.ts";\n' +
          "export async function bindOwnerSubject(db: D, ownerId: U, externalId: E): Promise<boolean> {\n" +
          "  return await claimExternalIdIfUnbound(db, ownerId, externalId, 0);\n" +
          "}\n",
      },
      why: "the SSO-seam upsert binding the owner-flip subject through the SAME atomic writer (#1451) — the second sanctioned capability, not a third mechanism: it REPLACED a read-then-plain-UPDATE, so the bind count went 2 → 1, passes",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/sessions/persistence/users.ts":
          'import { users } from "@orb/db";\nexport const COLS = { id: users.id, externalId: users.externalId } as const;\nexport const read = (db: DB) => db.select(COLS);\n',
      },
      why: "the PROVISION_COLS SELECT map (`externalId: users.externalId`, nearest call `.select`) — a READ column map, not a write, passes",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/admin/verbs/audit-only.ts":
          "export async function audit(a: unknown, at: number): Promise<void> {\n  void a;\n  void at;\n}\n" +
          "export async function log(externalId: string): Promise<void> {\n" +
          '  await audit({ action: "link", metadata: { externalId, idempotent: true } }, 0);\n' +
          "}\n",
      },
      why: "an audit `metadata: { externalId }` (nearest call `audit`, not a write verb) — the observed admin idempotent-audit shape, not a column write, passes",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/infra/auth/modes/forward-header.ts":
          "export interface Claim {\n  readonly handle: string;\n  readonly externalId: string | null;\n}\n" +
          "export const build = (uid: string): Claim => ({ handle: uid, externalId: uid });\n",
      },
      why: "an identity-CLAIM construction (`{ handle, externalId }` returned, no enclosing write call) — the infra/auth ResolvedIdentity shape, not a users write, passes",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/sessions/substrate/role-policy.ts":
          "export const same = (a: { externalId: string | null }, b: string | null): boolean => a.externalId === b;\n",
      },
      why: "an equality READ (`a.externalId === b`, a `===` token) — the bind-once compare, not an assignment, passes",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/sessions/verbs/ensure-user.ts":
          'import { insertUser } from "../persistence/users.ts";\n' +
          "export async function ensure(db: D, handle: string): Promise<void> {\n" +
          "  await insertUser(db, { handle, externalId: null, role: 'user' });\n" +
          "}\n",
      },
      why: "the local-user default `externalId: null` (the real ensure-user shape) — binds no subject and is not the takeover vector, passes",
    },
  ],
});
