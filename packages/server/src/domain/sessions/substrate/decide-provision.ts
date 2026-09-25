// The SSO provision decision, pure over what the caller already read (D254, spine invariant 10). The ruled
// precedence is: bind-once subject match, owner exemption, owner-claim proof (D258), access gate, owner-flip adoption,
// MS-W1 collision deny, A1 JIT gate, owner singleton reconcile, then write. `provisionIdentity` interprets the
// decision; a batch-shaped signup statement calls the same function, so the rules have one home.

import type { ResolvedIdentity, UserRole } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";
import type { ProvisionIdentityOptions } from "../contract/params.ts";
import type { ProvisionCandidate, ProvisionDecision, ProvisionDeny, ProvisionInsert, ProvisionUpdate } from "../contract/results.ts";
import { identityAccess, isOwnerByPolicy, isOwnerGroupMember, isSubjectMismatch } from "./role-policy.ts";

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
  // An OWNER_GROUP member is the IdP operator's grant; an OWNER_HANDLES match needs the caller's proof.
  const claimProven = options.ownerClaimProven !== false || isOwnerGroupMember(identity.groups);
  // The owner exemption: matched by row identity, never by a role compare.
  if (existing !== undefined && ownerId !== undefined && existing.id === ownerId) {
    return decideOwnerRow(existing, identity, claimProven);
  }
  const claimsOwner = isOwnerByPolicy(identity.handle, identity.groups);
  const ownerByPolicy = claimsOwner && claimProven;
  const access = identityAccess(ownerByPolicy, identity.groups);
  if (access.outcome === "deny") {
    return deny("access-gate");
  }
  const inputs: DecisionInputs = { existing, identity, derivedRole: access.role, ownerId, options };
  if (ownerByPolicy) {
    return decideOwner(inputs);
  }
  // SECURITY: an unproven OWNER_HANDLES claimant is an ordinary identity, but it may not insert a row. On a fresh
  // box that insert would be the owner itself, and anywhere else it would hold the seed-key handle the owner claims
  // by. Do not let it fall through to the JIT insert.
  if (claimsOwner && existing === undefined) {
    return deny("owner-claim-unproven");
  }
  return decideNonOwner(inputs);
}

/** The matched row is the owner row: never gated or re-derived. Binding a subject onto the UNBOUND owner row is an
 *  owner claim, so it needs proof; the bound owner's own login and a null-subject login claim nothing. */
function decideOwnerRow(existing: ProvisionCandidate, identity: ResolvedIdentity, claimProven: boolean): ProvisionDecision {
  if (existing.externalId === null && identity.externalId !== null && !claimProven) {
    return deny("owner-claim-unproven");
  }
  return { kind: "update", existing, resolvedRole: existing.role, isBootstrapOwner: true, ownerSingletonDowngrade: false };
}

/** The proven owner is never blocked by MS-W1 or A1. Owner-flip adoption tries the unbound owner row first, unless
 *  this subject already owns the matched row. */
function decideOwner({ existing, identity, derivedRole, ownerId, options }: DecisionInputs): ProvisionDecision {
  const write = existing === undefined ? decideInsert(derivedRole, ownerId, options) : decideUpdate(existing, derivedRole, ownerId);
  const subject = identity.externalId;
  if (subject === null || ownerId === undefined || existing?.externalId === subject) {
    return write;
  }
  return { kind: "adopt-unbound-owner", ownerId, externalId: subject, otherwise: write };
}
