import type { Db } from "@orb/db";
import { oidcTransactions } from "@orb/db/schema";
import { eq } from "drizzle-orm";
import type { OidcTransaction } from "#infra/auth";

interface DomainOidcStore {
  mint: (tx: OidcTransaction) => Promise<void>;
  consume: (state: string) => Promise<OidcTransaction | null>;
}

const OIDC_TX_TTL_MS = 600_000;

/** Satisfies `OidcTransactionStore` (for infra/auth verify) and `OidcMintStore` (for entry authorize-redirect). */
export function createOidcStore(db: Db): DomainOidcStore {
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
      // ATOMIC take-and-delete to prevent replay attacks on the callback
      const deleted = await db
        .delete(oidcTransactions)
        .where(eq(oidcTransactions.state, state))
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
  };
}
