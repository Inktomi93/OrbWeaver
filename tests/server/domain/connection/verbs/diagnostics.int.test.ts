// verbs: probe · accountCredits · generationCost · verifyAuth · inspectEndpoint. The domain's OWN decisions
// here are three, and each is pinned: (1) every diagnostic resolves ONE of the caller's rows first, so a
// stranger's id never reaches a dial; (2) `probe` is the TWO-DOMAIN probe — the runtime dials, the
// credentials domain records — and a KEYLESS row's verdict is stamped and returned with NO row write at all
// (the credentials domain has nothing to revoke); (3) the endpoint inspector hands back the SHAPED request
// with its headers REDACTED, because "test endpoint" must never be the surface that echoes the key back.

import { CONNECTION_OP_CODES } from "@orb/server/domain/connection";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { BYO_BASE_URL, BYO_PROVIDER, makeHarness, seedOwner } from "../_support.ts";

const MODELS_OK = { match: "/models", json: { data: [{ id: "m" }] } };
const OPENROUTER_MODEL = "openai/gpt-4o";

describe("probe", () => {
  test("a KEYLESS row's verdict is stamped on the domain clock and never reaches the credentials domain", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [MODELS_OK] });
    const owner = await seedOwner(db);
    const row = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "m" });
    const health = await h.svc.probe({ principal: owner.principal, connectionId: row.id });
    expect(health.status).toBe("ok");
    expect(health.checkedAt).toBeGreaterThan(0);
    expect(h.probeRecords, "a keyless row has no credential row to revoke, strike or clear").toEqual([]);
  });

  test("an endpoint that refuses the read is `unreachable`, not `revoked` — nothing judged the key", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [{ match: "/models", status: 503, json: { error: "engine asleep" } }] });
    const owner = await seedOwner(db);
    const row = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "m" });
    const health = await h.svc.probe({ principal: owner.principal, connectionId: row.id });
    expect(health.status).toBe("unreachable");
  });

  test("a 401 IS an auth verdict — the probe reports `revoked`", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [{ match: "/models", status: 401, json: { error: "invalid api key" } }] });
    const owner = await seedOwner(db);
    const row = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "m" });
    const health = await h.svc.probe({ principal: owner.principal, connectionId: row.id });
    expect(health.status).toBe("revoked");
  });

  test("a stranger's row never reaches a dial", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [MODELS_OK] });
    const owner = await seedOwner(db);
    const other = await seedOwner(db, "user_b");
    const row = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "m" });
    await expect(h.svc.probe({ principal: other.principal, connectionId: row.id })).rejects.toMatchObject({ code: CONNECTION_OP_CODES.notFound });
    expect(h.requests).toEqual([]);
  });
});

describe("the OpenRouter-only diagnostics", () => {
  test("accountCredits and generationCost read the dialect's own endpoints and normalize the wire", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, {
      routes: [
        { match: "/credits", json: JSON.parse('{"data":{"total_credits":12,"total_usage":2}}') },
        { match: "/generation", json: JSON.parse('{"data":{"total_cost":0.25,"tokens_prompt":40}}') },
        MODELS_OK,
      ],
    });
    const owner = await seedOwner(db);
    const row = await h.svc.create({ principal: owner.principal, providerId: "openrouter", credentialId: null, baseUrl: null, model: OPENROUTER_MODEL });
    expect(await h.svc.accountCredits({ principal: owner.principal, connectionId: row.id })).toEqual({ total: 12, used: 2 });
    const cost = await h.svc.generationCost({ principal: owner.principal, connectionId: row.id, generationId: "gen 1" });
    expect(cost).toEqual({ totalCost: 0.25, tokensPrompt: 40, tokensCompletion: null });
    expect(
      h.requests.some((request) => request.url.includes("id=gen%201")),
      "the upstream handle is THEIR id namespace — it rides the query encoded, never interpolated raw",
    ).toBe(true);
  });

  test("a NON-OpenRouter row is refused rather than dialled — the diagnostic is dialect-bound", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [MODELS_OK] });
    const owner = await seedOwner(db);
    const row = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "m" });
    await expect(h.svc.accountCredits({ principal: owner.principal, connectionId: row.id })).rejects.toThrow();
    expect(h.requests.some((request) => request.url.includes("/credits"))).toBe(false);
  });
});

describe("inspectEndpoint / verifyAuth", () => {
  test("inspect reports the failed response instead of throwing, and REDACTS the request headers", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [{ match: "/chat/completions", status: 500, json: { error: "upstream is down" } }, MODELS_OK] });
    const owner = await seedOwner(db);
    const row = await h.svc.create({
      principal: owner.principal,
      providerId: BYO_PROVIDER,
      credentialId: null,
      baseUrl: BYO_BASE_URL,
      model: "m",
      transport: { headers: { "x-api-key": "sk-super-secret" } },
    });
    const inspection = await h.svc.inspectEndpoint({ principal: owner.principal, connectionId: row.id });
    expect(inspection.ok).toBe(false);
    expect(inspection.response?.status).toBe(500);
    expect(inspection.request.url).toContain("/chat/completions");
    expect(inspection.response?.bodyPreview).toContain("upstream is down");
    expect(JSON.stringify(inspection), "the inspector must never echo a credential back to the pane").not.toContain("sk-super-secret");
  });

  test("a 2xx inspection is `ok` with the shaped body it actually sent", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [{ match: "/chat/completions", json: { choices: [{ message: { content: "pong" } }] } }, MODELS_OK] });
    const owner = await seedOwner(db);
    const row = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "m" });
    const inspection = await h.svc.inspectEndpoint({ principal: owner.principal, connectionId: row.id });
    expect(inspection.ok).toBe(true);
    expect(inspection.request.body).toContain('"model"');
  });

  test("verifyAuth is a subscription-wire diagnostic — an endpoint row has no backend method for it", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [MODELS_OK] });
    const owner = await seedOwner(db);
    const row = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "m" });
    await expect(h.svc.verifyAuth({ principal: owner.principal, connectionId: row.id })).rejects.toThrow();
  });
});
