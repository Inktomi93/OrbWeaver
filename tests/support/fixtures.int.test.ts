// support/fixtures — self-test for the caller fixtures over the REAL composed graph (createServices →
// createContext → createCaller, the full middleware ladder). Pins the three-way doctrine the fixtures
// encode (fixtures.ts header):
//   • anon → UNAUTHORIZED on an authed surface (authedProcedure 401s auth:null).
//   • cross-user read → NOT_FOUND, NEVER FORBIDDEN — "missing" and "not yours" collapse into one answer
//     (a 403 would be an existence oracle / foreign-existence leak).
//   • admin-gated surface by a non-admin → FORBIDDEN (the caller exists; the action is gated).
// Plus the PROVIDER TRANSPORT seam: the composed graph's `sdkFetch` is the fixture's `providerFetch`, which
// refuses real egress by default and is substitutable per suite (`describe`s at the bottom).
// Also proves the happy paths (owner round-trip; admin passes the gate) and that these callers ride the
// REAL tRPC error mapping — the matchers see genuine ladder-thrown TRPCErrors, not ducks.

import { describe } from "vitest";
import type { Fixtures } from "./fixtures.ts";
import { expect, test } from "./fixtures.ts";

describe("anonCaller — the unauthenticated request", () => {
  test("an authed surface rejects UNAUTHORIZED", { tags: "slow" }, async ({ anonCaller }) => {
    await expect(anonCaller.persona.list()).toThrowTRPCError("UNAUTHORIZED");
  });

  test("the public health surface still answers (anon is a caller, not a brick)", { timeout: 10_000 }, async ({ anonCaller }) => {
    expect(await anonCaller.health()).toEqual({ ok: true });
  });
});

describe("cross-user isolation — NOT_FOUND, never FORBIDDEN", () => {
  test("another user's persona is indistinguishable from a missing one", async ({ ownerCaller, otherCaller }) => {
    const created = await ownerCaller.persona.create({
      input: { name: "Secret", description: "the owner's private persona" },
    });
    await expect(otherCaller.persona.get({ personaId: created.id })).toThrowTRPCError("NOT_FOUND");
  });
});

describe("admin gating — FORBIDDEN for a plain user, open for admin/owner", () => {
  test("an admin-gated mutation by a non-admin rejects FORBIDDEN", async ({ otherCaller }) => {
    await expect(otherCaller.admin.createUser({ handle: "sneaky", password: "not-gonna-happen-1234" })).toThrowTRPCError("FORBIDDEN");
  });

  test("an admin-gated query by a non-admin rejects FORBIDDEN (gate, not oracle — admin surfaces are advertised)", async ({ otherCaller }) => {
    await expect(otherCaller.admin.listUsers()).toThrowTRPCError("FORBIDDEN");
  });

  test("adminCaller and ownerCaller both pass the owner∪admin gate (D17)", async ({ adminCaller, ownerCaller }) => {
    const viaAdmin = await adminCaller.admin.listUsers();
    const viaOwner = await ownerCaller.admin.listUsers();
    // Both fixture users are seeded (each caller seeds its own row before acting).
    expect(viaAdmin.length).toBeGreaterThanOrEqual(2);
    expect(viaOwner.length).toBeGreaterThanOrEqual(2);
  });
});

describe("the owner happy path", () => {
  test("ownerCaller round-trips its own entity through the real ladder", async ({ ownerCaller }) => {
    const created = await ownerCaller.persona.create({
      input: { name: "Nyx", description: "d" },
    });
    const got = await ownerCaller.persona.get({ personaId: created.id });
    expect(got.id).toBe(created.id);
    expect(got.name).toBe("Nyx");
  });
});

// ── THE PROVIDER TRANSPORT SEAM ────────────────────────────────────────────────────────────────────────
// `connection.listEndpointModels` is the ONE front-door verb that dials a provider with no connection row to
// seed: the pane's server-side `GET <baseUrl>/v1/models` for an endpoint being authored. It never throws — a
// failed dial is the typed-id fallback — so it reports what the composed graph's transport DID without the
// test needing a seeded connection. The runtime SCRUBS a provider's error text on the way out, which is why
// the arms split: the refusal MESSAGE is pinned at the fixture value, and the WIRING is pinned through the
// verb by substituting the transport and reading the substituted answer back.
//
// WHY THIS IS PINNED. `InferenceDeps.sdkFetch` used to be optional with a `?? globalThis.fetch` fallback, and
// `buildBackends` resolves it ONCE during the `app` fixture's own `createServices()` — before any test body
// runs. A composed-real test therefore could not spy the transport, and one silently reached a real vLLM
// engine listening on this box and asserted against its real answer.
const DRAFT_ENDPOINT = "https://models.example.invalid/v1";

describe("the composed graph's provider transport", () => {
  test("the default transport refuses, naming the request it would have made", async ({ providerFetch }) => {
    // Pinned at the fixture VALUE, not through the verb: the runtime scrubs a provider's error message
    // before it reaches the domain (see the arm below), so the refusal text is unobservable downstream.
    await expect(providerFetch(`${DRAFT_ENDPOINT}/models`, { method: "GET" })).rejects.toThrow(/unscripted provider request \(GET /);
  });

  test("an unscripted dial through the front door fails rather than reaching the network", async ({ ownerCaller }) => {
    const result = await ownerCaller.connection.listEndpointModels({ baseUrl: DRAFT_ENDPOINT });
    expect(result).toStrictEqual({ listed: false, models: [], reason: "endpoint models: transport failure" });
  });
});

const scripted = test.extend<Pick<Fixtures, "providerFetch">>({
  providerFetch: async ({}, use): Promise<void> => {
    const body = JSON.stringify({ data: [{ id: "scripted-model" }] });
    await use(() => Promise.resolve(new Response(body, { status: 200, headers: { "content-type": "application/json" } })));
  },
});

// @orb-waive audit-client-tests(describe): NOT empty — it holds one test declared through `scripted`, a
// `test.extend` fixture alias. `tooling/src/verify/lib/test-call-shape.ts` reads a runner by ROOT NAME and
// its declared limit admits only `test`/`it`, so a fixture alias is invisible to it. The alias CANNOT be
// renamed into that set here: `it` is refused by biome `lint/nursery/useConsistentTestIt` (this repo prefers
// `test`), and `test` is already bound in this module by the fixtures import — rebinding it would silently
// hand the scripted providerFetch to every other test in the file. ENDS WHEN the shape reader resolves a
// fixture alias to its `test.extend` origin, or this suite moves to its own module.
describe("a suite that drives the wire substitutes the transport", () => {
  // THE RED-FIRST ARM, and its red names the hazard. Run against the source where `sdkFetch` was optional,
  // the `app` fixture passed no `providerSeams` and every backend resolved `?? globalThis.fetch`: the override
  // is ignored, the graph dials `models.example.invalid` FOR REAL, and this arm fails by TIMING OUT on the
  // network rather than by reading a wrong value.
  scripted("an overridden providerFetch is the transport the runtime captured at compose time", async ({ ownerCaller }) => {
    const result = await ownerCaller.connection.listEndpointModels({ baseUrl: DRAFT_ENDPOINT });
    expect(result.listed).toBe(true);
    expect(result.models.map((model) => model.id)).toEqual(["scripted-model"]);
  });
});
