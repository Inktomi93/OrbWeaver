import type { Db } from "@orb/db";
import { oidcTransactions } from "@orb/db/schema";
import { and, eq, gt, lte } from "drizzle-orm";
import type { OidcTransaction } from "#infra/auth";
import { OIDC_TRANSACTION_TTL_MS } from "#infra/auth";
import { deleteExpiredPendingSignups } from "./pending-signups.ts";

interface DomainOidcStore {
  mint: (tx: OidcTransaction) => Promise<void>;
  consume: (state: string) => Promise<OidcTransaction | null>;
  deleteExpired: (before: number) => Promise<number>;
}

/** `now` is the injected clock, used to enforce the tx TTL. Both reap paths gate on expiresAt \<=
 *  before/now — neither ever deletes a live tx, so an in-flight PKCE flow is never broken. */
export function createOidcStore(db: Db, now: () => number): DomainOidcStore {
  return {
    async mint(tx: OidcTransaction): Promise<void> {
      await db.insert(oidcTransactions).values({
        state: tx.state,
        codeVerifier: tx.codeVerifier,
        nonce: tx.nonce,
        redirectUri: tx.redirectUri,
        inviteTokenHash: tx.inviteTokenHash,
        createdAt: tx.createdAt,
        expiresAt: tx.createdAt + OIDC_TRANSACTION_TTL_MS,
      });
    },

    async consume(state: string): Promise<OidcTransaction | null> {
      const at = now();
      // Sweep expired rows first (incl. any matching state) so a stale PKCE secret is never left at rest.
      await db.delete(oidcTransactions).where(lte(oidcTransactions.expiresAt, at));
      // Atomic take-and-delete of the live tx, expiry-gated to prevent replay.
      const deleted = await db
        .delete(oidcTransactions)
        .where(and(eq(oidcTransactions.state, state), gt(oidcTransactions.expiresAt, at)))
        .returning();

      if (deleted.length === 0) {
        return null;
      }

      const row = deleted[0];
      if (row === undefined) {
        return null;
      }

      // Nonce and redirectUri are nullable in schema but string in contract.
      return {
        state: row.state,
        codeVerifier: row.codeVerifier,
        nonce: row.nonce ?? "",
        redirectUri: row.redirectUri ?? "",
        createdAt: row.createdAt,
        inviteTokenHash: row.inviteTokenHash,
      };
    },

    /** Scheduled GC path; never touches a live row, so a concurrent in-flight PKCE flow is safe. It also reaps
     *  expired pending joins (D254): an unconfirmed join leaves no identity at rest past its window. */
    async deleteExpired(before: number): Promise<number> {
      const reaped = await db.delete(oidcTransactions).where(lte(oidcTransactions.expiresAt, before)).returning({ state: oidcTransactions.state });
      const pending = await deleteExpiredPendingSignups(db, before);
      return reaped.length + pending;
    },
  };
}
