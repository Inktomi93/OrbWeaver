// The SSO provision decision, pure over what the caller already read (D259, spine invariant 10). The ruled
// precedence is: bind-once subject match, owner exemption, access gate, owner-flip adoption, MS-W1 collision
// deny, A1 JIT gate, owner singleton reconcile, then write. `provisionIdentity` interprets the decision; a
// batch-shaped signup statement calls the same function, so the rules have one home.

import type { ResolvedIdentity, UserRole } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";
import type { ProvisionIdentityOptions } from "../contract/params.ts";
import type { ProvisionCandidate, ProvisionDecision, ProvisionDeny, ProvisionInsert, ProvisionUpdate } from "../contract/results.ts";
import { deriveIdentityAccess, isOwnerByPolicy, isSubjectMismatch } from "./role-policy.ts";

const deny = (cause: ProvisionDeny["cause"]): ProvisionDeny => ({ kind: "deny", cause });

/** The owner singleton: a policy-matched second owner falls to `user`. A re-login of the owner row keeps it. */
function reconcileOwnerSingleton(derivedRole: UserRole, ownerId: UserId | undefined, existingId: UserId | undefined): { role: UserRole; downgraded: boolean } {
  if (derivedRole !== "owner" || ownerId === undefined || ownerId === existingId) {
    return { role: derivedRole, downgraded: false };
  }
  return { role: "user", downgraded: true };
}

function decideUpdate(existing: ProvisionCandidate, derivedRole: UserRole, ownerId: UserId | undefined): ProvisionUpdate {
  const { role, downgraded } = reconcileOwnerSingleton(derivedRole, ownerId, existing.id);
  return { kind: "update", existing, resolvedRole: role, isBootstrapOwner: false, ownerSingletonDowngrade: downgraded };
}

/** A2: a first-time non-owner row lands disabled under approval; the owner is never gated. */
function decideInsert(derivedRole: UserRole, ownerId: UserId | undefined, options: ProvisionIdentityOptions): ProvisionInsert {
  const { role: resolvedRole, downgraded } = reconcileOwnerSingleton(derivedRole, ownerId, undefined);
  return { kind: "insert", resolvedRole, enabled: resolvedRole === "owner" || options.requireApproval !== true, ownerSingletonDowngrade: downgraded };
}

/** MS-W1 and A1 for a non-owner identity. A subject-bearing identity never auto-links onto an unbound row
 *  it reached by handle, and never mints beside a row that carries its email. A brand-new identity is refused
 *  when the caller closed JIT; `undefined` `allowJitProvision` means allowed (the forward-header default). */
interface DecisionInputs {
  readonly existing: ProvisionCandidate | undefined;
  readonly identity: ResolvedIdentity;
  readonly derivedRole: UserRole;
  readonly ownerId: UserId | undefined;
  readonly options: ProvisionIdentityOptions;
}

function decideNonOwner({ existing, identity, derivedRole, ownerId, options }: DecisionInputs): ProvisionDecision {
  const subjectBearing = identity.externalId !== null;
  if (existing !== undefined) {
    return subjectBearing && existing.externalId === null ? deny("handle-collision") : decideUpdate(existing, derivedRole, ownerId);
  }
  const afterEmail = options.allowJitProvision === false ? deny("jit-closed") : decideInsert(derivedRole, ownerId, options);
  if (subjectBearing && identity.email !== null) {
    return { kind: "require-free-email", email: identity.email, otherwise: afterEmail };
  }
  return afterEmail;
}

/**
 * Decide what one SSO login may do to `users`. `existing` is the row matched by `externalId`, else by handle;
 * `ownerId` is the current owner row, if any. No I/O: the two follow-up reads are named by the decision.
 */
export function decideProvision(
  existing: ProvisionCandidate | undefined,
  identity: ResolvedIdentity,
  ownerId: UserId | undefined,
  options: ProvisionIdentityOptions,
): ProvisionDecision {
  // The handle fallback binds an unbound row and never rebinds a bound one (the impostor refusal).
  if (existing !== undefined && isSubjectMismatch(existing.externalId, identity.externalId)) {
    return deny("subject-mismatch");
  }
  // The owner exemption: matched by row identity, never by a role compare; never gated or re-derived.
  if (existing !== undefined && ownerId !== undefined && existing.id === ownerId) {
    return { kind: "update", existing, resolvedRole: existing.role, isBootstrapOwner: true, ownerSingletonDowngrade: false };
  }
  const access = deriveIdentityAccess(identity.handle, identity.groups);
  if (access.outcome === "deny") {
    return deny("access-gate");
  }
  if (!isOwnerByPolicy(identity.handle, identity.groups)) {
    return decideNonOwner({ existing, identity, derivedRole: access.role, ownerId, options });
  }
  // The owner is never blocked by MS-W1 or A1. Owner-flip adoption tries the unbound owner row first, unless
  // this subject already owns the matched row.
  const write = existing === undefined ? decideInsert(access.role, ownerId, options) : decideUpdate(existing, access.role, ownerId);
  const subject = identity.externalId;
  if (subject === null || ownerId === undefined || existing?.externalId === subject) {
    return write;
  }
  return { kind: "adopt-unbound-owner", ownerId, externalId: subject, otherwise: write };
}
