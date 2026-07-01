import type { OidcTransaction, OidcTransactionStore, ResolveDeps } from "@orb/server/infra/auth";
import { verifyPkceState } from "@orb/server/infra/auth";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures";

// `verifyPkceState` — the db-free OIDC callback state/PKCE verify: atomically CONSUME the single-use
// transaction matching the returned `state` (replay-proof). The store is injected (db-backed at 4e).

const FIXED_AT = 1_700_000_000_000;

const tx = (state: string): OidcTransaction => ({
  state,
  codeVerifier: "verifier-fixture",
  nonce: "nonce-fixture",
  redirectUri: "https://app.example.com/callback",
  createdAt: FIXED_AT,
});

function store(consume: (state: string) => Promise<OidcTransaction | null>): OidcTransactionStore {
  return { consume };
}

function deps(over: Partial<ResolveDeps> = {}): ResolveDeps {
  return { ...over };
}

describe("verifyPkceState", () => {
  test("a matching single-use transaction is returned", async () => {
    const result = await verifyPkceState(
      deps({ oidcStore: store((s) => Promise.resolve(tx(s))) }),
      "state-abc",
    );
    expect(result).toEqual(tx("state-abc"));
  });

  test("a replayed/forged state (store returns null) → null (fail-closed)", async () => {
    const result = await verifyPkceState(
      deps({ oidcStore: store(() => Promise.resolve(null)) }),
      "state-abc",
    );
    expect(result).toBeNull();
  });

  test("no store wired → null", async () => {
    expect(await verifyPkceState(deps(), "state-abc")).toBeNull();
  });

  test("an empty state → null", async () => {
    const result = await verifyPkceState(
      deps({ oidcStore: store((s) => Promise.resolve(tx(s))) }),
      "",
    );
    expect(result).toBeNull();
  });

  test("a stored row whose state disagrees → null (defensive)", async () => {
    const result = await verifyPkceState(
      deps({ oidcStore: store(() => Promise.resolve(tx("a-different-state"))) }),
      "state-abc",
    );
    expect(result).toBeNull();
  });
});
