// verb: resolve — the turn-time credential chokepoint, BY ID off the connection row (inference program §5.3).
// The security core: the keyless arm (`credentialId: null` ⇒ `kind: none`), the AES-256-GCM AAD binding (a row
// lifted to another owner or sealed under another provider id WON'T decrypt — the GCM tag mismatch becomes the
// typed config error), the metadata `auth` discriminator → secret KIND, and the revoked/missing/foreign →
// no-credential floor with no silent fallback. Real db + real SecretBox.

import type { ProviderId } from "@orb/contracts/inference";
import { userCredentials } from "@orb/db";
import { DomainNoCredentialError } from "@orb/kit/errors";
import { castId } from "@orb/kit/ids";
import { CredentialsDecryptError, createCredentialsService } from "@orb/server/domain/credentials";
import { createSecretBox } from "@orb/server/infra/crypto";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

const OPENROUTER = castId<ProviderId>("openrouter");
const CLAUDE_SUB = castId<ProviderId>("claude-sub");
const VLLM = castId<ProviderId>("vllm");

describe("resolve", () => {
  test("the keyless arm: a null credentialId mints `kind: none` with no row read and no secret", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });

    const resolved = await svc.resolve({ ownerId: owner, credentialId: null, providerId: VLLM });
    expect(resolved).toMatchObject({ kind: "none", credentialId: null, secret: null });
  });

  test("an API key round-trips: add seals it, resolve BY ID decrypts the SAME plaintext as `kind: apiKey`", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const added = await svc.add({ principal: principal(owner), provider: "openrouter", key: "sk-or-secret" });

    const resolved = await svc.resolve({ ownerId: owner, credentialId: added.id, providerId: OPENROUTER });
    expect(resolved).toMatchObject({ kind: "apiKey", credentialId: added.id, secret: "sk-or-secret" });
  });

  test("the metadata `auth` arm names the KIND: a pasted setup-token is `oauthToken`, an endpoint bearer is `bearer`", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const token = await svc.add({ principal: principal(owner), provider: "claude-sub", key: "sk-ant-oat01-…", metadata: { auth: "oauthToken" } });
    const bearer = await svc.add({ principal: principal(owner), provider: "vllm", key: "vllm-bearer", metadata: { auth: "endpoint" } });

    expect(await svc.resolve({ ownerId: owner, credentialId: token.id, providerId: CLAUDE_SUB })).toMatchObject({ kind: "oauthToken", secret: "sk-ant-oat01-…" });
    expect(await svc.resolve({ ownerId: owner, credentialId: bearer.id, providerId: VLLM })).toMatchObject({ kind: "bearer", secret: "vllm-bearer" });
  });

  test("a stored key with a MISSING runtime box fails as decrypt-unavailable, never absent or keyless", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const enabledService = createCredentialsService(harness.ctx);
    const owner = await seedUser(db, { id: "user_missing_runtime_key", role: "user" });
    const added = await enabledService.add({ principal: principal(owner), provider: "openrouter", key: "sk-or-stored" });

    const disabledService = createCredentialsService({ ...harness.ctx, box: createSecretBox(null) });
    await expect(disabledService.resolve({ ownerId: owner, credentialId: added.id, providerId: OPENROUTER })).rejects.toBeInstanceOf(CredentialsDecryptError);

    const recovered = await enabledService.resolve({ ownerId: owner, credentialId: added.id, providerId: OPENROUTER });
    expect(recovered).toMatchObject({ kind: "apiKey", secret: "sk-or-stored" });
  });

  test("AAD binding: a row LIFTED to another owner fails with the typed decrypt/config error", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const alice = await seedUser(db, { id: "user_alice", role: "user" });
    const bob = await seedUser(db, { id: "user_bob", role: "user" });
    const added = await svc.add({ principal: principal(alice), provider: "openrouter", key: "sk-alice" });

    // Lift Alice's row into Bob's slot (the attack the AAD belt defends against). The ciphertext was
    // bound to `alice|openrouter`; decrypting it as `bob|openrouter` fails the GCM tag check.
    await db.update(userCredentials).set({ ownerId: bob }).where(eq(userCredentials.id, added.id));

    await expect(svc.resolve({ ownerId: bob, credentialId: added.id, providerId: OPENROUTER })).rejects.toBeInstanceOf(CredentialsDecryptError);
    // Alice (the original AAD slot) no longer owns the row, so she has nothing to resolve either.
    await expect(svc.resolve({ ownerId: alice, credentialId: added.id, providerId: OPENROUTER })).rejects.toThrow(DomainNoCredentialError);
  });

  test("AAD binding: the provider id is the OTHER half — a row resolved under a different provider id decrypt-fails", async () => {
    // The connection row names the provider; a credential sealed under `openrouter` handed to an `anthropic`
    // connection must not open (the F2 respelling rationale: the id is half the AAD).
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const added = await svc.add({ principal: principal(owner), provider: "openrouter", key: "sk-or" });

    await expect(svc.resolve({ ownerId: owner, credentialId: added.id, providerId: castId<ProviderId>("anthropic") })).rejects.toBeInstanceOf(CredentialsDecryptError);
  });

  test("a missing or FOREIGN credential id is the typed no-credential floor (no silent fallback)", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const other = await seedUser(db, { id: "user_other", role: "user" });
    const theirs = await svc.add({ principal: principal(other), provider: "openrouter", key: "sk-theirs" });

    await expect(svc.resolve({ ownerId: owner, credentialId: castId("user_credential_missing"), providerId: OPENROUTER })).rejects.toThrow(DomainNoCredentialError);
    await expect(svc.resolve({ ownerId: owner, credentialId: theirs.id, providerId: OPENROUTER })).rejects.toThrow(DomainNoCredentialError);
  });

  test("a USER-revoked credential does NOT resolve (falls through to the floor)", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const added = await svc.add({ principal: principal(owner), provider: "openrouter", key: "sk-or" });
    await svc.markRevokedByUser({ principal: principal(owner), credentialId: added.id });
    await expect(svc.resolve({ ownerId: owner, credentialId: added.id, providerId: OPENROUTER })).rejects.toThrow(DomainNoCredentialError);
  });

  test("a STRIKE-OUT-revoked credential does NOT resolve either (#1373 — the loop the strike exists to break)", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const added = await svc.add({ principal: principal(owner), provider: "vllm", key: "sk-custom", metadata: { auth: "endpoint" } });
    await svc.maybeRevokeOnAuthFailed({ ownerId: owner, credentialId: added.id, errorKind: "auth_failed", errorMessage: "the endpoint rejected the key" });

    await expect(svc.resolve({ ownerId: owner, credentialId: added.id, providerId: VLLM })).rejects.toThrow(DomainNoCredentialError);
  });

  test("malformed ciphertext is a typed non-retryable config failure, never keyless", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService(h.ctx);
    const owner = await seedUser(db, { id: "user_bad_ciphertext", role: "user" });
    const added = await svc.add({ principal: principal(owner), provider: "openrouter", key: "sk-valid-before-corruption" });
    await db.update(userCredentials).set({ ciphertext: "not-valid-ciphertext" }).where(eq(userCredentials.id, added.id));

    await expect(svc.resolve({ ownerId: owner, credentialId: added.id, providerId: OPENROUTER })).rejects.toMatchObject({
      code: "credential_decrypt_failed",
      retryable: false,
    });
  });

  test("a row encrypted under a DIFFERENT box key is a typed config failure, never keyless", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService(h.ctx);
    const owner = await seedUser(db, { id: "user_wrong_key", role: "user" });
    const added = await svc.add({ principal: principal(owner), provider: "openrouter", key: "sk-encrypted" });
    const wrongKeyService = createCredentialsService({ ...h.ctx, box: createSecretBox(Buffer.alloc(32, 42)) });

    await expect(wrongKeyService.resolve({ ownerId: owner, credentialId: added.id, providerId: OPENROUTER })).rejects.toBeInstanceOf(CredentialsDecryptError);
  });
});
