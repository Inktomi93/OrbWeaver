// All db access for `user_credentials` (queries only). SecretBox seal/open happens in the verbs; this slot
// stores/reads the sealed bytes. `toCredentialView` is the only projection to the wire shape — it drops
// `ciphertext`/`iv`/`tag`.

import type { CredRevokedReason, ProviderMetadata } from "@orb/contracts/credentials";
import type { ProviderId } from "@orb/contracts/inference";
import type { Db } from "@orb/db";
import { userCredentials } from "@orb/db";
import { fetchOwned } from "@orb/db/kit";
import type { UserCredentialId, UserId } from "@orb/kit/ids";
import { and, asc, eq } from "drizzle-orm";
import type { Sealed } from "#infra/crypto";
import type { CredentialView } from "../contract/views.ts";

type CredentialRow = typeof userCredentials.$inferSelect;

/** The revocation columns every un-revoke path nulls TOGETHER — a live row carrying a stale reason would tell
 *  the Connections pane a key was rejected when it currently works. Three writers spread it: the fresh insert,
 *  `replace`'s rotation (a new key voids the old rejection) and the explicit clear. */
const CLEARED_REVOCATION = { revokedAt: null, revokedReason: null } as const;

/** Owner-scoped fetch of one credential by id — `undefined` if missing/not-owned. */
export function fetchOwnedCredential(db: Db, ownerId: UserId, credentialId: UserCredentialId): Promise<CredentialRow | undefined> {
  return fetchOwned(db, userCredentials, credentialId, ownerId);
}

/** Every credential the user owns, ordered `(provider, createdAt)` for a stable list view. */
export function listOwnedCredentials(db: Db, ownerId: UserId): Promise<CredentialRow[]> {
  return db.select().from(userCredentials).where(eq(userCredentials.ownerId, ownerId)).orderBy(asc(userCredentials.provider), asc(userCredentials.createdAt));
}

/** The labels the owner already holds on this provider — `add` picks the next free one from them, so a new
 *  key never lands on an existing row. */
export async function listProviderLabels(db: Db, ownerId: UserId, provider: ProviderId): Promise<string[]> {
  const rows = await db
    .select({ label: userCredentials.label })
    .from(userCredentials)
    .where(and(eq(userCredentials.ownerId, ownerId), eq(userCredentials.provider, provider)));
  return rows.flatMap((row) => (row.label === null ? [] : [row.label]));
}

/** Rotate the sealed secret in place (preserve id; CLEAR revocation — a fresh key voids it). OWNER-SCOPED:
 *  the credentialId is caller-supplied (`replace`), so the owner is a query predicate and a foreign id
 *  matches no row. */
export function rotateSealed(
  db: Db,
  args: {
    readonly ownerId: UserId;
    readonly credentialId: UserCredentialId;
    readonly sealed: Sealed;
    readonly now: number;
  },
): Promise<unknown> {
  return db
    .update(userCredentials)
    .set({
      ciphertext: args.sealed.ciphertext,
      iv: args.sealed.iv,
      tag: args.sealed.tag,
      ...CLEARED_REVOCATION,
      updatedAt: args.now,
    })
    .where(and(eq(userCredentials.id, args.credentialId), eq(userCredentials.ownerId, args.ownerId)));
}

/** Insert a fresh sealed credential row. Throws the libSQL constraint error on a slot collision (the
 *  TOCTOU loser of two concurrent first-adds) — the caller classifies it via `isConstraintViolation`. */
export function insertSealed(
  db: Db,
  args: {
    readonly id: UserCredentialId;
    readonly ownerId: UserId;
    readonly provider: ProviderId;
    readonly label: string;
    readonly sealed: Sealed;
    readonly metadata: ProviderMetadata;
    readonly now: number;
  },
): Promise<unknown> {
  return db.insert(userCredentials).values({
    id: args.id,
    ownerId: args.ownerId,
    provider: args.provider,
    label: args.label,
    ciphertext: args.sealed.ciphertext,
    iv: args.sealed.iv,
    tag: args.sealed.tag,
    ...CLEARED_REVOCATION,
    metadata: args.metadata,
    createdAt: args.now,
    updatedAt: args.now,
  });
}

/** Delete a credential (owner-scoped). `user_connections.credential_id` SET-NULLs (the connection survives
 *  as `no-connection` until re-keyed). */
export function deleteOwnedCredential(db: Db, ownerId: UserId, credentialId: UserCredentialId): Promise<unknown> {
  return db.delete(userCredentials).where(and(eq(userCredentials.id, credentialId), eq(userCredentials.ownerId, ownerId)));
}

/** Mark a credential revoked — OWNER-SCOPED, every revoke path. Idempotent (a re-revoke re-stamps).
 *
 *  It used to be `WHERE id = ?` with an `@owner-scope-write-ok` marker arguing that a foreign row was
 *  unreachable "by construction" from today's callers. That argument was true and worthless: it was a claim
 *  about call sites, and the next wiring inherits nothing that says so (`injected-op-caller-param`). Now the
 *  scope is a QUERY PREDICATE — a credentialId the owner does not hold matches zero rows — which is why the
 *  marker is gone rather than re-justified.
 *
 *  RETURNS THE MATCHED IDS so a caller that did NOT pre-prove ownership can tell "revoked" from "matched
 *  nothing" (the strike-out reports the miss; the pre-fetching callers ignore it).
 *
 *  `reason` is REQUIRED, not optional: `revoked_at` and `revoked_reason` are written in one statement at every
 *  call site, so "revoked with no reason" is unrepresentable rather than merely discouraged (the writer-set
 *  discipline a stated column biconditional actually needs — a convention the next `.set()` can forget is
 *  worth nothing). Its inverse is {@link CLEARED_REVOCATION}. */
export function setRevokedById(
  db: Db,
  args: { readonly ownerId: UserId; readonly credentialId: UserCredentialId; readonly revokedAt: number; readonly reason: CredRevokedReason },
): Promise<{ id: UserCredentialId }[]> {
  return db
    .update(userCredentials)
    .set({ revokedAt: args.revokedAt, revokedReason: args.reason, updatedAt: args.revokedAt })
    .where(and(eq(userCredentials.id, args.credentialId), eq(userCredentials.ownerId, args.ownerId)))
    .returning({ id: userCredentials.id });
}

/** Clear a revocation (owner-scoped) — the user knows the key is good again. */
export function clearRevokedOwned(db: Db, ownerId: UserId, credentialId: UserCredentialId, now: number): Promise<unknown> {
  return db
    .update(userCredentials)
    .set({ ...CLEARED_REVOCATION, updatedAt: now })
    .where(and(eq(userCredentials.id, credentialId), eq(userCredentials.ownerId, ownerId)));
}

/** Project a row to the wire-shape `CredentialView` — drops every secret field. */
export function toCredentialView(row: CredentialRow): CredentialView {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    revokedAt: row.revokedAt,
    revokedReason: row.revokedReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
