// verbs: list · get · create · update · remove — the `user_connections` writer. What is pinned here is the
// set of refusals that make a STORED row coherent by construction (the resolver never re-decides them): the
// provider is registered, the api is one the row lists, an endpoint row carries a URL and a hosted one does
// not, the URL passes the F12 admission, the credential is the caller's, the label is unique per owner. Plus
// the two reads' owner fence (a stranger's row is `not found`, never `forbidden` — no existence oracle), the
// FIELD-WISE patch (an absent key is NOT overwritten), and the PD-139a embed-space trigger's exact condition.

import type { Principal } from "@orb/contracts/identity";
import type { UserCredentialId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { CONNECTION_OP_CODES } from "@orb/server/domain/connection";
import { endpointAdmission, publishPrivateEndpointAllowlist } from "@orb/server/infra/network";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { principal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { BYO_BASE_URL, BYO_PROVIDER, makeHarness, seedOwner, seedUser } from "../_support.ts";

const CREDENTIAL_ID = castId<UserCredentialId>("user_credential_000001");

describe("create", () => {
  test("user_connections.model refuses a blank foreign id before persistence", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    await expect(
      h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "   " }),
    ).rejects.toMatchObject({ code: CONNECTION_OP_CODES.taskUnservable });
    expect(await h.svc.list({ principal: owner.principal })).toEqual([]);
  });

  test("imagery_generations.provider cannot originate from an unregistered connection provider", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    await expect(
      h.svc.create({ principal: owner.principal, providerId: "no-such-provider", credentialId: null, baseUrl: BYO_BASE_URL, model: "image-model" }),
    ).rejects.toMatchObject({ code: CONNECTION_OP_CODES.providerUnknown });
    expect(await h.svc.list({ principal: owner.principal })).toEqual([]);
  });

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

  // F12's whole point, and the half no infra-tier test can state: the admission is per-DEPLOYMENT, so it is
  // judged the SAME for every principal. What it replaced was an owner-ROW derivation that published
  // whatever endpoints the `users.role='owner'` row had saved — a one-box premise (owner word 2026-09-19,
  // "not specific to my box"). This arm runs the REAL `endpointAdmission` against the REAL published set
  // with two principals that differ only in `role`, so a future "…unless they are the owner" shortcut at
  // this seam is a RED here rather than a quiet re-privileging of one human.
  test("the F12 admission is per-DEPLOYMENT, not per-principal — the box OWNER is refused exactly what a member is", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { admission: endpointAdmission });
    const owner = principal(await seedUser(db, "user_box_owner"), { role: "owner" });
    const member = principal(await seedUser(db, "user_member"));
    const create = (who: Principal): ReturnType<typeof h.svc.create> =>
      h.svc.create({ principal: who, providerId: BYO_PROVIDER, credentialId: null, baseUrl: "http://127.0.0.1:8703/v1", model: "qwen3" });

    // A fresh multi-user install admits nothing — including to the box owner.
    publishPrivateEndpointAllowlist([]);
    await expect(create(owner)).rejects.toMatchObject({ code: CONNECTION_OP_CODES.baseUrlRefused });
    await expect(create(member)).rejects.toMatchObject({ code: CONNECTION_OP_CODES.baseUrlRefused });

    // The admin admits the host once, and BOTH principals may author the row — no per-principal arm either way.
    publishPrivateEndpointAllowlist(["127.0.0.1"]);
    expect((await create(owner)).baseUrl).toBe("http://127.0.0.1:8703/v1");
    expect((await create(member)).baseUrl).toBe("http://127.0.0.1:8703/v1");
    publishPrivateEndpointAllowlist([]); // module state — leave the guard as this file found it
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

  test("a builtin catalog is closed: an id outside it is refused before persistence, a listed one is stored", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    await expect(
      h.svc.create({ principal: owner.principal, providerId: "local-light", credentialId: null, baseUrl: null, model: "Xenova/not-a-shipped-model" }),
    ).rejects.toMatchObject({ code: CONNECTION_OP_CODES.modelNotInCatalog });
    expect(await h.svc.list({ principal: owner.principal })).toEqual([]);
    const stored = await h.svc.create({
      principal: owner.principal,
      providerId: "local-light",
      credentialId: null,
      baseUrl: null,
      model: "jinaai/jina-clip-v2",
    });
    expect(stored.model).toBe("jinaai/jina-clip-v2");
  });

  test("a url catalog admits an id its list may lag — the closed-set refusal is builtin-only", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const view = await h.svc.create({
      principal: owner.principal,
      providerId: BYO_PROVIDER,
      credentialId: null,
      baseUrl: BYO_BASE_URL,
      model: "not-in-any-list",
      modelListed: false,
    });
    expect(view).toMatchObject({ model: "not-in-any-list", modelListed: false });
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

  test("a patch that moves a builtin row's model outside its catalog is refused and the stored model stands", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const created = await h.svc.create({
      principal: owner.principal,
      providerId: "local-light",
      credentialId: null,
      baseUrl: null,
      model: "jinaai/jina-clip-v2",
    });
    await expect(h.svc.update({ principal: owner.principal, connectionId: created.id, patch: { model: "Xenova/typo-model" } })).rejects.toMatchObject({
      code: CONNECTION_OP_CODES.modelNotInCatalog,
    });
    expect((await h.svc.get({ principal: owner.principal, connectionId: created.id })).model).toBe("jinaai/jina-clip-v2");
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

  // THE TRIGGER'S CONDITION IS THE RESOLVED SPACE TAG, not a column diff (§10-4). The predicate this
  // replaced was `model changed || declared !== undefined`, which is wrong in BOTH directions: any
  // `declared` edit forced a full box-wide purge+reindex, and a `declared` edit that genuinely moved the
  // space was indistinguishable from one that did not. Both arms are pinned here because the expensive
  // mistake (over-firing) and the silent one (under-firing) have opposite fixes.
  test("a `declared` edit fires the embed-space trigger only when it MOVES the resolved space", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const vector = await h.svc.create({
      principal: owner.principal,
      providerId: BYO_PROVIDER,
      credentialId: null,
      baseUrl: BYO_BASE_URL,
      model: "bge-m3",
      declared: { kind: "embedding", embedding: { dtype: "q8" } },
      allowBackground: true,
    });
    await h.svc.setBinding({ principal: owner.principal, task: "embed", connectionId: vector.id });
    h.embedSpaceChanges.length = 0;

    // An axis the space tag does not read. Same model, same dtype — nothing to re-embed.
    await h.svc.update({
      principal: owner.principal,
      connectionId: vector.id,
      patch: { declared: { kind: "embedding", embedding: { dtype: "q8", maxInputTokens: 4096 } } },
    });
    expect(h.embedSpaceChanges, "a declared edit that leaves the space tag alone is not a space change").toEqual([]);

    // The dtype IS the space (#2417): a re-quantised encoder produces different vectors, so the corpus is
    // stale even though `model` never moved — the case the column diff could not see.
    await h.svc.update({
      principal: owner.principal,
      connectionId: vector.id,
      patch: { declared: { kind: "embedding", embedding: { dtype: "fp16", maxInputTokens: 4096 } } },
    });
    expect(h.embedSpaceChanges, "a dtype flip IS a space change, with no model change to betray it").toEqual([owner.userId]);
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
