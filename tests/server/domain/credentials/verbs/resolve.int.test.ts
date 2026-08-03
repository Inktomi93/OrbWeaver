// verb: resolve — the turn-time chokepoint. The security core: every source arm, the max-pro-sub OWNER
// gate (D17), the AES-256-GCM AAD binding (a row lifted to another owner WON'T decrypt — GCM tag
// mismatch, treated as absent), and the revoked/missing → no-credential floor. Real db + real SecretBox.

import type { ProviderMetadata } from "@orb/contracts/credentials";
import { userCredentials } from "@orb/db";
import { DomainForbiddenError, DomainNoCredentialError } from "@orb/kit/errors";
import { createCredentialsService } from "@orb/server/domain/credentials";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("resolve", () => {
  test("keyless arms (vllm / local-light) mint pure routing markers — no row, no key", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "owner" });

    const vllm = await svc.resolve({ principal: principal(owner, "owner"), source: "vllm" });
    const local = await svc.resolve({
      principal: principal(owner, "owner"),
      source: "local-light",
    });
    expect(vllm).toMatchObject({ source: "vllm", credentialId: null });
    expect(local).toMatchObject({ source: "local-light", credentialId: null });
  });

  test("max-pro-sub is OWNER-ONLY (D17): owner resolves it, admin + user are REFUSED", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "owner" });
    const admin = await seedUser(db, { id: "user_a", role: "admin" });
    const user = await seedUser(db, { id: "user_u", role: "user" });

    const resolved = await svc.resolve({
      principal: principal(owner, "owner"),
      source: "max-pro-sub",
    });
    expect(resolved).toMatchObject({ source: "max-pro-sub", credentialId: null });

    await expect(svc.resolve({ principal: principal(admin, "admin"), source: "max-pro-sub" })).rejects.toThrow(DomainForbiddenError);
    await expect(svc.resolve({ principal: principal(user, "user"), source: "max-pro-sub" })).rejects.toThrow(DomainForbiddenError);
  });

  test("openrouter round-trips: add seals the key, resolve decrypts the SAME plaintext", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    await svc.add({ principal: principal(owner), provider: "openrouter", key: "sk-or-secret" });

    const resolved = await svc.resolve({ principal: principal(owner), source: "openrouter" });
    expect(resolved).toMatchObject({ source: "openrouter", apiKey: "sk-or-secret" });
  });

  test("AAD binding: a row LIFTED to another owner fails to decrypt → no credential (GCM tag mismatch)", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const alice = await seedUser(db, { id: "user_alice", role: "user" });
    const bob = await seedUser(db, { id: "user_bob", role: "user" });
    const added = await svc.add({
      principal: principal(alice),
      provider: "openrouter",
      key: "sk-alice",
    });

    // Lift Alice's row into Bob's slot (the attack the AAD belt defends against). The ciphertext was
    // bound to `alice|openrouter`; decrypting it as `bob|openrouter` fails the GCM tag check.
    await db.update(userCredentials).set({ ownerId: bob }).where(eq(userCredentials.id, added.id));

    await expect(svc.resolve({ principal: principal(bob), source: "openrouter" })).rejects.toThrow(DomainNoCredentialError);
    // Alice (the original AAD slot) no longer owns the row, so she has nothing to resolve either.
    await expect(svc.resolve({ principal: principal(alice), source: "openrouter" })).rejects.toThrow(DomainNoCredentialError);
  });

  test("a missing credential is the typed no-credential floor (no silent host fallback)", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    await expect(svc.resolve({ principal: principal(owner), source: "openrouter" })).rejects.toThrow(DomainNoCredentialError);
  });

  test("a revoked active credential does NOT resolve (falls through to the floor)", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const added = await svc.add({
      principal: principal(owner),
      provider: "openrouter",
      key: "sk-or",
    });
    await svc.markRevokedByUser({ principal: principal(owner), credentialId: added.id });
    await expect(svc.resolve({ principal: principal(owner), source: "openrouter" })).rejects.toThrow(DomainNoCredentialError);
  });

  test("custom_openai resolves the active endpoint from metadata (baseUrl + key)", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    await svc.add({
      principal: principal(owner),
      provider: "custom_openai",
      key: "sk-custom",
      metadata: { kind: "custom_openai", baseUrl: "https://llm.local/v1" },
    });
    const resolved = await svc.resolve({ principal: principal(owner), source: "custom_openai" });
    expect(resolved).toMatchObject({
      source: "custom_openai",
      baseUrl: "https://llm.local/v1",
      apiKey: "sk-custom",
    });
  });

  test("a custom_openai row with corrupt/missing baseUrl metadata → typed credential_metadata_invalid", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const added = await svc.add({
      principal: principal(owner),
      provider: "custom_openai",
      key: "sk-custom",
      metadata: { kind: "custom_openai", baseUrl: "https://placeholder.test/v1" },
    });
    await db
      .update(userCredentials)
      // FABRICATION-OK: a deliberately corrupt custom_openai row (no baseUrl) — proves the read seam returns null for it.
      .set({ metadata: { kind: "custom_openai" } as unknown as ProviderMetadata })
      .where(eq(userCredentials.id, added.id));

    await expect(svc.resolve({ principal: principal(owner), source: "custom_openai" })).rejects.toMatchObject({ code: "credential_metadata_invalid" });
  });
});
