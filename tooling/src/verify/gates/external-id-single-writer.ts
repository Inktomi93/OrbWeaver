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
// FAMILY: this per-node detector and `external-id-single-writer-health.ts` (the whole-population carve-out
// proof) BOTH read `verify/lib/external-id-writer.ts` — the one shared reader for the write-shape predicate,
// the two sanctioned files, and the atomic-claim-writer name (a family means a shared `lib/` reader, never a
// shared theme, gate-runtime-standardization.md). `hard`: there is no marker vocabulary here — a third
// caller is either one of the two sanctioned files or a defect, never a reviewable exemption.
// COMMENT POSTURE: comment-SAFE — pure node-kind subscription, no file text is matched.
//
// POPULATION CORRECTION (re-derived 2026-09-11, #1937): the conversion had widened this policy's population
// from the legacy `scanRoot`'s server-only reach (`packages/server/src/`, 1,493 files) to `@backend`
// (`@server` + `@db` + `@contracts`, +147 files: 42 under `packages/db/src`, 105 under
// `packages/contracts/src`) with no recorded reason. Reverted to `@server`: every sanctioned/violating shape
// this family judges is a CALL SITE against the write verbs (`insertUser`/`updateUser`/`.set`/`.values`/
// `.onConflictDoUpdate`) or the atomic claim writer, and every real caller of those lives under
// `packages/server/src/domain/**` / `infra/**` — `db` only DECLARES the `externalId` column (a schema
// definition, not a call to a write verb) and `contracts` carries wire shapes, neither of which this
// predicate's AST shapes match. Widening bought no coverage and would have let a db/contracts file "carry"
// this family's reads/writes with no real consumer having asked for it.
// LEGACY SHA: (35bf7d328^) — the conversion's parent.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import {
  claimWriterAnchor,
  EXTERNAL_ID_CLAIM_CALLERS,
  EXTERNAL_ID_SANCTIONED_FILES,
  externalIdWriteAnchor,
  isClaimWriterCall,
  isExternalIdAssignment,
  isExternalIdWriteKey,
  LINK_CAPABILITY,
  PROVISION_CAPABILITY,
} from "../lib/external-id-writer.ts";

const MESSAGE =
  "a `users.externalId` write or atomic-claim call outside the two sanctioned sessions capabilities (Spine-Identity-and-Auth.md U1 — the bind-once identity chokepoint). `externalId` is the STABLE SSO subject; it is bound only by provision-identity.ts or link-external-id.ts through its single persistence writer. A second linking site is the fragmented-provisioning hole (OpenWebUI W1 takeover) this invariant forbids.";
const FIX =
  "route the link through the injected sessions `linkExternalId` capability (the admin path) or `provisionIdentity` — never write the externalId column directly; the bind-once guard (isSubjectMismatch) lives on those two verbs.";

const SANCTIONED_SET: ReadonlySet<string> = new Set(EXTERNAL_ID_SANCTIONED_FILES);

export const gate = defineGate({
  id: "external-id-single-writer",
  family: "external-id-single-writer",
  authority: "hard",
  severity: "error",
  population: "@server",
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
        visit: (node: Node, sourceFile) => {
          const rel = ctx.relativePath(sourceFile);
          if (isClaimWriterCall(node)) {
            if (!EXTERNAL_ID_CLAIM_CALLERS.has(rel)) {
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
          const anchor = externalIdWriteAnchor(node);
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
