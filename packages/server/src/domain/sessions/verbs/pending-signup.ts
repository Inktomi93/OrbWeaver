// D254 — the pending OIDC join. The callback freezes a JIT-closed identity that arrived with a signup invite;
// the confirm plans its account through `decideProvision` (spine invariant 10), so this is not a second upsert.
// The plan's SQL carries only the race-relevant checks: the pending take, the invite admission, the handle-key
// and email NOT EXISTS, and the unique indexes. Everything else was decided from the rows read here.

import type { ResolvedIdentity } from "@orb/contracts/identity";
import { admitsHandle } from "@orb/kit/handle-key";
import type { ExternalId, UserId } from "@orb/kit/ids";
import { newId } from "@orb/kit/ids";
import { OIDC_PENDING_JOIN_TTL_MS } from "#infra/auth";
import type { PendingSignupPlan, ProvisionDecision, ProvisionInsert } from "../contract/results.ts";
import type { SessionsContext, SessionsService } from "../contract/service.ts";
import { sealedIdTokenOfPending, selectLivePendingSignup, takePendingSignupStatement, upsertPendingSignup } from "../persistence/pending-signups.ts";
import {
  insertPendingSignupUserStatement,
  selectForProvisionByExternalId,
  selectForProvisionByHandle,
  selectHandleKeyTaken,
  selectOwnerUserId,
} from "../persistence/users.ts";
import { decideProvision } from "../substrate/decide-provision.ts";
import { deriveIdentityAccess, isOwnerByPolicy, isReservedSignupHandle } from "../substrate/role-policy.ts";

type PendingSignupVerbs = Pick<SessionsService, "recordPendingSignup" | "readPendingSignup" | "preparePendingSignup">;

// The only decisions a join may act on: a fresh insert, directly or once the email proves free (the SQL
// repeats that check). An update, an adoption or any refusal means the identity is not a new account.
function insertOf(decision: ProvisionDecision): ProvisionInsert | null {
  if (decision.kind === "insert") {
    return decision;
  }
  if (decision.kind === "require-free-email" && decision.otherwise.kind === "insert") {
    return decision.otherwise;
  }
  return null;
}

export function createPendingSignup(ctx: SessionsContext): PendingSignupVerbs {
  async function recordPendingSignup(args: {
    readonly identity: ResolvedIdentity & { readonly externalId: ExternalId };
    readonly inviteTokenHash: string;
    readonly idToken: string | null;
  }): Promise<string> {
    const secret = ctx.mintPendingSecret();
    const secretHash = ctx.hashPendingSecret(secret);
    const at = ctx.now();
    const { identity } = args;
    await upsertPendingSignup(ctx.db, {
      subject: identity.externalId,
      secretHash,
      handle: identity.handle,
      email: identity.email,
      groups: identity.groups,
      inviteTokenHash: args.inviteTokenHash,
      idToken: args.idToken !== null && args.idToken.length > 0 ? ctx.sealPendingIdToken(args.idToken, secretHash) : null,
      createdAt: at,
      expiresAt: at + OIDC_PENDING_JOIN_TTL_MS,
    });
    return secret;
  }

  async function readPendingSignup(secret: string): Promise<{ readonly inviteTokenHash: string } | null> {
    const row = await selectLivePendingSignup(ctx.db, ctx.hashPendingSecret(secret), ctx.now());
    return row === undefined ? null : { inviteTokenHash: row.inviteTokenHash };
  }

  async function preparePendingSignup(args: { readonly secret: string; readonly requireApproval: boolean }): Promise<PendingSignupPlan | null> {
    const secretHash = ctx.hashPendingSecret(args.secret);
    const at = ctx.now();
    const row = await selectLivePendingSignup(ctx.db, secretHash, at);
    if (row === undefined) {
      return null;
    }
    const identity: ResolvedIdentity & { readonly externalId: ExternalId } = {
      externalId: row.subject,
      handle: row.handle,
      email: row.email,
      groups: row.groups,
    };
    // The frozen groups decide again: a gate tightened since the callback refuses, and an owner-by-policy
    // identity never joins through an invite (the owner is seeded or adopted, never signed up).
    if (deriveIdentityAccess(identity.handle, identity.groups).outcome === "deny" || isOwnerByPolicy(identity.handle, identity.groups)) {
      return null;
    }
    // The local signup's handle rules: an invite is the one path where a stranger picks the handle, so a
    // reserved seed key, a mixed-script handle or one sharing a member's key never becomes a look-alike account.
    if (!admitsHandle(identity.handle) || isReservedSignupHandle(identity.handle) || (await selectHandleKeyTaken(ctx.db, identity.handle))) {
      return null;
    }
    const existing = (await selectForProvisionByExternalId(ctx.db, identity.externalId)) ?? (await selectForProvisionByHandle(ctx.db, identity.handle));
    const ownerId = await selectOwnerUserId(ctx.db);
    // The invite is the JIT admission for this one identity; approval stays the caller's resolved flag.
    const insert = insertOf(decideProvision(existing, identity, ownerId, { allowJitProvision: true, requireApproval: args.requireApproval }));
    if (insert === null) {
      return null;
    }
    const sealed = sealedIdTokenOfPending(row);
    const userId = newId<UserId>();
    return {
      inviteTokenHash: row.inviteTokenHash,
      userId,
      handle: identity.handle,
      enabled: insert.enabled,
      oidcIdToken: sealed === null ? null : ctx.openPendingIdToken(sealed, secretHash),
      statements: (admission) => ({
        take: takePendingSignupStatement(ctx.db, secretHash, at),
        account: insertPendingSignupUserStatement(
          ctx.db,
          {
            id: userId,
            handle: identity.handle,
            externalId: identity.externalId,
            email: identity.email,
            role: insert.resolvedRole,
            enabled: insert.enabled,
            at,
          },
          admission,
        ),
      }),
    };
  }

  return { recordPendingSignup, readPendingSignup, preparePendingSignup };
}
