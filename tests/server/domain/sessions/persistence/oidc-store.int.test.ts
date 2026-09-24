import type { Db } from "@orb/db";
import { beforeEach, describe } from "vitest";
import { createOidcStore } from "../../../../../packages/server/src/domain/sessions/persistence/oidc-store.ts";
import type { OidcTransaction } from "../../../../../packages/server/src/infra/auth/index.ts";
import { OIDC_TRANSACTION_TTL_MS } from "../../../../../packages/server/src/infra/auth/index.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const T0 = 1_750_000_000_000;

let db: Db;

// A controllable injected clock (entry mints the real one; tests drive it to exercise the TTL).
function fixedClock(at: number): () => number {
  return () => at;
}

beforeEach(async () => {
  db = await freshDb();
});

describe("oidc-store", () => {
  test("mints and consumes an OIDC transaction atomically", async () => {
    const store = createOidcStore(db, fixedClock(T0));

    const tx: OidcTransaction = {
      state: "state_123",
      codeVerifier: "verifier_456",
      nonce: "nonce_789",
      redirectUri: "http://localhost/callback",
      createdAt: T0,
    };

    await store.mint(tx);

    const consumed = await store.consume("state_123");
    expect(consumed).toEqual(tx);

    const second = await store.consume("state_123");
    expect(second).toBeNull();
  });

  test("consume yields null for unknown state", async () => {
    const store = createOidcStore(db, fixedClock(T0));
    const consumed = await store.consume("nope");
    expect(consumed).toBeNull();
  });

  test("consume REJECTS an expired transaction (past the 10-min TTL) — returns null, not the row", async () => {
    // Minted at T0 → expiresAt = T0 + 10min. The callback arrives one ms after expiry.
    const minted = createOidcStore(db, fixedClock(T0));
    await minted.mint({
      state: "state_expired",
      codeVerifier: "verifier_stale",
      nonce: "nonce_stale",
      redirectUri: "http://localhost/callback",
      createdAt: T0,
    });

    const late = createOidcStore(db, fixedClock(T0 + OIDC_TRANSACTION_TTL_MS + 1));
    expect(await late.consume("state_expired")).toBeNull();

    // And the stale row was SWEPT — a second consume (even inside its original window) can never re-drive it,
    // and no stale PKCE codeVerifier/nonce lingers at rest. Prove the delete happened.
    const stillThere = await createOidcStore(db, fixedClock(T0)).consume("state_expired");
    expect(stillThere).toBeNull();
  });

  test("consume ACCEPTS a transaction still inside its TTL window", async () => {
    const store = createOidcStore(db, fixedClock(T0));
    const tx: OidcTransaction = {
      state: "state_live",
      codeVerifier: "verifier_live",
      nonce: "nonce_live",
      redirectUri: "http://localhost/callback",
      createdAt: T0,
    };
    await store.mint(tx);

    // One ms before expiry → still valid.
    const nearExpiry = createOidcStore(db, fixedClock(T0 + OIDC_TRANSACTION_TTL_MS - 1));
    expect(await nearExpiry.consume("state_live")).toEqual(tx);
  });

  test("consume sweeps OTHER abandoned expired rows opportunistically (defense-in-depth alongside the scheduled GC)", async () => {
    const minted = createOidcStore(db, fixedClock(T0));
    await minted.mint({
      state: "state_abandoned",
      codeVerifier: "verifier_abandoned",
      nonce: "nonce_abandoned",
      redirectUri: "http://localhost/callback",
      createdAt: T0,
    });

    // A later, unrelated consume runs past the abandoned row's TTL — it sweeps the abandoned row as a side
    // effect, so a subsequent consume of the abandoned state finds nothing.
    const later = createOidcStore(db, fixedClock(T0 + OIDC_TRANSACTION_TTL_MS + 1));
    expect(await later.consume("some_other_state")).toBeNull();
    expect(await createOidcStore(db, fixedClock(T0)).consume("state_abandoned")).toBeNull();
  });

  test("deleteExpired reaps ONLY expired/abandoned rows and leaves live ones — the scheduled GC path", async () => {
    // Two abandoned rows minted at T0 (never consumed) → both expire at T0 + 10min.
    const minted = createOidcStore(db, fixedClock(T0));
    await minted.mint({
      state: "state_abandoned_a",
      codeVerifier: "verifier_a",
      nonce: "nonce_a",
      redirectUri: "http://localhost/callback",
      createdAt: T0,
    });
    await minted.mint({
      state: "state_abandoned_b",
      codeVerifier: "verifier_b",
      nonce: "nonce_b",
      redirectUri: "http://localhost/callback",
      createdAt: T0,
    });
    // A LIVE row minted just before the sweep instant — expires well after it.
    const sweepAt = T0 + OIDC_TRANSACTION_TTL_MS + 1;
    const liveStore = createOidcStore(db, fixedClock(sweepAt));
    await liveStore.mint({
      state: "state_live",
      codeVerifier: "verifier_live",
      nonce: "nonce_live",
      redirectUri: "http://localhost/callback",
      createdAt: sweepAt,
    });

    // The scheduled sweep runs once past both abandoned rows' TTL but inside the live row's window.
    const reaped = await liveStore.deleteExpired(sweepAt);
    expect(reaped).toBe(2);

    // The abandoned rows are gone (no stale codeVerifier/nonce at rest); the live PKCE flow still consumes.
    expect(await createOidcStore(db, fixedClock(T0)).consume("state_abandoned_a")).toBeNull();
    expect(await createOidcStore(db, fixedClock(T0)).consume("state_abandoned_b")).toBeNull();
    const live = await liveStore.consume("state_live");
    expect(live?.state).toBe("state_live");
  });

  test("deleteExpired NEVER deletes a row at the exact expiry boundary+1 (live tx is safe)", async () => {
    const minted = createOidcStore(db, fixedClock(T0));
    await minted.mint({
      state: "state_boundary",
      codeVerifier: "verifier_boundary",
      nonce: "nonce_boundary",
      redirectUri: "http://localhost/callback",
      createdAt: T0,
    });

    // One ms BEFORE expiry: the row is still live (`expiresAt > before`) — the sweep must not touch it.
    const store = createOidcStore(db, fixedClock(T0));
    expect(await store.deleteExpired(T0 + OIDC_TRANSACTION_TTL_MS - 1)).toBe(0);
    expect((await store.consume("state_boundary"))?.state).toBe("state_boundary");
  });

  test("deleteExpired reaps a row AT its exact expiry instant (expiresAt <= before)", async () => {
    const minted = createOidcStore(db, fixedClock(T0));
    await minted.mint({
      state: "state_at_expiry",
      codeVerifier: "verifier_at_expiry",
      nonce: "nonce_at_expiry",
      redirectUri: "http://localhost/callback",
      createdAt: T0,
    });

    // expiresAt === T0 + TTL; sweeping AT that instant reaps it (mirrors consume's `lte` expiry gate).
    const store = createOidcStore(db, fixedClock(T0));
    expect(await store.deleteExpired(T0 + OIDC_TRANSACTION_TTL_MS)).toBe(1);
    expect(await store.consume("state_at_expiry")).toBeNull();
  });
});
