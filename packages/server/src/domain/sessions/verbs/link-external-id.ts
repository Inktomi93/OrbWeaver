// B5 — the admin "link SSO identity" CAPABILITY: stamp a stable external subject onto an existing user row
// so that row's first SSO login hits by `externalId` directly (no handle-guess, no orphan). This is the
// db-surgery-free migration path for a non-owner local account whose IdP username ≠ their handle (the
// MS-W1 mode-switch orphan the auth study found), and it deliberately lives HERE, not in domain/admin: it
// is the SECOND writer of a non-null `externalId` after `provisionIdentity`, and the identity spine's U1
// rule ("external identity → ONE linking site, stable-id only") forbids a second bind-once policy. So the
// bind-once guard is reused verbatim (`isSubjectMismatch`) and no `externalId` write escapes this domain.
//
// THE CAPABILITY IS A PAIR, NOT A CALL (#1707). The bind is the durable half of a PRIVILEGED admin action,
// and #1691 ruled that a privileged write and its audit row commit in ONE `db.batch` or neither does — so
// this domain hands the caller the UNEXECUTED claim (`linkExternalIdStatement`, the
// `revokeAllForUserStatement` shape) and admin orders it beside its guarded audit insert. The batch is the
// only atomic unit available and it forbids a SELECT ahead of its writes, so there is no pre-read here:
// the whole bind-once condition rides INSIDE the claim's `WHERE id = ? AND external_id IS NULL`, and the
// unique index arbitrates a subject already held elsewhere. A claim that binds nothing (zero RETURNING
// rows) or whose statement rejects is then explained AFTER the fact by `settleUnclaimedLink`, which reads
// settled durable state — the same convergence the executed verb used for its concurrent loser, now the
// ONLY refusal path. Deriving the outcome from the statement's own result rather than from a pre-read is
// what keeps the answer honest: there is no window in which the decision and the write disagree.
//
// The AUTHORIZATION (requireAdmin), the owner/agent-target refusal, and the audit are the admin verb's job
// (`domain/admin/verbs/link-sso-identity.ts`), reached through the injected SessionAdminPort — this verb
// gates nothing (RESOLUTION tier has no `can()`); it enforces only the IDENTITY invariant.

import type { AwaitableBatchStmt } from "@orb/db/kit";
import type { ExternalId, UserId } from "@orb/kit/ids";
import type { UnclaimedLinkOutcome } from "../contract/results.ts";
import type { SessionsContext, SessionsService } from "../contract/service.ts";
import { claimExternalIdIfUnbound, selectForProvisionByExternalId, selectForProvisionById } from "../persistence/users.ts";
import { isSubjectMismatch } from "../substrate/role-policy.ts";

export function createLinkExternalId(ctx: SessionsContext): Pick<SessionsService, "linkExternalIdStatement" | "settleUnclaimedLink"> {
  const linkExternalIdStatement = (userId: UserId, externalId: ExternalId, at: number): AwaitableBatchStmt<{ id: UserId }[]> =>
    claimExternalIdIfUnbound(ctx.db, userId, externalId, at);

  async function settleUnclaimedLink(userId: UserId, externalId: ExternalId, failure?: unknown): Promise<UnclaimedLinkOutcome> {
    const target = await selectForProvisionById(ctx.db, userId);
    if (target === undefined) {
      return { outcome: "not-found" };
    }
    // Idempotent: the row already carries exactly this subject — a re-link bound nothing and is a no-op
    // success (which is also why it writes no audit row: the audit is a biconditional with the WRITE).
    if (target.externalId === externalId) {
      return { outcome: "already-linked", userId };
    }
    // BIND-ONCE on the TARGET (the shared `isSubjectMismatch` predicate): a row already bound to a DIFFERENT
    // stable subject is never rebound — that would move `external_id` off the real identity, exactly the
    // takeover the SSO seam refuses.
    if (isSubjectMismatch(target.externalId, externalId)) {
      return { outcome: "target-bound" };
    }
    // The subject lives on ANOTHER row — a duplicate binding, refused by `users_external_id_unique` at the
    // database (which is what rejected the claim) and reported here with a clean reason.
    const holder = await selectForProvisionByExternalId(ctx.db, externalId);
    if (holder !== undefined && holder.id !== userId) {
      return { outcome: "subject-taken" };
    }
    if (failure !== undefined) {
      // Durable state does not explain the rejection, so it was NOT an identity refusal — preserve the real
      // database error (a broken audit insert riding the same batch reaches here).
      throw failure;
    }
    throw new Error("linkExternalId: conditional subject claim missed without a settled competing state");
  }

  return { linkExternalIdStatement, settleUnclaimedLink };
}
