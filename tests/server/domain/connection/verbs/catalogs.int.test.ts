// verbs: catalogModels · draftCatalogModels · refreshCatalog. The load-bearing behaviour is the DRAFT read
// (`draftCatalogModels`): it is the pane's SERVER-SIDE dial for a row that does not exist yet, so the F12
// admission and the credential-ownership belt must both run BEFORE any fetch leaves the box (a belt that ran
// after the dial would have already made the request it was there to prevent). Both reads answer one shape: a
// failed or empty dial is the typed-id FALLBACK — `{ listed: false, reason }`, with no model list — never a throw.

import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import type { UserCredentialId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createCredentialsService } from "@orb/server/domain/credentials";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness as makeCredentialHarness } from "../../credentials/_support.ts";
import { BYO_BASE_URL, BYO_PROVIDER, makeHarness, seedOwner } from "../_support.ts";

const CREDENTIAL_ID = castId<UserCredentialId>("user_credential_000001");
const MODELS_ROUTE = { match: "/models", json: { data: [{ id: "qwen3" }, { id: "qwen3-next" }] } };
const OPENROUTER_ROUTE = { match: "openrouter.ai", json: { data: [{ id: "anthropic/claude-opus-5", name: "Claude Opus 5" }] } };

describe("draftCatalogModels — an endpoint draft", () => {
  test("lists the endpoint's models through the injected fetch", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [MODELS_ROUTE] });
    const owner = await seedOwner(db);
    const result = await h.svc.draftCatalogModels({ principal: owner.principal, providerId: BYO_PROVIDER, baseUrl: BYO_BASE_URL });
    expect(result).toMatchObject({ listed: true, models: [{ id: "qwen3" }, { id: "qwen3-next" }] });
    expect(h.requests.at(0)?.url).toContain("/models");
  });

  test("a raw draft key rides the dial before any credential is saved", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [MODELS_ROUTE] });
    const owner = await seedOwner(db);
    const result = await h.svc.draftCatalogModels({ principal: owner.principal, providerId: "vllm", baseUrl: BYO_BASE_URL, key: "sk-typed" });
    expect(result.listed).toBe(true);
    expect(h.requests.map((request) => request.headers["authorization"])).toEqual(["Bearer sk-typed"]);
  });

  test("a REFUSED base URL is rejected BEFORE any request leaves the box", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [MODELS_ROUTE], admission: () => "refused" });
    const owner = await seedOwner(db);
    await expect(h.svc.draftCatalogModels({ principal: owner.principal, providerId: BYO_PROVIDER, baseUrl: "http://10.0.0.5:8000/v1" })).rejects.toMatchObject({
      code: CONNECTION_OP_CODES.baseUrlRefused,
    });
    expect(h.requests, "the SSRF belt must run before the dial, not after it").toEqual([]);
  });

  test("an invalid URL is refused, and a credential that is not the caller's is refused before the dial", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [MODELS_ROUTE], credentialOwned: (): boolean => false });
    const owner = await seedOwner(db);
    await expect(h.svc.draftCatalogModels({ principal: owner.principal, providerId: BYO_PROVIDER, baseUrl: "not-a-url" })).rejects.toMatchObject({
      code: CONNECTION_OP_CODES.baseUrlInvalid,
    });
    await expect(
      h.svc.draftCatalogModels({ principal: owner.principal, providerId: BYO_PROVIDER, baseUrl: BYO_BASE_URL, credentialId: CREDENTIAL_ID, key: "sk-typed" }),
    ).rejects.toMatchObject({ code: CONNECTION_OP_CODES.credentialForeign });
    expect(h.requests).toEqual([]);
  });

  test("an endpoint that lists NOTHING is `listed: false` with its own reason (0 models ≠ a failure)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [{ match: "/models", json: { data: [] } }] });
    const owner = await seedOwner(db);
    const result = await h.svc.draftCatalogModels({ principal: owner.principal, providerId: BYO_PROVIDER, baseUrl: BYO_BASE_URL });
    expect(result).toEqual({ listed: false, reason: "the provider listed no models" });
  });
});

// The add dialog's read BEFORE the row exists. Every arm below runs with ZERO `user_connections` rows — the
// point of the verb — and the refusal arms pin that the door judges the draft exactly as `create` would,
// before any request leaves the box.
describe("draftCatalogModels", () => {
  test("lists a hosted provider's catalog with no connection row", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [OPENROUTER_ROUTE] });
    const owner = await seedOwner(db);
    const result = await h.svc.draftCatalogModels({ principal: owner.principal, providerId: "openrouter", credentialId: CREDENTIAL_ID });
    expect(result).toMatchObject({ listed: true, models: [{ id: "anthropic/claude-opus-5", name: "Claude Opus 5" }] });
    expect(await h.svc.list({ principal: owner.principal })).toEqual([]);
  });

  test("the built-in provider lists its bundled models with no key, no URL and no HTTP", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const result = await h.svc.draftCatalogModels({ principal: owner.principal, providerId: "local-light" });
    expect(result.listed && result.models.map((entry) => entry.id)).toContain("jinaai/jina-clip-v2");
    expect(h.requests, "the builtin strategy must not dial anything").toEqual([]);
  });

  test("anthropic lists under the draft's saved credential", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [{ match: "api.anthropic.com/v1/models", json: { data: [{ id: "claude-opus-5" }] } }] });
    const owner = await seedOwner(db);
    const result = await h.svc.draftCatalogModels({ principal: owner.principal, providerId: "anthropic", credentialId: CREDENTIAL_ID });
    expect(result).toMatchObject({ listed: true, models: [{ id: "claude-opus-5" }] });
    expect(h.requests.map((request) => request.headers["x-api-key"])).toEqual(["sk-test"]);
  });

  test("an endpoint draft lists its own server", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [MODELS_ROUTE] });
    const owner = await seedOwner(db);
    const result = await h.svc.draftCatalogModels({ principal: owner.principal, providerId: BYO_PROVIDER, baseUrl: BYO_BASE_URL });
    expect(result).toMatchObject({ listed: true, models: [{ id: "qwen3" }, { id: "qwen3-next" }] });
  });

  test("a dial that fails is listed:false WITH the reason — never an empty success", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [{ match: "api.anthropic.com", status: 500, json: { error: "upstream exploded" } }] });
    const owner = await seedOwner(db);
    const result = await h.svc.draftCatalogModels({ principal: owner.principal, providerId: "anthropic", credentialId: CREDENTIAL_ID });
    expect(result.listed).toBe(false);
    expect(result).not.toHaveProperty("models");
    expect(!result.listed && result.reason).toMatch(/HTTP 500/u);
  });

  test("a credential that is not the caller's is refused with the credential-ownership error, before any dial", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [OPENROUTER_ROUTE], credentialOwned: (): boolean => false });
    const owner = await seedOwner(db);
    await expect(h.svc.draftCatalogModels({ principal: owner.principal, providerId: "anthropic", credentialId: CREDENTIAL_ID })).rejects.toMatchObject({
      code: CONNECTION_OP_CODES.credentialForeign,
    });
    expect(h.requests).toEqual([]);
  });

  test("the draft is judged as `create` judges a row: provider, base-URL shape and admission", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, {
      routes: [MODELS_ROUTE, OPENROUTER_ROUTE],
      admission: (baseUrl) => (baseUrl.includes("10.0.0.5") ? "refused" : "admitted"),
    });
    const owner = await seedOwner(db);
    const refusals = await Promise.allSettled([
      h.svc.draftCatalogModels({ principal: owner.principal, providerId: "no-such-provider" }),
      h.svc.draftCatalogModels({ principal: owner.principal, providerId: "openrouter", baseUrl: BYO_BASE_URL }),
      h.svc.draftCatalogModels({ principal: owner.principal, providerId: BYO_PROVIDER }),
      h.svc.draftCatalogModels({ principal: owner.principal, providerId: BYO_PROVIDER, baseUrl: "http://10.0.0.5:8000/v1" }),
    ]);
    expect(refusals.map((outcome) => (outcome.status === "rejected" ? (outcome.reason as { code?: string }).code : "resolved"))).toEqual([
      CONNECTION_OP_CODES.providerUnknown,
      CONNECTION_OP_CODES.baseUrlShape,
      CONNECTION_OP_CODES.baseUrlShape,
      CONNECTION_OP_CODES.baseUrlRefused,
    ]);
    expect(h.requests, "every refusal runs before the dial").toEqual([]);
  });
});

// A key is sealed under `owner|provider`, so a draft re-listed by its saved credential must open it under the
// provider the key was saved for. Run over the REAL credentials service: the default harness fake ignores the
// provider id, which is exactly the seam the bug hid in.
describe("a draft re-listed by a key saved under its own provider", () => {
  test("a vLLM key saved before the connection failed to save lists that server's models", async () => {
    const db = await freshDb();
    const owner = await seedOwner(db);
    const credentials = createCredentialsService(makeCredentialHarness(db).ctx);
    const saved = await credentials.add({ principal: owner.principal, provider: "vllm", key: "sk-vllm-draft" });
    const h = await makeHarness(db, { routes: [MODELS_ROUTE], resolveCredential: (args) => credentials.resolve(args) });
    const result = await h.svc.draftCatalogModels({ principal: owner.principal, providerId: "vllm", baseUrl: BYO_BASE_URL, credentialId: saved.id });
    expect(result).toMatchObject({ listed: true, models: [{ id: "qwen3" }, { id: "qwen3-next" }] });
    expect(h.requests.map((request) => request.headers["authorization"])).toEqual(["Bearer sk-vllm-draft"]);
  });
});

describe("catalogModels", () => {
  test("lists the row's own endpoint catalog, and refuses a row that is not the caller's", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [MODELS_ROUTE] });
    const owner = await seedOwner(db);
    const other = await seedOwner(db, "user_b");
    const row = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "qwen3" });
    const result = await h.svc.catalogModels({ principal: owner.principal, connectionId: row.id });
    expect(result).toMatchObject({ listed: true, models: [{ id: "qwen3" }, { id: "qwen3-next" }] });
    await expect(h.svc.catalogModels({ principal: other.principal, connectionId: row.id })).rejects.toMatchObject({
      code: CONNECTION_OP_CODES.notFound,
    });
  });

  test("a saved row whose list FAILS answers `listed: false` with the fetch's own reason and no model list", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [{ match: "/models", status: 500, json: { error: "boom" } }] });
    const owner = await seedOwner(db);
    const row = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "qwen3" });
    const result = await h.svc.catalogModels({ principal: owner.principal, connectionId: row.id });
    expect(result).toEqual({ listed: false, reason: expect.stringMatching(/HTTP 500/u) });
  });

  test("a saved row whose list is EMPTY says so, distinct from a failure", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [{ match: "/models", json: { data: [] } }] });
    const owner = await seedOwner(db);
    const row = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "qwen3" });
    expect(await h.svc.catalogModels({ principal: owner.principal, connectionId: row.id })).toEqual({ listed: false, reason: "the provider listed no models" });
  });

  test("a `builtin` catalog provider answers its curated rows without any HTTP", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const row = await h.svc.create({
      principal: owner.principal,
      providerId: "local-light",
      credentialId: null,
      baseUrl: null,
      model: "jinaai/jina-clip-v2",
    });
    const result = await h.svc.catalogModels({ principal: owner.principal, connectionId: row.id });
    expect(result.listed && result.models.map((entry) => entry.id)).toContain("jinaai/jina-clip-v2");
    expect(h.requests, "the builtin strategy must not dial anything").toEqual([]);
  });
});

describe("refreshCatalog", () => {
  test("INVALIDATES the mirror — the second refresh re-dials, where a cached read would not", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [{ match: "openrouter.ai", json: { data: [{ id: "a/b", name: "A B" }] } }] });
    const first = await h.svc.refreshCatalog({ providerId: "openrouter" });
    expect(first.models).toBeGreaterThan(0);
    const dialsAfterFirst = h.requests.length;
    expect(dialsAfterFirst).toBeGreaterThan(0);
    await h.svc.refreshCatalog({ providerId: "openrouter" });
    expect(h.requests.length, "a refresh that did not invalidate would serve the warm mirror").toBeGreaterThan(dialsAfterFirst);
  });

  test("an endpoint provider has no process-wide mirror to count — `null`, not 0", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    expect(await h.svc.refreshCatalog({ providerId: BYO_PROVIDER })).toEqual({ models: null });
  });
});
