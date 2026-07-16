// biome-ignore-all lint/style/useNamingConvention: snake_case wire fixtures (input_tokens, stop_reason,
// max_tokens) + the SDK's snake_case env-var names are the real Anthropic wire, not orbweaver identifiers.
//
// backends/anth-direct client — THE EXTENDED SECURITY BELT (part 02 §4, D67 §D) + the per-key LRU.
//
// THE LOAD-BEARING TEST (the NAMED no-ambient-resolution test): the `@anthropic-ai/sdk` auto-resolves
// credentials from a WIDER surface than the three env vars — with no explicit auth it lazily mints a token
// from config files / the host `claude login` OAuth on the first request (client.js:145-166). On the OWNER's
// box that live OAuth is the free Max sub; sending it to a paid HTTP endpoint is the st-claude-proxy ban
// shape §3d exists to prevent. This suite POISONS the ambient env (ANTHROPIC_API_KEY / _AUTH_TOKEN /
// _BASE_URL / _PROFILE) the way the owner's box has it, then proves the BELTED client (a) carries ONLY the
// explicitly-passed OR Bearer token, (b) NEVER the poisoned ambient/config token, and (c) fires NO lazy
// ambient credential resolution — while an UNBELTED client silently absorbs the poison (the regression the
// belt prevents). The belt pins ALL SIX ambient knobs (apiKey/authToken/baseURL + credentials/config/profile).

import Anthropic from "@anthropic-ai/sdk";
import { createAnthClientCache, createOpenRouterAnthClient, OPENROUTER_ANTHROPIC_BASE_URL } from "@orb/server/infra/providers/backends/anth-direct";
import { beforeEach, describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

const OR_KEY = "sk-or-REAL-explicit-key";
const POISON_API_KEY = "sk-ant-POISONED-ambient-key";
const POISON_AUTH_TOKEN = "POISONED-ambient-oauth-token";

// Poison the ambient env the owner's `claude login` box leaves, so an ambient-resolution leak is VISIBLE.
// `vi.stubEnv` auto-restores after each test (the vitest fixture unstubs), so no manual teardown.
beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", POISON_API_KEY);
  vi.stubEnv("ANTHROPIC_AUTH_TOKEN", POISON_AUTH_TOKEN);
  vi.stubEnv("ANTHROPIC_BASE_URL", "https://api.anthropic.com");
  vi.stubEnv("ANTHROPIC_PROFILE", "poisoned-profile");
});

// A minimal non-stream 200 the fake fetch returns AFTER auth headers were computed (we only care about the
// outbound Authorization / X-Api-Key the client attached).
function okResponse(): Response {
  return new Response(
    JSON.stringify({
      id: "msg_1",
      type: "message",
      role: "assistant",
      content: [],
      model: "anthropic/claude-opus-4-5",
      stop_reason: "end_turn",
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

// The narrow `AnthClient` port narrows away the concrete `Anthropic` instance's auth fields (apiKey/
// authToken/baseURL/_authState) — the belt pins them at construction, and they exist at RUNTIME on the real
// instance. This structural view exposes them for the belt assertions (the port stays narrow in production).
interface BeltObservable {
  readonly apiKey: string | null;
  readonly authToken: string | null;
  readonly baseURL: string;
  readonly _authState: Record<string, unknown>;
}
function observe(client: ReturnType<typeof createOpenRouterAnthClient>): BeltObservable {
  // The belt pins these on the real `Anthropic` instance at construction; the narrow port hides them.
  // FABRICATION-OK: observes the runtime SDK fields the belt test asserts (an internals-probe, W1h escape).
  return client as unknown as BeltObservable;
}

describe("createOpenRouterAnthClient — the belt: pinned auth, no ambient absorption", () => {
  test("pins apiKey=null, authToken=<OR key>, baseURL=<OR base> despite the poisoned ambient env", () => {
    const client = observe(createOpenRouterAnthClient(OR_KEY));
    // apiKey is NULL — the belt killed the `ANTHROPIC_API_KEY` env default.
    expect(client.apiKey).toBeNull();
    // authToken is the EXPLICIT OR key — never the poisoned `ANTHROPIC_AUTH_TOKEN`.
    expect(client.authToken).toBe(OR_KEY);
    expect(client.authToken).not.toBe(POISON_AUTH_TOKEN);
    // baseURL is the OR skin — never the poisoned `ANTHROPIC_BASE_URL`.
    expect(client.baseURL).toBe(OPENROUTER_ANTHROPIC_BASE_URL);
  });

  test("THE NO-AMBIENT-RESOLUTION TEST: no lazy config-file/profile/OAuth resolution is pending", () => {
    // With the belt, the explicit `authToken` gates OFF the entire ambient-resolution block (client.js:145
    // requires BOTH apiKey and authToken null to resolve), and the `null` pins on credentials/config/profile
    // suppress the config-file / profile / host-OAuth minting path. The observable tell: the SDK's internal
    // `_authState` carries NO pending `resolution` promise, NO config-minted `provider`, and NO `tokenCache`.
    const authState = observe(createOpenRouterAnthClient(OR_KEY))._authState;
    expect(authState["resolution"]).toBeNull();
    expect(authState["provider"]).toBeNull();
    expect(authState["tokenCache"]).toBeNull();
  });

  test("the outbound request carries ONLY the OR Bearer token — never the poisoned ambient token/key", async () => {
    // Reproduce the belted construction WITH a fake fetch (test-only observation — production injects no
    // fetch so the global egress-firewalled dispatcher applies). Assert the header the SAME belt options
    // produce: exactly `Bearer <OR key>`, and NO `x-api-key`, NO poisoned ambient token anywhere.
    let outboundAuth: string | null = null;
    let outboundApiKey: string | null = null;
    const belted = new Anthropic({
      baseURL: OPENROUTER_ANTHROPIC_BASE_URL,
      authToken: OR_KEY,
      apiKey: null,
      credentials: null,
      config: null,
      profile: null,
      fetch: (_url, init): Promise<Response> => {
        const headers = new Headers(init?.headers);
        outboundAuth = headers.get("authorization");
        outboundApiKey = headers.get("x-api-key");
        return Promise.resolve(okResponse());
      },
    });
    await belted.messages.create({
      model: "anthropic/claude-opus-4-5",
      max_tokens: 16,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(outboundAuth).toBe(`Bearer ${OR_KEY}`);
    expect(outboundAuth).not.toContain(POISON_AUTH_TOKEN);
    expect(outboundApiKey).toBeNull();
  });

  test("REGRESSION GUARD: an UNBELTED client silently ABSORBS the poisoned ambient env (why the belt exists)", () => {
    // The dangerous shape the belt prevents: constructing with only `baseURL` lets the SDK read the poisoned
    // `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` off the env — on the owner's box that IS the `claude login`
    // OAuth. This asserts the belt is NOT redundant: the SAME env the belted client ignored, an unbelted one
    // swallows.
    const unbelted = new Anthropic({ baseURL: OPENROUTER_ANTHROPIC_BASE_URL });
    expect(unbelted.apiKey).toBe(POISON_API_KEY);
    expect(unbelted.authToken).toBe(POISON_AUTH_TOKEN);
  });
});

describe("createAnthClientCache — the per-key LRU", () => {
  test("reuses the SAME client for one key, distinct instances for distinct keys", () => {
    const getClient = createAnthClientCache();
    const a1 = getClient("key-a");
    const a2 = getClient("key-a");
    const b = getClient("key-b");
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
  });

  test("each cache is independent closure state (no shared module-scope map)", () => {
    const first = createAnthClientCache();
    const second = createAnthClientCache();
    expect(first("key-a")).not.toBe(second("key-a"));
  });
});
