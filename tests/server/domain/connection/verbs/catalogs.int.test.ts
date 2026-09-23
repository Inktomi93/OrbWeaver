// verbs: catalogModels · listEndpointModels · refreshCatalog. The load-bearing behaviour is
// `listEndpointModels`: it is the pane's SERVER-SIDE dial of a DRAFT endpoint, so the F12 admission and the
// credential-ownership belt must both run BEFORE any fetch leaves the box (a belt that ran after the dial
// would have already made the request it was there to prevent), and a failed/empty dial is the typed-id
// FALLBACK — `{ listed: false, reason }` — never a throw.

import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import type { UserCredentialId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { BYO_BASE_URL, BYO_PROVIDER, makeHarness, seedOwner } from "../_support.ts";

const CREDENTIAL_ID = castId<UserCredentialId>("user_credential_000001");
const MODELS_ROUTE = { match: "/models", json: { data: [{ id: "qwen3" }, { id: "qwen3-next" }] } };

describe("listEndpointModels", () => {
  test("lists the endpoint's models through the injected fetch", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [MODELS_ROUTE] });
    const owner = await seedOwner(db);
    const result = await h.svc.listEndpointModels({ principal: owner.principal, baseUrl: BYO_BASE_URL });
    expect(result.listed).toBe(true);
    expect(result.models.map((row) => row.id)).toEqual(["qwen3", "qwen3-next"]);
    expect(result.reason).toBeNull();
    expect(h.requests.at(0)?.url).toContain("/models");
  });

  test("a REFUSED base URL is rejected BEFORE any request leaves the box", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [MODELS_ROUTE], admission: () => "refused" });
    const owner = await seedOwner(db);
    await expect(h.svc.listEndpointModels({ principal: owner.principal, baseUrl: "http://10.0.0.5:8000/v1" })).rejects.toMatchObject({
      code: CONNECTION_OP_CODES.baseUrlRefused,
    });
    expect(h.requests, "the SSRF belt must run before the dial, not after it").toEqual([]);
  });

  test("an invalid URL is refused, and a credential that is not the caller's is refused before the dial", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [MODELS_ROUTE], credentialOwned: (): boolean => false });
    const owner = await seedOwner(db);
    await expect(h.svc.listEndpointModels({ principal: owner.principal, baseUrl: "not-a-url" })).rejects.toMatchObject({
      code: CONNECTION_OP_CODES.baseUrlInvalid,
    });
    await expect(h.svc.listEndpointModels({ principal: owner.principal, baseUrl: BYO_BASE_URL, credentialId: CREDENTIAL_ID })).rejects.toMatchObject({
      code: CONNECTION_OP_CODES.credentialForeign,
    });
    expect(h.requests).toEqual([]);
  });

  test("a dial that fails is the typed-id FALLBACK with a reason, never a throw", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [{ match: "/models", status: 500, json: { error: "boom" } }] });
    const owner = await seedOwner(db);
    const result = await h.svc.listEndpointModels({ principal: owner.principal, baseUrl: BYO_BASE_URL });
    expect(result.listed).toBe(false);
    expect(result.models).toEqual([]);
    expect(result.reason).not.toBeNull();
  });

  test("an endpoint that lists NOTHING is `listed: false` with its own reason (0 models ≠ a failure)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [{ match: "/models", json: { data: [] } }] });
    const owner = await seedOwner(db);
    const result = await h.svc.listEndpointModels({ principal: owner.principal, baseUrl: BYO_BASE_URL });
    expect(result).toEqual({ listed: false, models: [], reason: "the endpoint listed no models" });
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
    expect(result.listed).toBe(true);
    expect(result.models.map((entry) => entry.id)).toEqual(["qwen3", "qwen3-next"]);
    expect(result.reason).toBeNull();
    await expect(h.svc.catalogModels({ principal: other.principal, connectionId: row.id })).rejects.toMatchObject({
      code: CONNECTION_OP_CODES.notFound,
    });
  });

  test("a saved row whose list FAILS answers `listed: false` with the fetch's reason, not an empty list", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [{ match: "/models", status: 500, json: { error: "boom" } }] });
    const owner = await seedOwner(db);
    const row = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "qwen3" });
    const result = await h.svc.catalogModels({ principal: owner.principal, connectionId: row.id });
    expect(result.listed).toBe(false);
    expect(result.models).toEqual([]);
    expect(result.reason).not.toBeNull();
    expect(result.reason).not.toBe("the provider listed no models");
  });

  test("a saved row whose list is EMPTY says so, distinct from a failure", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [{ match: "/models", json: { data: [] } }] });
    const owner = await seedOwner(db);
    const row = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "qwen3" });
    expect(await h.svc.catalogModels({ principal: owner.principal, connectionId: row.id })).toEqual({
      listed: false,
      models: [],
      reason: "the provider listed no models",
    });
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
    expect(result.listed).toBe(true);
    expect(result.models.map((entry) => entry.id)).toContain("jinaai/jina-clip-v2");
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
