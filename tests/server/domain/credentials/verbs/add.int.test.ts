// verb: add — seal + store a NEW credential; it never overwrites an existing key (a taken label gets the next
// free one). Replacing a key's secret is the `replace` verb (replace.int.test.ts).

import type { ProviderId } from "@orb/contracts/inference";
import { builtinProvider, providerDefSchema } from "@orb/contracts/inference";
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

  test("the provider is judged as the CALLER: a plugin row served only to its installer is refused to anyone else", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const installer = await seedUser(db, { id: "user_installer", role: "user" });
    const stranger = await seedUser(db, { id: "user_stranger", role: "user" });
    const relay = providerDefSchema.parse({
      id: "plugin:relay/anthropic",
      label: "Anthropic",
      wire: "openai-compat",
      dialect: "openai-compatible",
      auth: "apiKey",
      baseUrl: "https://relay.plugin-author.example/v1",
      apis: ["chat-completions"],
      catalog: "url",
      metered: false,
    });
    // The registry's scoped read, as compose binds it: the row exists only for the owner of the enabled install.
    const svc = createCredentialsService({
      ...h.ctx,
      findProvider: (requested, viewer) => (requested === relay.id && viewer === installer ? relay : undefined),
    });

    await expect(svc.add({ principal: principal(stranger), provider: relay.id, key: "sk-stranger" })).rejects.toMatchObject({
      code: CREDENTIALS_OP_CODES.providerUnknown,
    });
    expect(await db.select().from(userCredentials)).toEqual([]);
    expect(await svc.add({ principal: principal(installer), provider: relay.id, key: "sk-installer" })).toMatchObject({ provider: relay.id });
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

  // A second unlabelled key must not move every connection on the "default" key to a new secret.
  test("an unlabelled second key is a distinct credential and the default key keeps its secret", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const first = await svc.add({ principal: principal(owner), provider: "openrouter", key: "sk-old" });
    const second = await svc.add({ principal: principal(owner), provider: "openrouter", key: "sk-new" });

    expect(second.id).not.toBe(first.id);
    expect(second.label).not.toBe(first.label);
    const openrouter = castId<ProviderId>("openrouter");
    expect(await svc.resolve({ ownerId: owner, credentialId: first.id, providerId: openrouter })).toMatchObject({ secret: "sk-old" });
    expect(await svc.resolve({ ownerId: owner, credentialId: second.id, providerId: openrouter })).toMatchObject({ secret: "sk-new" });
  });

  test("a taken explicit label is never overwritten: the new key gets the next free label", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const first = await svc.add({ principal: principal(owner), provider: "openrouter", label: "work", key: "sk-work" });
    const second = await svc.add({ principal: principal(owner), provider: "openrouter", label: "work", key: "sk-other" });

    expect(second.id).not.toBe(first.id);
    expect(second.label).not.toBe("work");
    expect(await svc.resolve({ ownerId: owner, credentialId: first.id, providerId: castId<ProviderId>("openrouter") })).toMatchObject({ secret: "sk-work" });
  });

  test("the same label on another provider is its own slot", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    await svc.add({ principal: principal(owner), provider: "openrouter", key: "sk-or" });
    const anthropic = await svc.add({ principal: principal(owner), provider: "anthropic", key: "sk-ant" });
    expect(anthropic.label).toBe("default");
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

  test("an add audits credential.add attributed to the owner", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService(h.ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const view = await svc.add({ principal: principal(owner), provider: "openrouter", key: "sk-1" });
    const audit = h.audits.find((a) => a.entry.action === "credential.add");
    expect(audit?.entry).toMatchObject({ actorUserId: owner, entityType: "credential", entityId: view.id });
    expect(audit?.entry.metadata).toMatchObject({ provider: "openrouter", label: "default" });
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
