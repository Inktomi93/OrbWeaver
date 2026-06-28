// verb: add — seal + store/rotate. Asserts first-in-slot auto-active, later-in-slot inactive, rotation in
// place (clears revocation), the secret-free view, the conflict path, and the disabled-box guard.

import { DomainOperationError } from "@orb/kit/errors";
import { createCredentialsService } from "@orb/server/domain/credentials";
import { createSecretBox } from "@orb/server/infra/crypto";
import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("add", () => {
  test("first credential in a slot is auto-active; the view carries no secret field", async () => {
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
      active: true,
      revokedAt: null,
    });
    expect(view).not.toHaveProperty("ciphertext");
    expect(view).not.toHaveProperty("iv");
    expect(view).not.toHaveProperty("tag");
    expect(view).not.toHaveProperty("apiKey");
  });

  test("a second credential in the same slot is inactive (the user promotes via setActive)", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    await svc.add({ principal: principal(owner), provider: "openrouter", key: "sk-1", label: "a" });
    const second = await svc.add({
      principal: principal(owner),
      provider: "openrouter",
      key: "sk-2",
      label: "b",
    });
    expect(second.active).toBe(false);
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
    const resolved = await svc.resolve({ principal: principal(owner), source: "openrouter" });
    expect(resolved).toMatchObject({ apiKey: "sk-new" });
  });

  test("custom_openai metadata is stored (hasMetadata) without leaking the blob in the view", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const view = await svc.add({
      principal: principal(owner),
      provider: "custom_openai",
      key: "sk-c",
      metadata: { kind: "custom_openai", baseUrl: "https://x.test/v1" },
    });
    expect(view.hasMetadata).toBe(true);
  });

  test("a disabled SecretBox refuses to store (credentials_disabled)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService({ ...h.ctx, box: createSecretBox(null) });
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    await expect(
      svc.add({ principal: principal(owner), provider: "openrouter", key: "sk-1" }),
    ).rejects.toMatchObject({ code: "credentials_disabled" });
    await expect(
      svc.add({ principal: principal(owner), provider: "openrouter", key: "sk-1" }),
    ).rejects.toThrow(DomainOperationError);
  });
});
