// verbs: resolve · availability · resolveChatCapability · capabilities — thin delegations whose ONE local
// decision is the PROJECTION. The pins that matter: `resolve` hands back the full `Resolved` (credential
// included — it is the turn's input), while `resolveChatCapability` hands back the credential-free view;
// `availability` answers a VERDICT where `resolve` throws; and `capabilities` refuses a row that is not the
// caller's rather than describing a stranger's model.

import type { GenerationCapability, ProviderId } from "@orb/contracts/inference";
import { CONNECTION_OP_CODES, requireGenerationCapability } from "@orb/contracts/inference";
import { NoConnectionError } from "@orb/inference";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { hasStructuredWriter, hasToolWriter } from "../../../../../packages/server/src/domain/rpg/substrate/readonly-axis.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { BYO_BASE_URL, BYO_PROVIDER, makeHarness, seedOwner } from "../_support.ts";

const OLLAMA = castId<ProviderId>("ollama");
const OLLAMA_URL = "http://127.0.0.1:11434";

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

  // The Game-mode path end to end: an own-server model nothing states tools for has no write path until the
  // user declares them on the connection, and the declaration is what the next resolve hands the game.
  test("declared tool calls and structured output reach the resolved chat capability and give a game its write path", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const row = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "llama3.1:8b" });
    const generationOf = async (): Promise<GenerationCapability> =>
      requireGenerationCapability((await h.runtime.resolve({ task: "chat", principal: owner.principal, connectionId: row.id })).resolved.capability);
    expect(hasToolWriter(await generationOf())).toBe(false);
    expect(hasStructuredWriter(await generationOf())).toBe(false);

    await h.svc.update({
      principal: owner.principal,
      connectionId: row.id,
      patch: { declared: { generation: { tools: { parallel: false }, output: { structured: true } } } },
    });
    expect(hasToolWriter(await generationOf())).toBe(true);
    expect(hasStructuredWriter(await generationOf())).toBe(true);
  });

  // Ollama's `/v1/models` carries no window and truncates at its own `num_ctx`; the trained maximum in
  // `model_info` is NOT that window. A server whose native read fails still lists, and its window reads assumed.
  test("an Ollama row reads the window the server truncates at, never the trained maximum, and an unreported one is assumed", async () => {
    const models = { match: "/v1/models", json: { data: [{ id: "llama3.1:8b" }] } };
    const show = {
      match: "/api/show",
      json: {
        parameters: 'num_ctx                        16384\nstop                           "<|eot_id|>"',
        ["model_info"]: { ["llama.context_length"]: 131_072 },
      },
    };
    const db = await freshDb();
    const owner = await seedOwner(db);
    const reporting = await makeHarness(db, { routes: [models, show, { match: "/api/ps", json: { models: [] } }] });
    const row = await reporting.svc.create({ principal: owner.principal, providerId: OLLAMA, credentialId: null, baseUrl: OLLAMA_URL, model: "llama3.1:8b" });
    const read = await reporting.svc.capabilities({ principal: owner.principal, connectionId: row.id });
    expect(read.capability).toMatchObject({ kind: "generation", generation: { context: { window: 16_384 } } });
    expect(read.capability.kind === "generation" ? read.capability.generation.context.windowEstimated : "not generation").toBeUndefined();
    expect(reporting.requests.map((request) => request.url)).toContain("http://127.0.0.1:11434/api/show");

    const silentDb = await freshDb();
    const silent = await makeHarness(silentDb, { routes: [models] });
    const silentOwner = await seedOwner(silentDb);
    const unreported = await silent.svc.create({
      principal: silentOwner.principal,
      providerId: OLLAMA,
      credentialId: null,
      baseUrl: OLLAMA_URL,
      model: "llama3.1:8b",
    });
    const assumed = await silent.svc.capabilities({ principal: silentOwner.principal, connectionId: unreported.id });
    expect(assumed.capability).toMatchObject({ kind: "generation", generation: { context: { windowEstimated: true } } });
  });
});
