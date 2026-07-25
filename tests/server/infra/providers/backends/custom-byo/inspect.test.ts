// backends/custom-byo/inspect — the "Test endpoint" probe: it sends the ACTUAL shaped request (real key on
// the wire) but returns a REDACTED request + the raw response, never throwing. Asserts the redaction (the
// key never leaves the server in the result), the ok path, and the unreachable (!ok) transport-error path.
// Fetch is mocked.

import { inspectCustomByoEndpoint } from "@orb/server/infra/providers/backends/custom-byo";
import { afterEach, describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

const BASE_URL = "https://byo.example.com/v1";
const EXPECTED_URL = "https://byo.example.com/v1/chat/completions";
const SECRET_KEY = "sk-secret-123";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("inspectCustomByoEndpoint", () => {
  test("REDACTS the Authorization header in the returned request while sending the real key", async () => {
    let capturedAuth: string | null = null;
    vi.stubGlobal("fetch", (_url: string | URL, init?: RequestInit): Response => {
      capturedAuth = new Headers(init?.headers).get("authorization");
      return new Response('{"ok":true}', { status: 200, statusText: "OK" });
    });

    const result = await inspectCustomByoEndpoint({
      baseUrl: BASE_URL,
      apiKey: SECRET_KEY,
      headers: { "x-team": "alpha" },
      model: "local-model",
      includeBody: null,
      excludeBody: null,
    });

    // The ACTUAL wire carried the real key…
    expect(capturedAuth).toBe(`Bearer ${SECRET_KEY}`);
    // …but the surfaced request masks it (the key never leaves the server in the result).
    expect(result.request.headers["authorization"]).not.toContain(SECRET_KEY);
    expect(result.request.headers["x-team"]).toBe("alpha");
    expect(result.request.url).toBe(EXPECTED_URL);
    expect(result.ok).toBe(true);
    expect(result.response?.status).toBe(200);
    expect(result.response?.bodyPreview).toBe('{"ok":true}');
  });

  test("SCRUBS an echoed key out of bodyPreview — an httpbin-style endpoint reflecting the request (P0 repro)", async () => {
    const echoKey = "sk-test-abc123DEFsecretvalue";
    const customToken = "team-alpha-secret-token-xyz";
    // httpbin.org/anything reflects the request headers verbatim in its JSON body.
    vi.stubGlobal("fetch", (_url: string | URL, init?: RequestInit): Response => {
      const echoed = Object.fromEntries(new Headers(init?.headers).entries());
      return new Response(JSON.stringify({ headers: echoed, note: "your request, reflected" }), {
        status: 200,
        statusText: "OK",
      });
    });

    const result = await inspectCustomByoEndpoint({
      baseUrl: BASE_URL,
      apiKey: echoKey,
      headers: { "x-api-key": customToken, "x-team": "alpha" },
      model: "local-model",
      includeBody: null,
      excludeBody: null,
    });

    const preview = result.response?.bodyPreview ?? "";
    // The plaintext key (and the bearer frame around it) NEVER appears in the display-eligible body…
    expect(preview).not.toContain(echoKey);
    expect(preview).not.toContain(`Bearer ${echoKey}`);
    // …nor does the secret-valued custom auth header the endpoint echoed back.
    expect(preview).not.toContain(customToken);
    // The sentinel is present (proving we scrubbed, not just failed to echo), and non-secret content survives.
    expect(preview).toContain("«redacted»");
    expect(preview).toContain("your request, reflected");
  });

  test("does NOT over-redact a normal (non-echoing) response", async () => {
    const clean = '{"choices":[{"message":{"content":"ping ok"}}],"id":"chatcmpl-7"}';
    vi.stubGlobal("fetch", (): Response => new Response(clean, { status: 200, statusText: "OK" }));
    const result = await inspectCustomByoEndpoint({
      baseUrl: BASE_URL,
      apiKey: SECRET_KEY,
      headers: null,
      model: "m",
      includeBody: null,
      excludeBody: null,
    });
    // A legitimate completion body is untouched — no secret material to strip.
    expect(result.response?.bodyPreview).toBe(clean);
  });

  test("HOST-PINS: a cross-origin redirect is NOT followed with the key (redirect:manual, credential-exfil defense)", async () => {
    // A malicious/misconfigured BYO endpoint answers the probe with a 302 to an attacker host. With
    // redirect:"manual" fetch surfaces the 3xx verbatim and never issues a second request — so the
    // `Authorization: Bearer <key>` never reaches attacker.example. (Node's default redirect:"follow" would
    // re-send the key to the Location host, past the egress firewall.)
    const attackerHits: string[] = [];
    vi.stubGlobal("fetch", (url: string | URL, init?: RequestInit): Response => {
      const target = String(url);
      const auth = new Headers(init?.headers).get("authorization");
      if (target.includes("attacker.example")) {
        attackerHits.push(`${target} auth=${auth ?? ""}`);
        return new Response("{}", { status: 200, statusText: "OK" });
      }
      // The manual-redirect mode is asserted by the caller passing it; the stub honours it by returning the
      // 3xx as the terminal response (mirroring undici's manual-redirect behaviour).
      expect(init?.redirect).toBe("manual");
      return new Response(null, { status: 302, statusText: "Found", headers: { location: "https://attacker.example/collect" } });
    });

    const result = await inspectCustomByoEndpoint({
      baseUrl: BASE_URL,
      apiKey: SECRET_KEY,
      headers: null,
      model: "m",
      includeBody: null,
      excludeBody: null,
    });

    // The key never chased the redirect to the attacker host.
    expect(attackerHits).toEqual([]);
    // The redirect is surfaced as the (honest) diagnostic result — a 3xx status, never a followed 200.
    expect(result.response?.status).toBe(302);
  });

  test("never throws on an unreachable endpoint — returns ok:false + the transport error", async () => {
    vi.stubGlobal("fetch", (): never => {
      throw new Error("ECONNREFUSED");
    });
    const result = await inspectCustomByoEndpoint({
      baseUrl: BASE_URL,
      apiKey: null,
      headers: null,
      model: "m",
      includeBody: null,
      excludeBody: null,
    });
    expect(result.ok).toBe(false);
    expect(result.response).toBeNull();
    expect(result.error).toContain("ECONNREFUSED");
  });

  test("applies includeBody/excludeBody transforms to the probe body (PD-13)", async () => {
    let sentBody: unknown = null;
    vi.stubGlobal("fetch", (_url: string | URL, init?: RequestInit): Response => {
      sentBody = JSON.parse(String(init?.body));
      return new Response("{}", { status: 200, statusText: "OK" });
    });

    const result = await inspectCustomByoEndpoint({
      baseUrl: BASE_URL,
      apiKey: null,
      headers: null,
      model: "m",
      includeBody: { extraKnob: "high" },
      excludeBody: ["stream"],
    });

    // includeBody merged in, excludeBody stripped LAST (`stream` removed even though the base set it).
    expect(sentBody).toMatchObject({ model: "m", extraKnob: "high" });
    expect(sentBody).not.toHaveProperty("stream");
    // The redacted request preview reflects the same shaped body.
    const preview: unknown = JSON.parse(result.request.body);
    expect(preview).toMatchObject({ extraKnob: "high" });
    expect(preview).not.toHaveProperty("stream");
  });
});
