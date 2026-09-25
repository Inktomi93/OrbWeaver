import type { ResolvedIdentity, UserRole } from "@orb/contracts/identity";
import { admitsHandle } from "@orb/kit/handle-key";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { newId } from "@orb/kit/ids";
import { getLog, groupsLogFields, securityEvent } from "#foundation/observability";
import type { ProvisionIdentityOptions } from "../contract/params.ts";
import type { ProvisionCandidate, ProvisionDecision, ProvisionDenyCause, ProvisionInsert, ProvisionResult, ProvisionUpdate } from "../contract/results.ts";
import type { SessionsContext, SessionsService } from "../contract/service.ts";
import {
  claimExternalIdIfUnbound,
  insertUser,
  selectForProvisionByExternalId,
  selectForProvisionByHandle,
  selectForProvisionById,
  selectIdByHandleKey,
  selectOwnerUserId,
  selectUserIdByEmail,
  updateUser,
} from "../persistence/users.ts";
import { decideProvision } from "../substrate/decide-provision.ts";
import { isOwnerSeedHandle, reDeriveRoleOnLogin } from "../substrate/role-policy.ts";

// The SSO seam upsert. Keys on the stable `externalId` first (a username rename updates `handle` on the
// same row), falling back to `handle` — a fallback that may BIND an unbound row and may NEVER REBIND a bound
// one (`isSubjectMismatch`, the impostor refusal). The access-gate policy gates login and derives the role. A
// denied identity returns `{outcome:"denied"}` — no row is created or updated. `role` is seeded on insert;
// on update it re-derives when group governance is active — except the owner, whose role is never
// re-derived, whose HANDLE is never renamed off the `OWNER_HANDLES` seed key (see `updateExisting`), and who
// is never denied. `email` refreshes from the claim when carried (keep-on-null);
// `enabled` is never reset on update. Race-tolerant insert + re-read absorbs a concurrent first-login loser.
//
// OWNER-FLIP RECONCILIATION (#8): an owner-by-policy OIDC login whose subject/handle does NOT resolve to the
// existing seeded (single-user/local) owner row binds ONTO that row (`bindOwnerSubject`) rather than minting
// a second row the singleton then downgrades to `user`. This is what lets the owner flip single-user → OIDC
// without db surgery; see the guarded branch below for the exact adoptability conditions.

/** Match by the stable `externalId` first (rename-safe), then by `handle`. */
async function findExisting(ctx: SessionsContext, identity: ResolvedIdentity): Promise<ProvisionCandidate | undefined> {
  if (identity.externalId !== null) {
    const byExternal = await selectForProvisionByExternalId(ctx.db, identity.externalId);
    if (byExternal !== undefined) {
      return byExternal;
    }
  }
  return await selectForProvisionByHandle(ctx.db, identity.handle);
}

// THE bind-once mismatch predicate moved to `substrate/role-policy.ts` (`isSubjectMismatch`) so the admin
// link capability can share the ONE rule without a verb→verb import (Spine-Identity-and-Auth.md invariant
// #10 — every external-identity mode routes through THIS verb). Only the HANDLE fallback in
// `findExisting` can reach it here — an `externalId` match is equal by construction — so a mismatch means
// "someone else's login carries this row's handle" (the impostor refusal at the verb below).
//
// THE GUARD'S SCOPE IS SUBJECT-BEARING LOGINS ONLY (`identity.externalId !== null`), and that is the trust
// model, not an oversight. A NULL-subject login carries no claim that could contradict the row's binding, so
// there is nothing to compare and it walks past onto the handle-matched row. Who produces one:
//   • `forward-header`, unsigned — the Authelia (`Remote-User`) and generic (`X-Forwarded-User`) arms carry no
//     uid header AT ALL, and the custom-override arm carries none unless `FORWARD_AUTH_UID_HEADER` is set. In
//     that mode the PROXY is the identity authority (it asserted the handle behind the trusted-peer gate). This
//     is the case the verb must stay OPEN for — refusing a null subject here would break forward-header, where
//     null is the normal shape.
//   • `oidc` — `identityFromClaims` yields a null EXTERNALID when `OIDC_UID_CLAIM` names a claim the IdP does
//     not emit. The default `sub` is REQUIRED by OIDC Core, so a default-configured box never reaches this.
// RESIDUAL, oidc half — CLOSED UPSTREAM 2026-08-25 (#699). "The ruling survives; its INPUT changed": this verb
// still must NOT widen its guard to null (forward-header depends on that), so the fix lives one tier UP where
// the mode IS known — the OIDC callback (`entry/http/auth-routes.ts`) now refuses a login whose `externalId`
// is null, fail-closed, in oidc mode only. So a misconfigured `oidc` box (`OIDC_UID_CLAIM` repointed at a claim
// the IdP omits) can no longer reach this verb with a null subject at all; forward-header still can, and still
// should. The two observability tells remain the operator's diagnosis either way (#34): `identityFromClaims`
// warns `oidc_subject_claim_missing`, and {@link reportNullSubjectOnBoundRow} warns `sso_null_subject_on_bound_row`
// when a null-subject login (now: forward-header only) reaches a BOUND row.

/**
 * Refresh `handle`/`externalId`/`email`; re-derive `role` only when the row is not the bootstrap owner and
 * the re-derive policy is on; never touch `enabled`. Update only when something actually changed.
 *
 * `isBootstrapOwner` is ONE fact with TWO consequences, deliberately not two independent flags: the
 * immutable bootstrap owner's `role` AND its `handle` are POLICY-owned, so a login re-derives neither. (The
 * caller decides it by row IDENTITY — `existing.id === ownerId` — never by a role-literal compare.)
 */
async function updateExisting(
  ctx: SessionsContext,
  existing: ProvisionCandidate,
  identity: ResolvedIdentity,
  policy: { resolvedRole: UserRole; isBootstrapOwner: boolean },
): Promise<ProvisionResult> {
  const changes: { handle?: Handle; externalId?: ExternalId; email?: string; role?: UserRole } = {};
  if (identity.externalId !== null && existing.externalId !== identity.externalId) {
    changes.externalId = identity.externalId;
  }
  // THE OWNER'S HANDLE IS THE RE-SEED KEY, NOT AN IdP-TRACKED ATTRIBUTE (#8 cascade, D17/D135). The owner
  // row's durable SSO key is `externalId`; its HANDLE is what boot's `seedOwner` → `ensureUser` and the auth
  // seam's owner fallback resolve the owner ROW through (`isOwnerSeedHandle`). Renaming it to the IdP handle
  // — which the owner-exemption branch did on every login AFTER the adoption bound the subject — strands both:
  // the next boot finds no row at the seed key, its `insertUser(role:"owner")` collides with
  // `users_single_owner_unique`, `onConflictDoNothing` swallows it, and the whole owner-scoped boot seed runs
  // under an id that names no row. Scoped to the SEED KEY on purpose, so it is a stability guard and not a
  // freeze: an operator who MOVES `OWNER_HANDLES` is migrating the key, and BOOT — not this login — performs
  // that migration (`entry/boot/seed-owner.ts` `adoptMovedSeedKey` renames the owner row onto the new key
  // before anything resolves by handle, refusing loudly if another user already holds it). This guard then
  // stops pinning the OLD key, because it no longer IS one. (Until 2026-08-08 the migration was claimed here
  // and implemented nowhere: the restart after the env edit died in `ensureUser` on that same single-owner
  // UNIQUE, so no login ever ran to do the rename.) Every other row keeps full IdP rename tracking
  // (`externalId` keys SSO, `handle` keys everything else — Spine-Identity "Esoterica").
  const handleIsPolicyOwned = policy.isBootstrapOwner && isOwnerSeedHandle(existing.handle);
  if (!handleIsPolicyOwned && existing.handle !== identity.handle && (await renameIsFree(ctx, existing, identity))) {
    changes.handle = identity.handle;
  }
  if (identity.email !== null && existing.email !== identity.email) {
    changes.email = identity.email;
  }
  let effectiveRole = existing.role;
  if (!policy.isBootstrapOwner && reDeriveRoleOnLogin() && policy.resolvedRole !== existing.role) {
    changes.role = policy.resolvedRole;
    effectiveRole = policy.resolvedRole;
  }
  if (Object.keys(changes).length > 0) {
    await updateUser(ctx.db, existing.id, { ...changes, updatedAt: ctx.now() });
    const roleChange = changes.role !== undefined ? { roleChanged: { from: existing.role, to: changes.role } } : {};
    // #140 — the login's GROUPS ride every provisioning line: they are what `deriveIdentityAccess` decided
    // the role from, so a `roleChanged` with no groups beside it is an un-auditable demotion. Bounded NAMES
    // only (`groupsLogFields`); the claim object and the token are never logged.
    getLog().info(
      { handle: identity.handle, externalId: identity.externalId, ...groupsLogFields(identity.groups), ...roleChange },
      "user: provisioned SSO identity (updated)",
    );
  }
  return {
    outcome: "provisioned",
    userId: existing.id,
    enabled: existing.enabled,
    role: effectiveRole,
    // W7b — the ONE upsert arm that can move a field `sessions.me` projects. `handle` and `role` are exactly
    // those fields; `externalId`/`email` are not (no identity read carries them), which is why they are
    // excluded here rather than "did anything change at all". The caller fans `identityChanged` on this
    // user's channel, reaching the human's OTHER live devices — the IdP-rename case, and the login-time role
    // DEMOTION that is the security-relevant half.
    identityChanged: changes.handle !== undefined || changes.role !== undefined,
  };
}

/** D257 — an IdP rename may not take another row's handle key or a mixed-script handle: the user keeps
 *  their current handle, and the login proceeds. A concurrent rename onto the same key still meets
 *  `users_handle_key_unique`. */
async function renameIsFree(ctx: SessionsContext, existing: ProvisionCandidate, identity: ResolvedIdentity): Promise<boolean> {
  if (!admitsHandle(identity.handle)) {
    securityEvent(
      "sso_rename_to_inadmissible_handle",
      { userId: existing.id, handle: existing.handle, requested: identity.handle },
      "security: an IdP rename asked for a mixed-script handle; keeping the current handle",
    );
    return false;
  }
  const holder = await selectIdByHandleKey(ctx.db, identity.handle);
  if (holder === undefined || holder === existing.id) {
    return true;
  }
  securityEvent(
    "sso_rename_onto_held_handle_key",
    { userId: existing.id, handle: existing.handle, requested: identity.handle, holder },
    "security: an IdP rename asked for a handle that shares its key (a case variant or look-alike) with another user's; keeping the current handle",
  );
  return false;
}

// The operator's next step for each lost-race match. Only an exact handle match is this identity's account.
const LOST_RACE_ADVICE: Readonly<Record<"exact" | "key-only" | "none", string>> = {
  exact: "the winner holds this exact handle; an admin links it via admin.linkSsoIdentity",
  "key-only": "the winner holds a look-alike of this handle (one handle key, D257), a different account; do not link it",
  none: "the owner singleton or another unique column absorbed it",
};

/**
 * THE INSERT LOST A RACE and no row carries this identity — REACHABLE, and the comment that used to sit
 * here calling it "Unreachable" was the defect (#1478): it threw a raw Error, i.e. a 500 on the login path.
 * `insertUser` is a bare `onConflictDoNothing()`, so a concurrent writer that took this HANDLE
 * (`users_handle_unique`) — or the owner singleton (`users_single_owner_unique`) — silently no-ops our
 * insert, and the re-read keys on the column WE own (`externalId`), which that winner does not carry. Only
 * the SAME-SUBJECT race (the shape the race-tolerant insert exists to absorb) re-reads successfully.
 *
 * REFUSED, never resolved by ADOPTION. Returning the winner's row would be exactly the auto-link-by-handle
 * account takeover the MS-W1 `handle-collision` refusal hard-denies on the sequential path (MS-W1) — this is the same
 * collision arriving through the race window, so it gets the same operator-actionable `account-exists`
 * deny. No row is created or updated. The extra reads are diagnosis only and decide nothing: `match` separates
 * an EXACT handle collision (the same account under a new subject, which an admin may link via
 * `admin.linkSsoIdentity`, B5) from a KEY-ONLY one (D257: a different account that merely looks alike, which
 * must never be linked) and from the owner singleton.
 */
async function lostRaceMatch(ctx: SessionsContext, handle: Handle): Promise<keyof typeof LOST_RACE_ADVICE> {
  if ((await selectForProvisionByHandle(ctx.db, handle)) !== undefined) {
    return "exact";
  }
  return (await selectIdByHandleKey(ctx.db, handle)) === undefined ? "none" : "key-only";
}

async function refuseLostInsertRace(ctx: SessionsContext, identity: ResolvedIdentity): Promise<ProvisionResult> {
  const match = await lostRaceMatch(ctx, identity.handle);
  securityEvent(
    "sso_insert_lost_race",
    { handle: identity.handle, externalId: identity.externalId, match },
    `security: SSO first-login INSERT was absorbed by a concurrent writer that does NOT carry this stable subject — refusing the login rather than adopting the winning row; ${LOST_RACE_ADVICE[match]}`,
  );
  return { outcome: "denied", reason: "account-exists" };
}

/** First-login INSERT (race-tolerant) + re-read by the keyed column to return the canonical row. `enabled`
 *  is the decided A2 verdict (OIDC_REQUIRE_APPROVAL lands a first-time non-owner row disabled, awaiting an
 *  admin; the owner is never gated). It reuses the `enabled` control `validate` and the SSO callback refuse on,
 *  rather than a `pending` role in the D17 lattice. */
async function insertNew(ctx: SessionsContext, identity: ResolvedIdentity, resolvedRole: UserRole, enabled: boolean): Promise<ProvisionResult> {
  // D257: a new account never takes a mixed-script handle, which can spell a look-alike the key misses.
  if (!admitsHandle(identity.handle)) {
    securityEvent(
      "sso_insert_inadmissible_handle",
      { handle: identity.handle, externalId: identity.externalId },
      "security: SSO first login refused — the IdP handle mixes scripts (D257); no account was created",
    );
    return { outcome: "denied" };
  }
  const now = ctx.now();
  await insertUser(ctx.db, {
    id: newId<UserId>(),
    handle: identity.handle,
    externalId: identity.externalId,
    email: identity.email,
    role: resolvedRole,
    enabled,
    createdAt: now,
    updatedAt: now,
  });
  const settled =
    identity.externalId !== null
      ? await selectForProvisionByExternalId(ctx.db, identity.externalId)
      : await selectForProvisionByHandle(ctx.db, identity.handle);
  if (settled === undefined) {
    return await refuseLostInsertRace(ctx, identity);
  }
  // #2481 — the new account's local-light vector floor, AFTER the row has settled (§5.3b). Below the two
  // refusal paths on purpose: a DENIED login and a lost insert race have no row of their own to seed.
  await ctx.seedUserConnections(settled.id);
  getLog().info(
    { handle: identity.handle, externalId: identity.externalId, ...groupsLogFields(identity.groups), role: settled.role, enabled: settled.enabled },
    settled.enabled
      ? "user: provisioned SSO identity (created)"
      : "user: provisioned SSO identity (created, DISABLED — awaiting admin approval, OIDC_REQUIRE_APPROVAL)",
  );
  return {
    outcome: "provisioned",
    userId: settled.id,
    enabled: settled.enabled,
    role: settled.role,
    // A row that did not exist a moment ago has no other device holding a stale read of it (W7b).
    identityChanged: false,
  };
}

/**
 * OWNER-FLIP RECONCILIATION (#8, D17/D135). An owner-by-policy SSO identity whose stable subject did not
 * resolve to the owner row ADOPTS the existing UNBOUND owner row — the single-user/local seeded (or
 * owner-fallback-created) owner, whose `externalId` is still null — instead of minting a SECOND row the
 * singleton would downgrade to `user`, stranding the owner's whole library under an un-loginable row.
 * `decideProvision` names the attempt (`adopt-unbound-owner`); this runs its one read. Returns `null` when the
 * owner row is gone or already bound, and the caller then runs the decision's `otherwise` step.
 */
async function tryAdoptUnboundOwner(
  ctx: SessionsContext,
  identity: ResolvedIdentity,
  decision: Extract<ProvisionDecision, { kind: "adopt-unbound-owner" }>,
): Promise<ProvisionResult | null> {
  const owner = await selectForProvisionById(ctx.db, decision.ownerId);
  if (owner === undefined || owner.externalId !== null) {
    return null;
  }
  return await bindOwnerSubject(ctx, owner, identity, decision.externalId);
}

/**
 * THE OWNER BIND LOST THE CLAIM — the adoption's read said UNBOUND, and by the time our statement acquired
 * the write lock another login had bound the row. Classified against the SETTLED row, never against our own
 * stale read:
 *   • the row now carries OUR subject ⇒ the SAME-SUBJECT race (the owner's own second login, or a retry),
 *     which is idempotent: report the settled row exactly as the winner did. This is the shape the
 *     race-tolerant insert absorbs one function up, applied to the bind.
 *   • the row carries a DIFFERENT subject ⇒ two owner-by-policy logins with different subjects raced for the
 *     one unbound owner row. Exactly one may hold it (`external_id` is UNIQUE and the owner is a singleton),
 *     and the loser gets the same operator-actionable `account-exists` deny the sequential collision returns
 *     — NEVER an adoption of the winner's row, which would be the auto-link takeover the MS-W1 refusal
 *     hard-denies arriving through the race window instead of the front door.
 * The security line names both subjects, because "which login lost the owner row" is the whole diagnosis.
 */
async function refuseLostOwnerBind(
  ctx: SessionsContext,
  owner: ProvisionCandidate,
  identity: ResolvedIdentity,
  externalId: ExternalId,
): Promise<ProvisionResult> {
  const settled = await selectForProvisionById(ctx.db, owner.id);
  if (settled !== undefined && settled.externalId === externalId) {
    return { outcome: "provisioned", userId: settled.id, enabled: settled.enabled, role: settled.role, identityChanged: false };
  }
  securityEvent(
    "sso_owner_bind_lost_race",
    { handle: identity.handle, externalId, ownerId: owner.id, boundTo: settled?.externalId ?? null },
    "security: two owner-by-policy logins raced to bind the UNBOUND owner row and this one lost the claim — refusing the login rather than rebinding the row onto this subject; an admin links it via admin.linkSsoIdentity",
  );
  return { outcome: "denied", reason: "account-exists" };
}

/** Bind an OIDC subject onto the existing UNBOUND owner row (owner-flip reconciliation, #8/D17/D135). Links
 *  the stable `externalId` (+ refreshes email) and keeps `role=owner`; the owner's HANDLE is deliberately
 *  left as seeded — it is the `OWNER_HANDLES` key the boot owner-seed and the owner-fallback both resolve on,
 *  so keeping it makes `externalId` the durable OIDC key while re-seed / mode-flip stay idempotent (no
 *  duplicate owner row, no db surgery). The caller has already guaranteed `externalId !== null`.
 *
 *  THE BIND IS A COMPARE-AND-SWAP, not a plain UPDATE (#1451). The adoptability read in
 *  {@link tryAdoptUnboundOwner} (`owner.externalId !== null` ⇒ bail) is a READ, and a read cannot hold a row
 *  unbound: two concurrent owner-policy logins carrying DIFFERENT subjects both passed it, and a bare
 *  `updateUser` let the second one overwrite `external_id` — the owner row silently changed hands, both
 *  callers were provisioned as owner, and the loser of that write was locked out of a box it had just been
 *  told it owned. `claimExternalIdIfUnbound` moves the unbound test INTO the statement
 *  (`UPDATE … WHERE external_id IS NULL`) so the database arbitrates; it is the same primitive the admin
 *  link capability (B5 `linkExternalId`) claims through, which is the point — ONE bind-once mechanism.
 *  The email refresh is a SEPARATE, non-security write that follows a WON claim: it must never be the thing
 *  that carries the binding, and a claim that lost writes nothing at all. */
async function bindOwnerSubject(ctx: SessionsContext, owner: ProvisionCandidate, identity: ResolvedIdentity, externalId: ExternalId): Promise<ProvisionResult> {
  // EMPTY rows = this login did not win the claim (another owner-policy login bound the row first).
  const claimed = await claimExternalIdIfUnbound(ctx.db, owner.id, externalId, ctx.now());
  if (claimed.length === 0) {
    return await refuseLostOwnerBind(ctx, owner, identity, externalId);
  }
  if (identity.email !== null && owner.email !== identity.email) {
    await updateUser(ctx.db, owner.id, { email: identity.email, updatedAt: ctx.now() });
  }
  getLog().info(
    { handle: identity.handle, externalId, ...groupsLogFields(identity.groups), ownerId: owner.id },
    "user: bound OIDC subject to the existing owner row (owner-flip reconciliation, D17)",
  );
  // W7b: the bind writes `externalId` (+ maybe `email`) and deliberately leaves the owner's handle and role
  // alone — no identity read projects either column, so there is nothing for another device to re-read.
  return { outcome: "provisioned", userId: owner.id, enabled: owner.enabled, role: "owner", identityChanged: false };
}

/** The owner singleton downgrade (D17: exactly one owner) is decided pure; the warn names the kept owner. */
function reportOwnerSingletonDowngrade(identity: ResolvedIdentity, ownerId: UserId | undefined): void {
  getLog().warn(
    { handle: identity.handle, externalId: identity.externalId, ...groupsLogFields(identity.groups), existingOwnerId: ownerId },
    "user: owner policy matched but an owner already exists (D17: exactly one owner) — provisioning as `user`; grant admin via setRole",
  );
}

/**
 * #34 — THE STATE HALF of the null-subject signal (the CONFIG half is the OIDC claim mapper's
 * `oidc_subject_claim_missing` warn in `entry/http/auth-routes.ts`). Fires when a login carrying NO stable
 * subject has resolved BY HANDLE onto a row that IS bound to one: {@link isSubjectMismatch} is structurally
 * unable to speak about this login (it needs a subject to contradict), so the bind-once takeover refusal is
 * INERT here and the handle alone is what authorizes the row — exactly the precondition the (b)
 * handle-re-registration attack rides.
 *
 * DELIBERATELY MODE-BLIND. The verb cannot see `AUTH_MODE`, and it should not: a bound row reached by a
 * subject-less login is anomalous in EVERY mode. Under `forward-header` it means the row carries a binding
 * from an earlier `oidc` era while the proxy is now the sole authority — inert guard, worth saying out loud;
 * under a misconfigured `oidc` box it is the residual `isSubjectMismatch`'s scope note names. It stays quiet
 * on the normal forward-header / single-user shape, where the handle-matched row is UNBOUND.
 *
 * OBSERVABILITY ONLY — the login proceeds byte-identically. Widening the guard to refuse null-subject logins
 * would break `forward-header`, where null is the normal shape (again, the scope note).
 */
function reportNullSubjectOnBoundRow(existing: ProvisionCandidate | undefined, identity: ResolvedIdentity): void {
  if (identity.externalId !== null || existing === undefined || existing.externalId === null) {
    return;
  }
  securityEvent(
    "sso_null_subject_on_bound_row",
    { handle: identity.handle, userId: existing.id },
    "security: a login carrying NO stable subject matched by HANDLE onto a row already bound to one — the bind-once account-takeover guard cannot evaluate this login, so the handle alone authorizes the row; expected under forward-header (the proxy is the identity authority), a MISCONFIGURATION under oidc (check OIDC_UID_CLAIM)",
  );
}

/**
 * MS-W1 — THE MODE-SWITCH COLLISION HARD-DENY (owner-ruled 2026-08-09). A SUBJECT-BEARING NON-OWNER identity
 * that is NOT already bound to a row (no `externalId` match) must NEVER be auto-linked onto — or minted beside —
 * an EXISTING account it collides with (by handle OR email). Auto-linking by the mutable email/handle IS the
 * OpenWebUI W1 takeover we refuse; silently minting a second row is the orphan/duplicate the mode-switch
 * creates. Either way → DENY with the `account-exists` reason (operator-actionable: the admin links the row
 * via `admin.linkSsoIdentity` (B5), keyed on the STABLE subject, and the user is then in).
 *
 * Two collision shapes, both reached only after the owner paths (owner-exemption + owner-flip adoption) have
 * run and returned — so this NEVER blocks the owner:
 *   • HANDLE — `existing` was reached by the handle fallback onto an UNBOUND row (`existing.externalId === null`;
 *     a bound-to-a-different-subject row was already refused by `isSubjectMismatch`). Binding here would be
 *     auto-link-by-handle.
 *   • EMAIL — no existing row matched (about to JIT-mint) but the claim's email is already on a row. Minting
 *     would create the duplicate.
 *
 * SCOPED to subject-bearing logins (`externalId !== null`): a NULL-subject login is `forward-header`, where the
 * PROXY is the identity authority — a handle-matched unbound row binds and a new handle mints as normal JIT
 * (never a collision). Owner-by-policy is exempt (provisioned by seed / owner-flip, never blocked). The
 * refusal warns with the operator's next action (link via B5) and returns the `account-exists` deny the
 * callback maps to a DISTINCT authError. No row is created or updated.
 */
function denyAccountExists(identity: ResolvedIdentity, by: "handle" | "email"): ProvisionResult {
  getLog().warn(
    { handle: identity.handle, externalId: identity.externalId, collision: by },
    "user: SSO login refused — this identity collides with an EXISTING account (mode-switch orphan guard, MS-W1); refusing to auto-link (W1 takeover) or mint a duplicate — an admin must link the row to this stable subject via admin.linkSsoIdentity (B5)",
  );
  return { outcome: "denied", reason: "account-exists" };
}

/** Each refusal's log line and result. `handle-collision` is the MS-W1 deny (`account-exists`); the rest
 *  collapse to the generic deny. Exhaustive: a new cause fails `tsc` here. */
function refuse(identity: ResolvedIdentity, cause: ProvisionDenyCause): ProvisionResult {
  switch (cause) {
    case "subject-mismatch":
      getLog().warn(
        { handle: identity.handle, externalId: identity.externalId },
        "user: SSO login refused — the handle resolves to a row already bound to a DIFFERENT stable subject (impostor / handle re-registration); externalId is the identity key",
      );
      return { outcome: "denied" };
    case "access-gate":
      // #140 — the groups the identity DID carry are the whole diagnosis here: an empty list means the claim
      // never arrived (see the mapper's `oidc_groups_claim` line), a populated one that misses the allowlist
      // means the operator's group names disagree with the IdP's.
      getLog().warn(
        { handle: identity.handle, externalId: identity.externalId, ...groupsLogFields(identity.groups) },
        "user: SSO login denied — identity is in none of OIDC_ALLOWED_GROUPS (fail-closed access gate)",
      );
      return { outcome: "denied" };
    case "handle-collision":
      return denyAccountExists(identity, "handle");
    case "jit-closed":
      getLog().warn(
        { handle: identity.handle, externalId: identity.externalId },
        "user: SSO login denied — JIT provisioning is off (OIDC_SIGNUP) and this identity has no existing account (deny-by-default; set OIDC_SIGNUP=on to allow it)",
      );
      return { outcome: "denied", reason: "jit-closed" };
    case "owner-claim-unproven":
      // The boot claim code never rides this line: the operator finds it in the boot log.
      securityEvent(
        "sso_owner_claim_unproven",
        { handle: identity.handle, externalId: identity.externalId },
        "security: an SSO login claimed the owner by an OWNER_HANDLES handle match alone — refused, nothing bound or created; the owner claims from a loopback callback, with the claim URL the boot log printed while the owner is unclaimed, or through OWNER_GROUP",
      );
      return { outcome: "denied" };
    default: {
      const exhaustive: never = cause;
      throw new Error(`provisionIdentity: unknown deny cause ${String(exhaustive)}`);
    }
  }
}

/** Run a write decision: update the matched row, or insert the new one. */
async function write(
  ctx: SessionsContext,
  identity: ResolvedIdentity,
  ownerId: UserId | undefined,
  decision: ProvisionInsert | ProvisionUpdate,
): Promise<ProvisionResult> {
  if (decision.ownerSingletonDowngrade) {
    reportOwnerSingletonDowngrade(identity, ownerId);
  }
  if (decision.kind === "update") {
    return await updateExisting(ctx, decision.existing, identity, { resolvedRole: decision.resolvedRole, isBootstrapOwner: decision.isBootstrapOwner });
  }
  return await insertNew(ctx, identity, decision.resolvedRole, decision.enabled);
}

/** Interpret a {@link decideProvision} decision, running the one read each follow-up arm names. */
async function apply(ctx: SessionsContext, identity: ResolvedIdentity, ownerId: UserId | undefined, decision: ProvisionDecision): Promise<ProvisionResult> {
  switch (decision.kind) {
    case "deny":
      return refuse(identity, decision.cause);
    case "insert":
    case "update":
      return await write(ctx, identity, ownerId, decision);
    case "adopt-unbound-owner":
      return (await tryAdoptUnboundOwner(ctx, identity, decision)) ?? (await write(ctx, identity, ownerId, decision.otherwise));
    case "bind-owner-row":
      return await bindOwnerSubject(ctx, decision.owner, identity, decision.externalId);
    case "require-free-email":
      if ((await selectUserIdByEmail(ctx.db, decision.email)) !== undefined) {
        return denyAccountExists(identity, "email");
      }
      return await apply(ctx, identity, ownerId, decision.otherwise);
    default: {
      const exhaustive: never = decision;
      throw new Error(`provisionIdentity: unknown decision ${JSON.stringify(exhaustive)}`);
    }
  }
}

export function createProvisionIdentity(ctx: SessionsContext): Pick<SessionsService, "provisionIdentity"> {
  async function provisionIdentity(identity: ResolvedIdentity, options: ProvisionIdentityOptions): Promise<ProvisionResult> {
    const existing = await findExisting(ctx, identity);
    reportNullSubjectOnBoundRow(existing, identity);
    // OPERATOR RECOVERY for the subject-mismatch refusal (the accepted trade, owner-ruled 2026-08-08): the ONE
    // legitimate way to reach it is an IdP that genuinely RE-ISSUED a stable subject (an authentik
    // migration/rebuild), which locks that user — owner included — out of their own row. The repair is
    // deliberately manual and out-of-band, because the alternative is a silent re-key we cannot distinguish
    // from an impostor:
    //   sqlite> UPDATE users SET external_id = NULL WHERE handle = '<the locked-out handle>';
    // The next login then takes the BIND path (unbound row + handle match) and links the new subject. The
    // refusal's log line is the operator's tell — it names the handle and the rejected subject.
    const ownerId = await selectOwnerUserId(ctx.db);
    return await apply(ctx, identity, ownerId, decideProvision(existing, identity, ownerId, options));
  }
  return { provisionIdentity };
}
