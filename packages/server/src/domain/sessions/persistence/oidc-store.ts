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

/** Satisfies `OidcTransactionStore` (infra/auth verify: `consume`) and `OidcMintStore` (entry authorize-redirect:
 *  `mint`). `now` is the injected clock (entry mints the one real wall clock) — used to ENFORCE the 10-min tx TTL
 *  that `mint` stamps into `expiresAt`. Two reap paths, BOTH gated on `expiresAt <= before/now` — neither ever
 *  deletes a LIVE tx (`expiresAt > now`), so an in-flight PKCE flow is never broken:
 *   • `consume` — atomic take-and-delete of the LIVE row matching `state` (replay-proof), PLUS an inline
 *     defense-in-depth sweep of every expired row so a stale PKCE `codeVerifier`/`nonce` is never left at rest.
 *   • `deleteExpired` — the SCHEDULED reap the `transport/jobs/oidc-gc-scheduler` driver runs on a cadence, so
 *     an ABANDONED tx (minted, never redeemed) is bounded in the table instead of living until the next consume. */
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
      // Sweep every expired tx (including an expired row matching `state`, so it is removed AND rejected —
      // a stale PKCE `codeVerifier`/`nonce` is never left at rest and never replayable past its TTL).
      await db.delete(oidcTransactions).where(lte(oidcTransactions.expiresAt, at));
      // ATOMIC take-and-delete of the LIVE tx (expiry-gated) to prevent replay attacks on the callback: an
      // expired row was already swept above and cannot match `expiresAt > now`, so it yields null.
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

    /** Reap every EXPIRED transaction (`expiresAt <= before`) — the scheduled GC path. NEVER touches a live row
     *  (`expiresAt > before`), so a concurrent in-flight PKCE flow is safe. Returns the count reaped (logged by
     *  the scheduler). Indexed by `oidc_transactions_expires_idx`. */
    async deleteExpired(before: number): Promise<number> {
      const reaped = await db
        .delete(oidcTransactions)
        .where(lte(oidcTransactions.expiresAt, before))
        .returning({ state: oidcTransactions.state });
      return reaped.length;
    },
  };
}
