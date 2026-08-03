// All db access for `user_credentials` (queries only). SecretBox seal/open happens in the verbs; this slot
// stores/reads the sealed bytes. `toCredentialView` is the only projection to the wire shape — it drops
// `ciphertext`/`iv`/`tag`.

import type { CredentialProvider, ProviderMetadata } from "@orb/contracts/credentials";
import type { Db } from "@orb/db";
import { userCredentials } from "@orb/db";
import { batchMany, fetchOwned } from "@orb/db/kit";
import type { UserCredentialId, UserId } from "@orb/kit/ids";
import { and, asc, eq } from "drizzle-orm";
import type { Sealed } from "#infra/crypto";
import type { CredentialView } from "../contract/views.ts";

type CredentialRow = typeof userCredentials.$inferSelect;

const LIMIT_ONE = 1;

/** Owner-scoped fetch of one credential by id (active OR inactive) — `undefined` if missing/not-owned. */
export function fetchOwnedCredential(db: Db, ownerId: UserId, credentialId: UserCredentialId): Promise<CredentialRow | undefined> {
  return fetchOwned(db, userCredentials, credentialId, ownerId);
}

/** The user's ACTIVE credential for a provider, or `undefined`. The partial unique index guarantees at
 *  most one active row per `(owner, provider)`, so this is at most one row. */
export async function loadActiveCredential(db: Db, ownerId: UserId, provider: CredentialProvider): Promise<CredentialRow | undefined> {
  const rows = await db
    .select()
    .from(userCredentials)
    .where(and(eq(userCredentials.ownerId, ownerId), eq(userCredentials.provider, provider), eq(userCredentials.active, true)))
    .limit(LIMIT_ONE);
  return rows[0];
}

/** Every credential the user owns, ordered `(provider, createdAt)` for a stable list view. */
export function listOwnedCredentials(db: Db, ownerId: UserId): Promise<CredentialRow[]> {
  return db.select().from(userCredentials).where(eq(userCredentials.ownerId, ownerId)).orderBy(asc(userCredentials.provider), asc(userCredentials.createdAt));
}

/** The existing row in this `(owner, provider, label)` slot (the rotate-vs-insert decision), or `undefined`. */
export async function findSlotLabelRow(db: Db, ownerId: UserId, provider: CredentialProvider, label: string): Promise<{ id: UserCredentialId } | undefined> {
  const rows = await db
    .select({ id: userCredentials.id })
    .from(userCredentials)
    .where(and(eq(userCredentials.ownerId, ownerId), eq(userCredentials.provider, provider), eq(userCredentials.label, label)))
    .limit(LIMIT_ONE);
  return rows[0];
}

/** Does the user already have any credential in this `(owner, provider)` slot? (first-in-slot ⇒ active). */
export async function hasAnyInSlot(db: Db, ownerId: UserId, provider: CredentialProvider): Promise<boolean> {
  const rows = await db
    .select({ id: userCredentials.id })
    .from(userCredentials)
    .where(and(eq(userCredentials.ownerId, ownerId), eq(userCredentials.provider, provider)))
    .limit(LIMIT_ONE);
  return rows.length > 0;
}

/** Rotate the sealed secret in place (preserve id/active; CLEAR revocation — a fresh key voids it). */
// @owner-scope-write-ok: the id is not the caller's to name — `add`'s rotate arm passes the row `findSlotLabelRow`
// just resolved from the caller's OWN `(ownerId, provider, label)` slot, so a foreign credential is not
// reachable at this call. Ends the day a caller-supplied credentialId reaches rotate (then it takes `ownerId`,
// the `promoteActive` shape below).
export function rotateSealed(
  db: Db,
  args: {
    readonly credentialId: UserCredentialId;
    readonly sealed: Sealed;
    readonly metadata: ProviderMetadata;
    readonly now: number;
  },
): Promise<unknown> {
  return db
    .update(userCredentials)
    .set({
      ciphertext: args.sealed.ciphertext,
      iv: args.sealed.iv,
      tag: args.sealed.tag,
      metadata: args.metadata,
      revokedAt: null,
      updatedAt: args.now,
    })
    .where(eq(userCredentials.id, args.credentialId));
}

/** Insert a fresh sealed credential row. Throws the libSQL constraint error on a slot collision (the
 *  TOCTOU loser of two concurrent first-adds) — the caller classifies it via `isConstraintViolation`. */
export function insertSealed(
  db: Db,
  args: {
    readonly id: UserCredentialId;
    readonly ownerId: UserId;
    readonly provider: CredentialProvider;
    readonly label: string;
    readonly sealed: Sealed;
    readonly metadata: ProviderMetadata;
    readonly active: boolean;
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
    active: args.active,
    revokedAt: null,
    metadata: args.metadata,
    createdAt: args.now,
    updatedAt: args.now,
  });
}

/** Promote `credentialId` to active, atomically demoting any other active row in its `(owner, provider)`
 *  slot. One `batch` (demote-then-promote) — between the two there are zero active rows, so the partial
 *  unique index never sees a two-active state even under a concurrent promote.
 *
 *  BOTH legs carry `ownerId`: the demote always did, and the promote does now. The verb proves ownership
 *  first (`fetchOwnedCredential` → `requireOwned`), so this is the second belt — but the owner is already in
 *  the args, and an owner-scoped WHERE is a promise the signature keeps on its own, where the verb's guard is
 *  one the next caller inherits nothing about. */
export function promoteActive(
  db: Db,
  args: {
    readonly ownerId: UserId;
    readonly credentialId: UserCredentialId;
    readonly provider: CredentialProvider;
    readonly now: number;
  },
): Promise<unknown> {
  return db.batch(
    batchMany([
      db
        .update(userCredentials)
        .set({ active: false, updatedAt: args.now })
        .where(and(eq(userCredentials.ownerId, args.ownerId), eq(userCredentials.provider, args.provider))),
      db
        .update(userCredentials)
        .set({ active: true, updatedAt: args.now })
        .where(and(eq(userCredentials.id, args.credentialId), eq(userCredentials.ownerId, args.ownerId))),
    ]),
  );
}

/** Delete a credential (owner-scoped). Nothing references credential rows by FK, so a plain DELETE is the
 *  whole operation (a chat resolves the user's ACTIVE credential at turn time — no per-chat pin). */
export function deleteOwnedCredential(db: Db, ownerId: UserId, credentialId: UserCredentialId): Promise<unknown> {
  return db.delete(userCredentials).where(and(eq(userCredentials.id, credentialId), eq(userCredentials.ownerId, ownerId)));
}

/** Mark a credential revoked by id — the runner path (no owner scope). Sets `revokedAt` only. Idempotent. */
// @owner-scope-write-ok: DELIBERATELY unscoped — the runner-internal revoke (`markRevoked`, NOT exposed on the
// tRPC router) proved access by HOLDING the credential through a completed turn, and the post-turn
// `maybeRevokeOnAuthFailed` has only the id the turn ran under. The user-facing twin `markRevokedByUser` DOES
// prove ownership first (`fetchOwnedCredential` → `requireOwned`) before calling this. Ends the day the runner
// revoke path threads a userId — the verb header already names that as the merge condition.
export function setRevokedById(db: Db, credentialId: UserCredentialId, revokedAt: number): Promise<unknown> {
  return db.update(userCredentials).set({ revokedAt, updatedAt: revokedAt }).where(eq(userCredentials.id, credentialId));
}

/** Clear a revocation (owner-scoped) — the user knows the key is good again. */
export function clearRevokedOwned(db: Db, ownerId: UserId, credentialId: UserCredentialId, now: number): Promise<unknown> {
  return db
    .update(userCredentials)
    .set({ revokedAt: null, updatedAt: now })
    .where(and(eq(userCredentials.id, credentialId), eq(userCredentials.ownerId, ownerId)));
}

/** Project a row to the wire-shape `CredentialView` — drops every secret field. */
export function toCredentialView(row: CredentialRow): CredentialView {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    active: row.active,
    hasMetadata: row.metadata !== null,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
