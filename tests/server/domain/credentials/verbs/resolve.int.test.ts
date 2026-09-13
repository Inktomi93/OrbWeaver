// verb: resolve — the turn-time chokepoint. The security core: every source arm, the max-pro-sub OWNER
// gate (D17), the AES-256-GCM AAD binding (a row lifted to another owner WON'T decrypt — GCM tag
// mismatch becomes the typed config error), and the revoked/missing → no-credential floor. Real db + real SecretBox.

import type { ProviderMetadata } from "@orb/contracts/credentials";
import { userCredentials } from "@orb/db";
import { DomainForbiddenError, DomainNoCredentialError } from "@orb/kit/errors";
import { CredentialsDecryptError, createCredentialsService } from "@orb/server/domain/credentials";
import { createSecretBox } from "@orb/server/infra/crypto";
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

  test("stored hosted credentials with a missing runtime key fail as decrypt-unavailable, never absent or keyless", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const enabledService = createCredentialsService(harness.ctx);
    const owner = await seedUser(db, { id: "user_missing_runtime_key", role: "user" });
    await enabledService.add({ principal: principal(owner), provider: "openrouter", key: "sk-or-stored" });
    await enabledService.add({
      principal: principal(owner),
      provider: "custom_openai",
      key: "",
      metadata: { kind: "custom_openai", baseUrl: "http://127.0.0.1:8000/v1" },
    });

    const disabledService = createCredentialsService({ ...harness.ctx, box: createSecretBox(null) });

    await expect(disabledService.resolve({ principal: principal(owner), source: "openrouter" })).rejects.toBeInstanceOf(CredentialsDecryptError);
    await expect(disabledService.resolve({ principal: principal(owner), source: "custom_openai" })).rejects.toBeInstanceOf(CredentialsDecryptError);

    const recoveredOpenRouter = await enabledService.resolve({ principal: principal(owner), source: "openrouter" });
    const recoveredCustomOpenAi = await enabledService.resolve({ principal: principal(owner), source: "custom_openai" });
    expect(recoveredOpenRouter).toMatchObject({ source: "openrouter", apiKey: "sk-or-stored" });
    expect(recoveredCustomOpenAi).toMatchObject({ source: "custom_openai", apiKey: null });
  });

  test("AAD binding: a row LIFTED to another owner fails with the typed decrypt/config error", async () => {
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

    await expect(svc.resolve({ principal: principal(bob), source: "openrouter" })).rejects.toBeInstanceOf(CredentialsDecryptError);
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

  test("a revoked active custom_openai credential does NOT resolve either (the openrouter twin's other half)", async () => {
    // The `|| active.revokedAt !== null` half of `resolveCustomOpenAi` was UNPINNED: deleting it survived the
    // whole suite, because only the openrouter arm had a revoked-row test. That gap matters more now that a
    // provider `auth_failed` revokes automatically (#1373) — without this guard a struck BYO endpoint would
    // keep resolving and keep re-dialling the key the endpoint just rejected, which is the exact loop the
    // strike-out exists to break.
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const added = await svc.add({
      principal: principal(owner),
      provider: "custom_openai",
      key: "sk-custom",
      metadata: { kind: "custom_openai", baseUrl: "https://llm.local/v1" },
    });
    // Revoked by the STRIKE-OUT path (not the user's own revoke), the case the resolver actually meets.
    await svc.maybeRevokeOnAuthFailed({ ownerId: owner, credentialId: added.id, errorKind: "auth_failed", errorMessage: "the endpoint rejected the key" });

    await expect(svc.resolve({ principal: principal(owner), source: "custom_openai" })).rejects.toThrow(DomainNoCredentialError);
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

  // The no-auth local server (the case the resolver's own comment names): the row exists and decrypts
  // cleanly, but its plaintext is EMPTY. `apiKey` must be NULL, not `""` — the mint's contract is
  // "null for no-auth", and an empty-string key travels into an `Authorization: Bearer ` header. The
  // length check is what draws that line; without this pin a `>= 0` mutation survives untested.
  test("an EMPTY custom_openai key is no key at all → apiKey null (not an empty string)", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    await svc.add({
      principal: principal(owner),
      provider: "custom_openai",
      key: "",
      metadata: { kind: "custom_openai", baseUrl: "http://127.0.0.1:8000/v1" },
    });

    const resolved = await svc.resolve({ principal: principal(owner), source: "custom_openai" });

    if (resolved.source !== "custom_openai") {
      throw new Error(`expected a custom_openai credential, got ${resolved.source}`);
    }
    expect(resolved.baseUrl).toBe("http://127.0.0.1:8000/v1");
    // Asserted on the field itself: `toMatchObject({apiKey: null})` would not distinguish "" from null.
    expect(resolved.apiKey).toBeNull();
  });

  test("malformed custom_openai ciphertext is a typed non-retryable config failure, never keyless", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService(h.ctx);
    const owner = await seedUser(db, { id: "user_bad_ciphertext", role: "user" });
    const added = await svc.add({
      principal: principal(owner),
      provider: "custom_openai",
      key: "sk-valid-before-corruption",
      metadata: { kind: "custom_openai", baseUrl: "https://llm.local/v1" },
    });
    await db.update(userCredentials).set({ ciphertext: "not-valid-ciphertext" }).where(eq(userCredentials.id, added.id));

    await expect(svc.resolve({ principal: principal(owner), source: "custom_openai" })).rejects.toMatchObject({
      code: "credential_decrypt_failed",
      retryable: false,
    });
  });

  test("custom_openai encrypted under a different key is a typed config failure, never keyless", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService(h.ctx);
    const owner = await seedUser(db, { id: "user_wrong_key", role: "user" });
    await svc.add({
      principal: principal(owner),
      provider: "custom_openai",
      key: "sk-encrypted",
      metadata: { kind: "custom_openai", baseUrl: "https://llm.local/v1" },
    });
    const wrongKeyService = createCredentialsService({ ...h.ctx, box: createSecretBox(Buffer.alloc(32, 42)) });

    await expect(wrongKeyService.resolve({ principal: principal(owner), source: "custom_openai" })).rejects.toBeInstanceOf(CredentialsDecryptError);
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
      // @orb-waive no-test-fabrication(unknown): a deliberately corrupt custom_openai row (no baseUrl) — proves the read seam returns null for it. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
      .set({ metadata: { kind: "custom_openai" } as unknown as ProviderMetadata })
      .where(eq(userCredentials.id, added.id));

    await expect(svc.resolve({ principal: principal(owner), source: "custom_openai" })).rejects.toMatchObject({ code: "credential_metadata_invalid" });
  });
});
