// verbs: list · get · create · update · remove — the `user_connections` writer. What is pinned here is the
// set of refusals that make a STORED row coherent by construction (the resolver never re-decides them): the
// provider is registered, the api is one the row lists, an endpoint row carries a URL and a hosted one does
// not, the URL passes the F12 admission, the credential is the caller's, the label is unique per owner. Plus
// the two reads' owner fence (a stranger's row is `not found`, never `forbidden` — no existence oracle), the
// FIELD-WISE patch (an absent key is NOT overwritten), and the PD-139a embed-space trigger's exact condition.

import type { UserCredentialId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { CONNECTION_OP_CODES } from "@orb/server/domain/connection";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { BYO_BASE_URL, BYO_PROVIDER, makeHarness, seedOwner } from "../_support.ts";

const CREDENTIAL_ID = castId<UserCredentialId>("user_credential_000001");

describe("create", () => {
  test("mints `<provider label> · <model>` and suffixes a collision, per owner", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const first = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "qwen3" });
    const second = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "qwen3" });
    expect(first.label).toBe("Custom OpenAI-compatible · qwen3");
    expect(second.label).toBe("Custom OpenAI-compatible · qwen3 (2)");
    // Another owner's identical row is NOT a collision — the label is unique per owner, not globally.
    const other = await seedOwner(db, "user_b");
    const theirs = await h.svc.create({ principal: other.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "qwen3" });
    expect(theirs.label).toBe("Custom OpenAI-compatible · qwen3");
  });

  test("an endpoint provider REQUIRES a base URL and a hosted provider must not carry one", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    await expect(
      h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: null, model: "qwen3" }),
    ).rejects.toMatchObject({ code: CONNECTION_OP_CODES.baseUrlShape });
    await expect(
      h.svc.create({ principal: owner.principal, providerId: "openrouter", credentialId: null, baseUrl: BYO_BASE_URL, model: "gpt-4o" }),
    ).rejects.toMatchObject({ code: CONNECTION_OP_CODES.baseUrlShape });
  });

  test("the F12 admission decides the URL: `refused` and `invalid` are distinct refusals", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { admission: (url) => (url.includes("10.0.0.") ? "refused" : "invalid") });
    const owner = await seedOwner(db);
    await expect(
      h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: "http://10.0.0.5:8000/v1", model: "m" }),
    ).rejects.toMatchObject({ code: CONNECTION_OP_CODES.baseUrlRefused });
    await expect(
      h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: "ftp://box/v1", model: "m" }),
    ).rejects.toMatchObject({ code: CONNECTION_OP_CODES.baseUrlInvalid });
  });

  test("a credential the caller does not hold is refused", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { credentialOwned: (): boolean => false });
    const owner = await seedOwner(db);
    await expect(
      h.svc.create({ principal: owner.principal, providerId: "openrouter", credentialId: CREDENTIAL_ID, baseUrl: null, model: "gpt-4o" }),
    ).rejects.toMatchObject({ code: CONNECTION_OP_CODES.credentialForeign });
  });

  test("an unregistered provider, an api the provider does not speak, and a blank model are each refused", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    await expect(
      h.svc.create({ principal: owner.principal, providerId: "no-such-provider", credentialId: null, baseUrl: BYO_BASE_URL, model: "m" }),
    ).rejects.toMatchObject({ code: CONNECTION_OP_CODES.providerUnknown });
    await expect(
      h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "m", api: "anthropic-messages" }),
    ).rejects.toMatchObject({ code: CONNECTION_OP_CODES.apiIncoherent });
    await expect(
      h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "   " }),
    ).rejects.toMatchObject({ code: CONNECTION_OP_CODES.taskUnservable });
  });

  test("writes one durable audit row naming the provider and model", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const view = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "qwen3" });
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]?.entry).toMatchObject({
      actorUserId: owner.userId,
      action: "connection.create",
      entityType: "connection",
      entityId: view.id,
      metadata: { providerId: "custom-openai", model: "qwen3" },
    });
  });
});

describe("list / get", () => {
  test("read only the caller's rows; a stranger's id reads NOT FOUND, never forbidden", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const other = await seedOwner(db, "user_b");
    const mine = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "b-model" });
    await h.svc.create({ principal: other.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "theirs" });
    const listed = await h.svc.list({ principal: owner.principal });
    expect(listed.map((row) => row.id)).toEqual([mine.id]);
    await expect(h.svc.get({ principal: other.principal, connectionId: mine.id })).rejects.toMatchObject({ code: CONNECTION_OP_CODES.notFound });
  });

  test("the view carries the provider label and the tasks the row may serve", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const created = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "qwen3" });
    const view = await h.svc.get({ principal: owner.principal, connectionId: created.id });
    expect(view.providerLabel).toBe("Custom OpenAI-compatible");
    // A generation model on the BYO endpoint: the four generation tasks, and no vector task.
    expect([...view.tasks].toSorted()).toEqual(["chat", "generateImage", "structured", "summarize"]);
  });
});

describe("update", () => {
  test("the patch is FIELD-WISE: a key the patch omits keeps its stored value", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const created = await h.svc.create({
      principal: owner.principal,
      providerId: BYO_PROVIDER,
      credentialId: null,
      baseUrl: BYO_BASE_URL,
      model: "qwen3",
      label: "my box",
      extras: { temperature: 0.5 },
      modelListed: false,
      allowBackground: true,
    });
    const updated = await h.svc.update({ principal: owner.principal, connectionId: created.id, patch: { model: "qwen3-next" } });
    expect(updated).toMatchObject({
      model: "qwen3-next",
      label: "my box",
      extras: { temperature: 0.5 },
      modelListed: false,
      allowBackground: true,
      baseUrl: BYO_BASE_URL,
    });
  });

  test("a stranger cannot patch the row, and the stored row is untouched", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const other = await seedOwner(db, "user_b");
    const created = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "qwen3" });
    await expect(h.svc.update({ principal: other.principal, connectionId: created.id, patch: { model: "stolen" } })).rejects.toMatchObject({
      code: CONNECTION_OP_CODES.notFound,
    });
    expect((await h.svc.get({ principal: owner.principal, connectionId: created.id })).model).toBe("qwen3");
  });

  test("a model change raises the embed-space trigger ONLY for a row bound to a vector task", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const chat = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "qwen3" });
    await h.svc.update({ principal: owner.principal, connectionId: chat.id, patch: { model: "qwen3-next" } });
    expect(h.embedSpaceChanges).toEqual([]);

    const vector = await h.svc.create({
      principal: owner.principal,
      providerId: BYO_PROVIDER,
      credentialId: null,
      baseUrl: BYO_BASE_URL,
      model: "bge-m3",
      declared: { kind: "embedding" },
      allowBackground: true,
    });
    await h.svc.setBinding({ principal: owner.principal, task: "embed", connectionId: vector.id });
    h.embedSpaceChanges.length = 0;
    await h.svc.update({ principal: owner.principal, connectionId: vector.id, patch: { label: "renamed" } });
    expect(h.embedSpaceChanges, "a label change is not a space change").toEqual([]);
    await h.svc.update({ principal: owner.principal, connectionId: vector.id, patch: { model: "bge-m3-v2" } });
    expect(h.embedSpaceChanges).toEqual([owner.userId]);
  });
});

describe("remove", () => {
  test("deletes the caller's row and raises the embed-space trigger only when it was vector-bound", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const chat = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "qwen3" });
    await h.svc.remove({ principal: owner.principal, connectionId: chat.id });
    expect(await h.svc.list({ principal: owner.principal })).toEqual([]);
    expect(h.embedSpaceChanges).toEqual([]);

    const vector = await h.svc.create({
      principal: owner.principal,
      providerId: BYO_PROVIDER,
      credentialId: null,
      baseUrl: BYO_BASE_URL,
      model: "bge-m3",
      declared: { kind: "embedding" },
      allowBackground: true,
    });
    await h.svc.setBinding({ principal: owner.principal, task: "embed", connectionId: vector.id });
    h.embedSpaceChanges.length = 0;
    await h.svc.remove({ principal: owner.principal, connectionId: vector.id });
    expect(h.embedSpaceChanges).toEqual([owner.userId]);
  });

  test("a stranger's remove is refused and the row survives", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const other = await seedOwner(db, "user_b");
    const created = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "qwen3" });
    await expect(h.svc.remove({ principal: other.principal, connectionId: created.id })).rejects.toMatchObject({ code: CONNECTION_OP_CODES.notFound });
    expect((await h.svc.list({ principal: owner.principal })).map((row) => row.id)).toEqual([created.id]);
  });
});
