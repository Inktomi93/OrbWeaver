// All db access for `user_credentials` (queries only). SecretBox seal/open happens in the verbs; this slot
// stores/reads the sealed bytes. `toCredentialView` is the only projection to the wire shape — it drops
// `ciphertext`/`iv`/`tag`.

import type { CredentialProvider, CredRevokedReason, ProviderMetadata } from "@orb/contracts/credentials";
import type { Db } from "@orb/db";
import { userCredentials } from "@orb/db";
import { batchMany, fetchOwned } from "@orb/db/kit";
import type { UserCredentialId, UserId } from "@orb/kit/ids";
import { and, asc, eq } from "drizzle-orm";
import type { Sealed } from "#infra/crypto";
import type { CredentialView } from "../contract/views.ts";

type CredentialRow = typeof userCredentials.$inferSelect;

const LIMIT_ONE = 1;

/** The revocation columns every un-revoke path nulls TOGETHER — a live row carrying a stale reason would tell
 *  the Connections pane a key was rejected when it currently works. Three writers spread it: the fresh insert,
 *  `add`'s rotate arm (a new key voids the old rejection) and the explicit clear. */
const CLEARED_REVOCATION = { revokedAt: null, revokedReason: null } as const;

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

/** The `metadata` blob of every credential the user owns — the egress-admission derivation's read
 *  (`substrate/egress-admission.ts`). Projects the metadata COLUMN ONLY: the SSRF belt needs the declared
 *  endpoint URL and has no business loading sealed secret material to get it. */
export function listOwnedCredentialMetadata(db: Db, ownerId: UserId): Promise<{ metadata: ProviderMetadata }[]> {
  return db.select({ metadata: userCredentials.metadata }).from(userCredentials).where(eq(userCredentials.ownerId, ownerId));
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
// @orb-waive owner-scoped-writes(userCredentials): the id is not the caller's to name — `add`'s rotate arm passes the row `findSlotLabelRow` just resolved from the caller's OWN `(ownerId, provider, label)` slot, so a foreign credential is not reachable at this call. Ends the day a caller-supplied credentialId reaches rotate (then it takes `ownerId`, the `promoteActive` shape below).
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
      ...CLEARED_REVOCATION,
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
    ...CLEARED_REVOCATION,
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
    active: row.active,
    hasMetadata: row.metadata !== null,
    revokedAt: row.revokedAt,
    revokedReason: row.revokedReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
