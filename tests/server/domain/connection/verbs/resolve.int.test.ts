// verbs: resolve · availability · resolveChatCapability · capabilities — thin delegations whose ONE local
// decision is the PROJECTION. The pins that matter: `resolve` hands back the full `Resolved` (credential
// included — it is the turn's input), while `resolveChatCapability` hands back the credential-free view;
// `availability` answers a VERDICT where `resolve` throws; and `capabilities` refuses a row that is not the
// caller's rather than describing a stranger's model.

import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import { NoConnectionError } from "@orb/inference";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { BYO_BASE_URL, BYO_PROVIDER, makeHarness, seedOwner } from "../_support.ts";

describe("resolveChatCapability — the target", () => {
  test("a role target resolves through that role's binding, and a connection target names the row itself", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const chat = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "chat-m" });
    const utility = await h.svc.create({
      principal: owner.principal,
      providerId: BYO_PROVIDER,
      credentialId: null,
      baseUrl: BYO_BASE_URL,
      model: "util-m",
      allowBackground: true,
    });
    const spare = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "spare-m" });
    await h.svc.setBinding({ principal: owner.principal, task: "chat", connectionId: chat.id });
    await h.svc.setBinding({ principal: owner.principal, task: "summarize", connectionId: utility.id });

    const byDefault = await h.svc.resolveChatCapability({ principal: owner.principal });
    const byRole = await h.svc.resolveChatCapability({ principal: owner.principal, target: { kind: "role", task: "summarize" } });
    const byRow = await h.svc.resolveChatCapability({ principal: owner.principal, target: { kind: "connection", connectionId: spare.id } });
    expect([byDefault.connectionId, byRole.connectionId, byRow.connectionId]).toEqual([chat.id, utility.id, spare.id]);
  });

  test("a role with nothing bound refuses as no connection, and another user's row reads NOT FOUND", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const other = await seedOwner(db, "user_b");
    const theirs = await h.svc.create({ principal: other.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "m" });
    await expect(h.svc.resolveChatCapability({ principal: owner.principal, target: { kind: "role", task: "summarize" } })).rejects.toBeInstanceOf(
      NoConnectionError,
    );
    await expect(h.svc.resolveChatCapability({ principal: owner.principal, target: { kind: "connection", connectionId: theirs.id } })).rejects.toMatchObject({
      code: CONNECTION_OP_CODES.notFound,
    });
  });
});

describe("resolve / availability", () => {
  test("an unbound task throws on resolve and reads `no-connection` on availability — never a born default", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "m" });
    await expect(h.svc.resolve({ task: "chat", principal: owner.principal })).rejects.toBeInstanceOf(NoConnectionError);
    expect(await h.svc.availability({ task: "chat", principal: owner.principal })).toEqual({ available: false, cause: "no-connection" });
  });

  test("the resolved turn input carries the credential; the chat-capability view never does", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const row = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "m" });
    await h.svc.setBinding({ principal: owner.principal, task: "chat", connectionId: row.id });

    const { resolved } = await h.svc.resolve({ task: "chat", principal: owner.principal });
    expect(resolved).toMatchObject({ task: "chat", connectionId: row.id, baseUrl: BYO_BASE_URL, ownerId: owner.userId });
    expect(resolved.credential).toBeDefined();

    const view = await h.svc.resolveChatCapability({ principal: owner.principal });
    expect(view).toEqual({
      task: "chat",
      connectionId: row.id,
      providerId: resolved.providerId,
      wire: resolved.wire,
      api: resolved.api,
      model: resolved.model,
      capability: resolved.capability,
      requirement: resolved.requirement,
    });
    expect(view).not.toHaveProperty("credential");
    expect(view).not.toHaveProperty("baseUrl");
  });

  test("an explicit connectionId bypasses the fold but not the owner fence", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const other = await seedOwner(db, "user_b");
    const mine = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "m" });
    const { resolved } = await h.svc.resolve({ task: "chat", principal: owner.principal, connectionId: mine.id });
    expect(resolved.connectionId).toBe(mine.id);
    // Someone else's principal against the same row: the funder fence refuses it rather than spending a
    // stranger's key.
    await expect(h.svc.resolve({ task: "chat", principal: other.principal, connectionId: mine.id })).rejects.toBeInstanceOf(NoConnectionError);
  });
});

describe("capabilities", () => {
  test("describes the caller's own row and refuses a stranger's", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const other = await seedOwner(db, "user_b");
    const row = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "m" });
    const read = await h.svc.capabilities({ principal: owner.principal, connectionId: row.id });
    expect(read.capability.kind).toBe("generation");
    expect([...read.tasks].toSorted()).toEqual(["chat", "generateImage", "structured", "summarize"]);
    await expect(h.svc.capabilities({ principal: other.principal, connectionId: row.id })).rejects.toThrow();
  });

  test("a declared embedding row is described as an embedding capability, not a chat one", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const row = await h.svc.create({
      principal: owner.principal,
      providerId: BYO_PROVIDER,
      credentialId: null,
      baseUrl: BYO_BASE_URL,
      model: "bge-m3",
      declared: { kind: "embedding", embedding: { dims: 768 } },
    });
    const read = await h.svc.capabilities({ principal: owner.principal, connectionId: row.id });
    expect(read.capability).toMatchObject({ kind: "embedding", embedding: { dims: 768 } });
    expect(read.baseline).toMatchObject({ kind: "embedding", embedding: { dims: 1024 } });
    expect([...read.tasks].toSorted()).toEqual(["embed", "imageEmbed"]);
  });
});
