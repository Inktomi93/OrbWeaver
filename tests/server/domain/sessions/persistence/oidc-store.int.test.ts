import type { Db } from "@orb/db";
import { beforeEach, describe, expect, test } from "vitest";
import { createOidcStore } from "../../../../../packages/server/src/domain/sessions/persistence/oidc-store";
import type { OidcTransaction } from "../../../../../packages/server/src/infra/auth";
import { freshDb } from "../../../../support/db";

const T0 = 1_750_000_000_000;

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("oidc-store", () => {
  test("mints and consumes an OIDC transaction atomically", async () => {
    const store = createOidcStore(db);

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
    const store = createOidcStore(db);
    const consumed = await store.consume("nope");
    expect(consumed).toBeNull();
  });
});
