// Gate: external-id-single-writer (Spine-Identity-and-Auth.md — the U1 bind-once identity invariant) —
// `users.externalId` / `external_id` is the STABLE SSO subject bound ONCE to a row; it may be WRITTEN only
// by the two sanctioned sessions verbs (provision-identity.ts — the SSO-seam upsert; link-external-id.ts —
// the admin B5 link capability). A THIRD write site is exactly the fragmented N-provisioning-paths hole
// OpenWebUI's W1 takeover rides — a future auth method that adds its own externalId linking site REDS here.
// A "write" = a BIND of a NON-NULL subject: an `externalId`/`external_id` object-KEY whose nearest enclosing
// call is a users write verb (insertUser/updateUser/set/values/onConflictDoUpdate), or an `<x>.externalId = …`
// assignment. A literal-`null` write (`externalId: null` — the local-user default in `ensure-user.ts`, and the
// operator-recovery un-bind `SET external_id = NULL`) binds no subject and is NOT the takeover vector, so it
// PASSES. Reads (`x.externalId`), the PROVISION_COLS SELECT map (no enclosing write call), and audit
// `metadata:{externalId}` (enclosing call is `audit`) are structurally excluded.
//
// TWO-SIDED (gate-hub #10) + BLINDNESS TRIPWIRE (§4.6): each sanctioned file MUST still contain a detected
// write — a sanctioned-writer file that no longer writes externalId has a dead carve-out (RED), and if
// NEITHER does, the detector went blind (RED). Guarded on a real-tree ANCHOR (the identity root schema).
import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { unwrapExpression } from "../ast-read.ts";
import type { GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const KEYS: ReadonlySet<string> = new Set(["externalId", "external_id"]);
/** The users-row write verbs: the two sessions persistence wrappers + the raw drizzle write surface. An
 *  `externalId` object-key whose nearest enclosing call is one of these is a COLUMN write; the same key in a
 *  `.select(...)` map / an `audit(...)` metadata object / a bare return object is not. */
const WRITE_VERBS: ReadonlySet<string> = new Set(["insertUser", "updateUser", "set", "values", "onConflictDoUpdate"]);

const MESSAGE =
  "a `users.externalId` write outside the two sanctioned sessions verbs (Spine-Identity-and-Auth.md U1 — the bind-once identity chokepoint). `externalId` is the STABLE SSO subject; it is WRITTEN only by domain/sessions/verbs/provision-identity.ts (the SSO-seam upsert) + link-external-id.ts (the admin B5 link). A second linking site is the fragmented-provisioning hole (OpenWebUI W1 takeover) this invariant forbids.";
const FIX =
  "route the link through the injected sessions `linkExternalId` capability (the admin path) or `provisionIdentity` — never write the externalId column directly; the bind-once guard (isSubjectMismatch) lives on those two verbs.";

const GATE_SELF = "scripts/check/gates/external-id-single-writer.ts";
/** Real-tree anchor (gate-hub #11): the identity root's own schema file, present on every real run and never
 *  materialized by a conformance mini-project unless an example does so deliberately. */
const ANCHOR = "packages/db/src/schema/users.ts";
const SESSIONS = "packages/server/src/domain/sessions/verbs/";
/** The TWO sanctioned externalId writers (Spine-Identity-and-Auth.md U1). Named individually so the stale
 *  arm can name the dead one. */
const SANCTIONED_FILES = [`${SESSIONS}provision-identity.ts`, `${SESSIONS}link-external-id.ts`] as const;
const STALE_PREFIX =
  "stale sanctioned-writer — this file no longer writes `users.externalId`, so its carve-out is dead (either the U1 detector broke, or the writer moved — ratchet down / re-point): ";

/** The simple name of a call's callee: `insertUser(…)` → "insertUser"; `db.x(…).set(…)` → "set". */
function calleeName(call: Node): string | undefined {
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
function isExternalIdWriteKey(node: Node): boolean {
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
function isExternalIdAssignment(node: Node): boolean {
  if (!node.isKind(SyntaxKind.BinaryExpression) || node.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) {
    return false;
  }
  const lhs = node.getLeft();
  return lhs.isKind(SyntaxKind.PropertyAccessExpression) && KEYS.has(lhs.getName()) && !isNullish(node.getRight());
}

/** Every externalId write node in a file — the SAME detector the visit uses, reused in finalize to confirm
 *  each sanctioned file still writes (the two-sided stale arm + blindness tripwire). */
function externalIdWrites(sf: SourceFile): Node[] {
  const out: Node[] = [];
  sf.forEachDescendant((node) => {
    if (isExternalIdWriteKey(node) || isExternalIdAssignment(node)) {
      out.push(node);
    }
  });
  return out;
}

function repoRel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

const SANCTIONED_SET: ReadonlySet<string> = new Set(SANCTIONED_FILES);

export const gate: GateDescriptor = {
  name: "external-id-single-writer",
  docRow: "Spine-Identity-and-Auth.md (U1 externalId single-writer chokepoint)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => p.startsWith("packages/server/src/"),
  kinds: [SyntaxKind.PropertyAssignment, SyntaxKind.ShorthandPropertyAssignment, SyntaxKind.BinaryExpression],
  visit: (node, sf, ctx) => {
    if (!(isExternalIdWriteKey(node) || isExternalIdAssignment(node))) {
      return;
    }
    // A sanctioned file's write is the carve-out — never reported. finalize reads the sanctioned files
    // directly (they are IN scanRoot), so no per-visit bookkeeping is needed to prove they still write.
    if (SANCTIONED_SET.has(repoRel(sf.getFilePath()))) {
      return;
    }
    ctx.report(node, { token: "externalId", offset: 0 });
  },
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, ANCHOR)) {
      return;
    }
    for (const rel of SANCTIONED_FILES) {
      const sf = ctx.project.getSourceFile(`${ctx.root}/${rel}`);
      if (sf === undefined || externalIdWrites(sf).length === 0) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${STALE_PREFIX}"${rel}" — scripts/check/gates/external-id-single-writer.ts`,
        });
      }
    }
  },
  mustFlag: [
    {
      files:
        'import { updateUser } from "../persistence/users.ts";\n' +
        "export async function link(db: D, userId: U, externalId: E): Promise<void> {\n" +
        "  await updateUser(db, userId, { externalId, updatedAt: 0 });\n" +
        "}\n",
      at: "packages/server/src/domain/sessions/verbs/second-link.ts",
      expect: { count: 1, token: "externalId" },
      why: "a THIRD externalId write site — a new linking verb calling updateUser({ externalId }) outside the two sanctioned files: the fragmented-provisioning hole U1 forbids, RED",
    },
    {
      files: "export function patch(changes: { externalId?: string }, externalId: string): void {\n  changes.externalId = externalId;\n}\n",
      at: "packages/server/src/domain/admin/verbs/rogue-link.ts",
      expect: { count: 1 },
      why: "the assignment-shape write (`changes.externalId = …`) — the patch-building form, in a non-sanctioned domain, RED",
    },
    {
      files: 'import { users } from "@orb/db";\nexport const w = (db: DB, sub: string) => db.update(users).set({ external_id: sub });\n',
      at: "packages/server/src/domain/sessions/verbs/raw-set.ts",
      expect: { count: 1 },
      why: "a RAW drizzle `.set({ external_id })` write bypassing the persistence wrappers — still a column write, RED",
    },
  ],
  mustPass: [
    {
      files:
        'import { users } from "@orb/db";\nexport const COLS = { id: users.id, externalId: users.externalId } as const;\nexport const read = (db: DB) => db.select(COLS);\n',
      at: "packages/server/src/domain/sessions/persistence/users.ts",
      why: "the PROVISION_COLS SELECT map (`externalId: users.externalId`, nearest call `.select`) — a READ column map, not a write, passes",
    },
    {
      files:
        "export async function audit(a: unknown, at: number): Promise<void> {\n  void a;\n  void at;\n}\n" +
        "export async function log(externalId: string): Promise<void> {\n" +
        '  await audit({ action: "link", metadata: { externalId, idempotent: true } }, 0);\n' +
        "}\n",
      at: "packages/server/src/domain/admin/verbs/audit-only.ts",
      why: "an audit `metadata: { externalId }` (nearest call `audit`, not a write verb) — the observed admin idempotent-audit shape, not a column write, passes",
    },
    {
      files:
        "export interface Claim {\n  readonly handle: string;\n  readonly externalId: string | null;\n}\n" +
        "export const build = (uid: string): Claim => ({ handle: uid, externalId: uid });\n",
      at: "packages/server/src/infra/auth/modes/forward-header.ts",
      why: "an identity-CLAIM construction (`{ handle, externalId }` returned, no enclosing write call) — the infra/auth ResolvedIdentity shape, not a users write, passes",
    },
    {
      files: "export const same = (a: { externalId: string | null }, b: string | null): boolean => a.externalId === b;\n",
      at: "packages/server/src/domain/sessions/substrate/role-policy.ts",
      why: "an equality READ (`a.externalId === b`, a `===` token) — the bind-once compare, not an assignment, passes",
    },
    {
      files:
        'import { insertUser } from "../persistence/users.ts";\n' +
        "export async function ensure(db: D, handle: string): Promise<void> {\n" +
        "  await insertUser(db, { handle, externalId: null, role: 'user' });\n" +
        "}\n",
      at: "packages/server/src/domain/sessions/verbs/ensure-user.ts",
      why: "the local-user default `externalId: null` (the real ensure-user shape) — binds no subject and is not the takeover vector, passes",
    },
  ],
};
