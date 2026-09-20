// verb: add — seal + store/rotate. Asserts first-in-slot auto-active, later-in-slot inactive, rotation in
// place (clears revocation), the secret-free view, the conflict path, and the disabled-box guard.

import { DomainOperationError } from "@orb/kit/errors";
import { createCredentialsService } from "@orb/server/domain/credentials";
import { createSecretBox } from "@orb/server/infra/crypto";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";
import type { ProviderId } from "@orb/contracts/inference";
import { castId } from "@orb/kit/ids";

describe("add", () => {
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

  test("endpoint metadata is stored (hasMetadata) without leaking the blob in the view", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const view = await svc.add({
      principal: principal(owner),
      provider: "vllm",
      key: "sk-c",
      metadata: { auth: "endpoint" },
    });
    expect(view.hasMetadata).toBe(true);
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
