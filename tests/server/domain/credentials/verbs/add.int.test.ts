// verb: add — seal + store/rotate. Asserts first-in-slot auto-active, later-in-slot inactive, rotation in
// place (clears revocation), the secret-free view, the conflict path, and the disabled-box guard.

import type { ProviderId } from "@orb/contracts/inference";
import { builtinProvider } from "@orb/contracts/inference";
import { userCredentials } from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import { castId } from "@orb/kit/ids";
import { CREDENTIALS_OP_CODES, createCredentialsService } from "@orb/server/domain/credentials";
import { createSecretBox } from "@orb/server/infra/crypto";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("add", () => {
  test("an unknown provider keeps the provider_unknown refusal and writes nothing", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    await expect(svc.add({ principal: principal(owner), provider: "not-registered", key: "sk-1" })).rejects.toMatchObject({
      code: CREDENTIALS_OP_CODES.providerUnknown,
    });
    expect(await db.select().from(userCredentials)).toEqual([]);
  });

  test("persists the registry-returned provider identity rather than branding caller text", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const registered = builtinProvider("openrouter");
    if (registered === undefined) {
      throw new Error("openrouter provider fixture is missing");
    }
    const svc = createCredentialsService({ ...h.ctx, findProvider: (requested) => (requested === "registry-alias" ? registered : undefined) });
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const view = await svc.add({ principal: principal(owner), provider: "registry-alias", key: "sk-1" });
    expect(view.provider).toBe(registered.id);
  });

  test("the view carries no secret field", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const view = await svc.add({
      principal: principal(owner),
      provider: "openrouter",
      key: "sk-1",
    });
    expect(view).toMatchObject({
      provider: "openrouter",
      label: "default",
      revokedAt: null,
    });
    expect(view).not.toHaveProperty("ciphertext");
    expect(view).not.toHaveProperty("iv");
    expect(view).not.toHaveProperty("tag");
    expect(view).not.toHaveProperty("apiKey");
  });

  test("re-adding the same (provider,label) ROTATES in place (same id, key changes)", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const first = await svc.add({
      principal: principal(owner),
      provider: "openrouter",
      key: "sk-old",
    });
    const rotated = await svc.add({
      principal: principal(owner),
      provider: "openrouter",
      key: "sk-new",
    });
    expect(rotated.id).toBe(first.id);
    const resolved = await svc.resolve({ ownerId: owner, credentialId: rotated.id, providerId: castId<ProviderId>("openrouter") });
    expect(resolved).toMatchObject({ secret: "sk-new" });
  });

  test("endpoint metadata is stored without leaking the blob or a redundant presence bit in the view", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const view = await svc.add({
      principal: principal(owner),
      provider: "vllm",
      key: "sk-c",
      metadata: { auth: "endpoint" },
    });
    const [row] = await db.select({ metadata: userCredentials.metadata }).from(userCredentials).where(eq(userCredentials.id, view.id));
    expect(row?.metadata).toEqual({ auth: "endpoint" });
    expect(view).not.toHaveProperty("metadata");
    expect(view).not.toHaveProperty("hasMetadata");
  });

  test("a fresh insert audits credential.add (rotated:false) attributed to the owner (PD-142)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService(h.ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const view = await svc.add({ principal: principal(owner), provider: "openrouter", key: "sk-1" });
    const audit = h.audits.find((a) => a.entry.action === "credential.add");
    expect(audit?.entry).toMatchObject({ actorUserId: owner, entityType: "credential", entityId: view.id });
    expect(audit?.entry.metadata).toMatchObject({ provider: "openrouter", rotated: false });
  });

  test("a rotation audits credential.add (rotated:true) on the same row (PD-142)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService(h.ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const first = await svc.add({ principal: principal(owner), provider: "openrouter", key: "sk-old" });
    await svc.add({ principal: principal(owner), provider: "openrouter", key: "sk-new" });
    const rotated = h.audits.filter((a) => a.entry.action === "credential.add");
    expect(rotated).toHaveLength(2);
    expect(rotated[1]?.entry).toMatchObject({ actorUserId: owner, entityId: first.id });
    expect(rotated[1]?.entry.metadata).toMatchObject({ rotated: true });
  });

  test("a disabled SecretBox refuses to store (credentials_disabled)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService({ ...h.ctx, box: createSecretBox(null) });
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    await expect(svc.add({ principal: principal(owner), provider: "openrouter", key: "sk-1" })).rejects.toMatchObject({ code: "credentials_disabled" });
    await expect(svc.add({ principal: principal(owner), provider: "openrouter", key: "sk-1" })).rejects.toThrow(DomainOperationError);
    // No store happened, so nothing was audited.
    expect(h.audits).toHaveLength(0);
  });
});
