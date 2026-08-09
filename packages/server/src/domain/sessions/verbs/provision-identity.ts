import type { ResolvedIdentity, UserRole } from "@orb/contracts/identity";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { newId } from "@orb/kit/ids";
import { getLog, securityEvent } from "#foundation/observability";
import type { ProvisionIdentityOptions } from "../contract/params.ts";
import type { ProvisionResult } from "../contract/results.ts";
import type { SessionsContext, SessionsService } from "../contract/service.ts";
import {
  insertUser,
  selectForProvisionByExternalId,
  selectForProvisionByHandle,
  selectForProvisionById,
  selectOwnerUserId,
  updateUser,
} from "../persistence/users.ts";
import { deriveIdentityAccess, isOwnerByPolicy, isOwnerSeedHandle, reDeriveRoleOnLogin } from "../substrate/role-policy.ts";

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

// The matched-row shape, derived from the persistence query. File-local.
type ExistingUser = NonNullable<Awaited<ReturnType<typeof selectForProvisionByHandle>>>;

/** Match by the stable `externalId` first (rename-safe), then by `handle`. */
async function findExisting(ctx: SessionsContext, identity: ResolvedIdentity): Promise<ExistingUser | undefined> {
  if (identity.externalId !== null) {
    const byExternal = await selectForProvisionByExternalId(ctx.db, identity.externalId);
    if (byExternal !== undefined) {
      return byExternal;
    }
  }
  return await selectForProvisionByHandle(ctx.db, identity.handle);
}

/**
 * Whether the matched row is already BOUND to a DIFFERENT stable subject than the one logging in. Only the
 * HANDLE fallback in {@link findExisting} can produce this — an `externalId` match is equal by construction —
 * so it means "someone else's login carries this row's handle". See the refusal at the verb.
 *
 * THE GUARD'S SCOPE IS SUBJECT-BEARING LOGINS ONLY (`identity.externalId !== null`), and that is the trust
 * model, not an oversight. A NULL-subject login carries no claim that could contradict the row's binding, so
 * there is nothing to compare and it walks past this onto the handle-matched row. Who produces one:
 *   • `forward-header`, unsigned — the Authelia (`Remote-User`) and generic (`X-Forwarded-User`) arms carry no
 *     uid header AT ALL, and the custom-override arm carries none unless `FORWARD_AUTH_UID_HEADER` is set
 *     (`infra/auth/modes/forward-header.ts`). In that mode the PROXY is the identity authority — it asserted
 *     the handle behind the trusted-peer gate — so trusting the handle IS the model.
 *   • `oidc` — `identityFromClaims` yields null when `OIDC_UID_CLAIM` names a claim the IdP does not emit
 *     (`entry/http/auth-routes.ts`). The default is `sub`, which OIDC Core REQUIRES in an ID token, so a
 *     default-configured box never reaches this.
 * RESIDUAL, and it is a MISCONFIGURATION not a default: an `oidc` box whose rows were bound while the uid
 * claim worked, then pointed at a claim the IdP omits, silently loses this guard for every login — and the
 * (b) attack below (an IdP handle re-registered after a rename) then reaches the bound row. Do NOT close it by
 * widening the comparison to null: refusing a null-subject login would break `forward-header` entirely, where
 * null is the normal shape. The residual is now OPERATOR-VISIBLE instead (#34) — it stays a signal, never a
 * gate: `entry/http/auth-routes.identityFromClaims` warns `oidc_subject_claim_missing` at the config tier
 * (an oidc login arriving subject-less names the misconfigured `OIDC_UID_CLAIM`), and
 * {@link reportNullSubjectOnBoundRow} warns `sso_null_subject_on_bound_row` at the state tier (this guard
 * being inert for a login that reached a BOUND row).
 */
function isSubjectMismatch(existing: ExistingUser, identity: ResolvedIdentity): boolean {
  return identity.externalId !== null && existing.externalId !== null && existing.externalId !== identity.externalId;
}

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
  existing: ExistingUser,
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
  if (!handleIsPolicyOwned && existing.handle !== identity.handle) {
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
    getLog().info({ handle: identity.handle, externalId: identity.externalId, ...roleChange }, "user: provisioned SSO identity (updated)");
  }
  return {
    outcome: "provisioned",
    userId: existing.id,
    enabled: existing.enabled,
    role: effectiveRole,
  };
}

/** First-login INSERT (race-tolerant) + re-read by the keyed column to return the canonical row.
 *  `requireApproval` is the caller-resolved A2 flag (undefined ⇒ off). */
async function insertNew(
  ctx: SessionsContext,
  identity: ResolvedIdentity,
  resolvedRole: UserRole,
  requireApproval: boolean | undefined,
): Promise<ProvisionResult> {
  const now = ctx.now();
  // A2 — OIDC_REQUIRE_APPROVAL (caller-resolved): a first-time NON-OWNER SSO user lands disabled (awaiting
  // admin approval). The owner is never gated — a disabled owner would lock the box out of itself. This
  // reuses the `enabled` control `validate` + the SSO callback already refuse on, rather than adding a
  // `pending` role to the D17 lattice. An admin enables the row (Settings → Admin → Approvals) to grant access.
  const enabled = resolvedRole === "owner" || requireApproval !== true;
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
    // Unreachable: either our insert succeeded or a concurrent one did.
    throw new Error(`provisionIdentity: row missing after insert (handle=${identity.handle}, externalId=${identity.externalId ?? "null"})`);
  }
  getLog().info(
    { handle: identity.handle, externalId: identity.externalId, role: settled.role, enabled: settled.enabled },
    settled.enabled
      ? "user: provisioned SSO identity (created)"
      : "user: provisioned SSO identity (created, DISABLED — awaiting admin approval, OIDC_REQUIRE_APPROVAL)",
  );
  return {
    outcome: "provisioned",
    userId: settled.id,
    enabled: settled.enabled,
    role: settled.role,
  };
}

/**
 * OWNER-FLIP RECONCILIATION (#8, D17/D135). An owner-by-policy SSO identity whose stable subject did not
 * resolve to the owner row ADOPTS the existing UNBOUND owner row — the single-user/local seeded (or
 * owner-fallback-created) owner, whose `externalId` is still null — instead of minting a SECOND row that
 * `reconcileOwnerSingleton` would downgrade to `user`, stranding the owner's whole library under an
 * un-loginable row (the owner's daily dogfood pain: a mode flip → OIDC sign-in collides with the seeded
 * owner). Returns the bound `ProvisionResult`, or `null` when this login is NOT such an adoption (the caller
 * falls through to the normal write). Owner-by-policy is asked through `isOwnerByPolicy` — the role-policy
 * home — never a `role === "owner"` lattice compare. Guarded so it can never steal a bound identity or crash
 * on the UNIQUE `external_id`: it needs a subject to bind, an UNBOUND owner to bind onto, and a subject that
 * does not already live on another row (`existing` matched by externalId ⇒ normal update, not adoption).
 */
async function tryAdoptUnboundOwner(
  ctx: SessionsContext,
  identity: ResolvedIdentity,
  existing: ExistingUser | undefined,
  ownerId: UserId | undefined,
): Promise<ProvisionResult | null> {
  if (identity.externalId === null || ownerId === undefined || !isOwnerByPolicy(identity.handle, identity.groups)) {
    return null;
  }
  if (existing !== undefined && existing.externalId === identity.externalId) {
    return null;
  }
  const owner = await selectForProvisionById(ctx.db, ownerId);
  if (owner === undefined || owner.externalId !== null) {
    return null;
  }
  return await bindOwnerSubject(ctx, owner, identity, identity.externalId);
}

/** Bind an OIDC subject onto the existing UNBOUND owner row (owner-flip reconciliation, #8/D17/D135). Links
 *  the stable `externalId` (+ refreshes email) and keeps `role=owner`; the owner's HANDLE is deliberately
 *  left as seeded — it is the `OWNER_HANDLES` key the boot owner-seed and the owner-fallback both resolve on,
 *  so keeping it makes `externalId` the durable OIDC key while re-seed / mode-flip stay idempotent (no
 *  duplicate owner row, no db surgery). The caller has already guaranteed `externalId !== null`. */
async function bindOwnerSubject(ctx: SessionsContext, owner: ExistingUser, identity: ResolvedIdentity, externalId: ExternalId): Promise<ProvisionResult> {
  const patch: { externalId: ExternalId; email?: string; updatedAt: number } = { externalId, updatedAt: ctx.now() };
  if (identity.email !== null && owner.email !== identity.email) {
    patch.email = identity.email;
  }
  await updateUser(ctx.db, owner.id, patch);
  getLog().info(
    { handle: identity.handle, externalId, ownerId: owner.id },
    "user: bound OIDC subject to the existing owner row (owner-flip reconciliation, D17)",
  );
  return { outcome: "provisioned", userId: owner.id, enabled: owner.enabled, role: "owner" };
}

/** The box has exactly one owner. When the owner policy would mint a second owner, downgrade to `user`
 *  (warned) so the write never surfaces as a raw unique violation. A re-login of the same owner row keeps
 *  `owner`. */
function reconcileOwnerSingleton(derivedRole: UserRole, ownerId: UserId | undefined, existing: ExistingUser | undefined, identity: ResolvedIdentity): UserRole {
  if (derivedRole !== "owner") {
    return derivedRole;
  }
  if (ownerId === undefined || ownerId === existing?.id) {
    return "owner";
  }
  getLog().warn(
    { handle: identity.handle, externalId: identity.externalId, existingOwnerId: ownerId },
    "user: owner policy matched but an owner already exists (D17: exactly one owner) — provisioning as `user`; grant admin via setRole",
  );
  return "user";
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
function reportNullSubjectOnBoundRow(existing: ExistingUser | undefined, identity: ResolvedIdentity): void {
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
 * A1 — the JIT admission gate (caller-resolved `allowJitProvision`; for oidc that is OIDC_SIGNUP, off by
 * default). A brand-new identity (no existing row) is refused when JIT is off, so the box admits only
 * identities an admin already provisioned. The box OWNER by policy is EXEMPT — the owner is provisioned by
 * boot seed / owner-flip adoption, never a "signup", and must never be locked out. Returns the denial or
 * null to proceed. Mode-agnostic: forward-header passes `true` (the trusted proxy already gated who reaches
 * us), so this never gates it.
 */
function denyJitIfBlocked(existing: ExistingUser | undefined, identity: ResolvedIdentity, allowJitProvision: boolean | undefined): ProvisionResult | null {
  // `allowJitProvision` undefined ⇒ JIT allowed (the forward-header / non-oidc default); only an explicit
  // `false` (OIDC_SIGNUP off) blocks a brand-new non-owner identity.
  if (existing !== undefined || allowJitProvision !== false || isOwnerByPolicy(identity.handle, identity.groups)) {
    return null;
  }
  getLog().warn(
    { handle: identity.handle, externalId: identity.externalId },
    "user: SSO login denied — JIT provisioning is off (OIDC_SIGNUP) and this identity has no existing account (deny-by-default; set OIDC_SIGNUP=on to allow it)",
  );
  return { outcome: "denied" };
}

export function createProvisionIdentity(ctx: SessionsContext): Pick<SessionsService, "provisionIdentity"> {
  async function provisionIdentity(identity: ResolvedIdentity, options: ProvisionIdentityOptions = {}): Promise<ProvisionResult> {
    // Caller-resolved admission (the verb stays mode-agnostic). Both flags default OFF-of-gate when omitted
    // (forward-header seam, tests): JIT allowed, no approval — resolved inside the helpers so this function
    // stays flat.
    const existing = await findExisting(ctx, identity);
    reportNullSubjectOnBoundRow(existing, identity);
    // THE HANDLE FALLBACK BINDS, IT NEVER REBINDS. `findExisting` falls back to `handle` so an UNBOUND row
    // (the single-user/local/seeded shape) links to its SSO subject on first login. Reaching an already-BOUND
    // row that way is not a rename — it is a different identity carrying this row's handle, and letting it
    // through moved `external_id` onto the impostor's subject, handing them the row and locking the real
    // owner of it out. Reachable both ways: (a) the OWNER row, whose handle is now deliberately PINNED to the
    // `OWNER_HANDLES` key, so the takeover handle is a publicly guessable constant; (b) ANY user, through the
    // window between an IdP rename and that user's next login, during which their old username is free to
    // re-register while our row still stores it. `externalId` is the identity (Spine-Identity "Esoterica");
    // a SUBJECT-BEARING login that contradicts it is refused, fail-closed, with no row written — read
    // `isSubjectMismatch`'s scope note for which logins carry no subject and why they are trusted anyway.
    //
    // OPERATOR RECOVERY (the accepted trade, owner-ruled 2026-08-08): the ONE legitimate way to reach this
    // refusal is an IdP that genuinely RE-ISSUED a stable subject (an authentik migration/rebuild), which
    // locks that user — owner included — out of their own row. The repair is deliberately manual and
    // out-of-band, because the alternative is a silent re-key we cannot distinguish from the impostor above:
    //   sqlite> UPDATE users SET external_id = NULL WHERE handle = '<the locked-out handle>';
    // The next login then takes the BIND path (unbound row + handle match) and links the new subject. This
    // log line is the operator's tell — it names the handle and the rejected subject.
    if (existing !== undefined && isSubjectMismatch(existing, identity)) {
      getLog().warn(
        { handle: identity.handle, externalId: identity.externalId },
        "user: SSO login refused — the handle resolves to a row already bound to a DIFFERENT stable subject (impostor / handle re-registration); externalId is the identity key",
      );
      return { outcome: "denied" };
    }
    // A1 — JIT admission gate (see {@link denyJitIfBlocked}). Ordered AFTER the bind-once guard and BEFORE the
    // allowed-groups gate so the deny reasons stay ordered (impostor > signup-off > not-in-allowed-group).
    const jitDenied = denyJitIfBlocked(existing, identity, options.allowJitProvision);
    if (jitDenied !== null) {
      return jitDenied;
    }
    const ownerId = await selectOwnerUserId(ctx.db);
    // Owner exemption: the immutable bootstrap owner is matched by the existing owner row's id, never by a
    // role-literal compare. The owner is never denied by the access gate and never re-derived downward.
    if (existing !== undefined && ownerId !== undefined && existing.id === ownerId) {
      return await updateExisting(ctx, existing, identity, {
        resolvedRole: existing.role,
        isBootstrapOwner: true,
      });
    }

    // Non-owner: apply the login access gate + derive the role from IdP groups. A denied identity
    // creates/updates no row — fail-closed.
    const access = deriveIdentityAccess(identity.handle, identity.groups);
    if (access.outcome === "deny") {
      getLog().warn(
        { handle: identity.handle, externalId: identity.externalId },
        "user: SSO login denied — identity is in none of OIDC_ALLOWED_GROUPS (fail-closed access gate)",
      );
      return { outcome: "denied" };
    }
    // OWNER-FLIP RECONCILIATION (#8): bind an owner-by-policy login onto the existing unbound seeded owner row
    // rather than minting a second row the singleton downgrades to `user` (see `tryAdoptUnboundOwner`).
    const adopted = await tryAdoptUnboundOwner(ctx, identity, existing, ownerId);
    if (adopted !== null) {
      return adopted;
    }

    // Reconcile a policy-matched second owner against the singleton (downgrade to `user`) before writing.
    const resolvedRole = reconcileOwnerSingleton(access.role, ownerId, existing, identity);
    // `existing` here is never the owner row — the exemption branch above returned for that case.
    return existing !== undefined
      ? await updateExisting(ctx, existing, identity, {
          resolvedRole,
          isBootstrapOwner: false,
        })
      : await insertNew(ctx, identity, resolvedRole, options.requireApproval);
  }
  return { provisionIdentity };
}
