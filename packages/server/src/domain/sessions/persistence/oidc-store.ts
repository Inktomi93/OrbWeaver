import type { Db } from "@orb/db";
import { oidcTransactions } from "@orb/db/schema";
import { and, eq, gt, lte } from "drizzle-orm";
import type { OidcTransaction } from "#infra/auth";

interface DomainOidcStore {
  mint: (tx: OidcTransaction) => Promise<void>;
  consume: (state: string) => Promise<OidcTransaction | null>;
  deleteExpired: (before: number) => Promise<number>;
}

const OIDC_TX_TTL_MS = 600_000;

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
        createdAt: tx.createdAt,
        expiresAt: tx.createdAt + OIDC_TX_TTL_MS,
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
      };
    },

    /** Scheduled GC path; never touches a live row, so a concurrent in-flight PKCE flow is safe. */
    async deleteExpired(before: number): Promise<number> {
      const reaped = await db
        .delete(oidcTransactions)
        .where(lte(oidcTransactions.expiresAt, before))
        .returning({ state: oidcTransactions.state });
      return reaped.length;
    },
  };
}
