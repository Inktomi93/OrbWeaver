// backends/custom-byo/inspect — the "Test endpoint" probe: it sends the ACTUAL shaped request (real key on
// the wire) but returns a REDACTED request + the raw response, never throwing. Asserts the redaction (the
// key never leaves the server in the result), the ok path, and the unreachable (!ok) transport-error path.
// Fetch is mocked.

import { inspectCustomByoEndpoint } from "@orb/server/infra/providers/backends/custom-byo";
import { afterEach, describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

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
    expect(result.request.headers["x-team"]).not.toBe("alpha");
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
    expect(preview).not.toContain("alpha");
    // The sentinel is present (proving we scrubbed, not just failed to echo), and non-secret content survives.
    expect(preview).toContain("█");
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

  test("scrubs reflected credential values from a thrown transport error before inspector display", async () => {
    const customHeaderSecret = "custom-header-secret-reflected";
    vi.stubGlobal("fetch", (): never => {
      throw new Error(`transport rejected ${SECRET_KEY} and ${customHeaderSecret}`);
    });
    const result = await inspectCustomByoEndpoint({
      baseUrl: BASE_URL,
      apiKey: SECRET_KEY,
      headers: { "x-api-key": customHeaderSecret },
      model: "m",
      includeBody: null,
      excludeBody: null,
    });
    expect(result.error).not.toContain(SECRET_KEY);
    expect(result.error).not.toContain(customHeaderSecret);
    expect(result.error).toContain("█");
  });

  test("hard-caps the response preview reader and cancels the remaining upstream body", async () => {
    let pulls = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller): void {
        pulls += 1;
        controller.enqueue(new TextEncoder().encode("x".repeat(3000)));
        if (pulls === 4) {
          controller.close();
        }
      },
      cancel(): void {
        cancelled = true;
      },
    });
    vi.stubGlobal("fetch", (): Response => new Response(body, { status: 200 }));
    const result = await inspectCustomByoEndpoint({ baseUrl: BASE_URL, apiKey: null, headers: null, model: "m", includeBody: null, excludeBody: null });
    expect(result.response?.bodyPreview).toHaveLength(4000);
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThan(4);
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

  test.each(["a", "red", "act"])("scrubs short credential %j from retained request JSON, form, headers, and response", async (secret) => {
    vi.stubGlobal("fetch", (): Response => new Response(`echo=${secret}`, { status: 200, statusText: `status-${secret}` }));
    const result = await inspectCustomByoEndpoint({
      baseUrl: `https://byo.example.com/${secret}`,
      apiKey: secret,
      headers: { "x-api-key": secret, "x-note": `form=${secret}` },
      model: `model-${secret}`,
      includeBody: { nested: { credential: secret }, form: `token=${secret}` },
      excludeBody: null,
    });
    const retainedValues = [
      result.request.url,
      ...Object.values(result.request.headers),
      result.request.body,
      result.response?.statusText ?? "",
      result.response?.bodyPreview ?? "",
      result.error ?? "",
    ];
    expect(retainedValues.every((value) => !value.includes(secret))).toBe(true);
    expect(result.request.body).toContain("model-");
  });
});

// #1760: the inspector holds the endpoint FIELDS (it runs before a credential is minted), and its secret
// list was a third hand-rolled `[apiKey, ...headerValues]` — so a BYO endpoint whose auth is a body field
// had that credential rendered in cleartext TWICE in the dialog: once in the echoed `request.body` we show
// back, and again in `bodyPreview` when the endpoint reflects the request. Same class as the P0
// response-echo leak above; the rule now comes from the ONE producer in `backends/kit/sanitize.ts`.
describe("inspectCustomByoEndpoint — a key-in-body credential (#1760)", () => {
  const inBodyKey = "inbody-cred-4d8e1b6a2c90";

  test("the surfaced request body masks the key-in-body credential the wire really carried", async () => {
    let sentBody: Record<string, unknown> = {};
    vi.stubGlobal("fetch", (_url: string | URL, init?: RequestInit): Response => {
      sentBody = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      return new Response('{"ok":true}', { status: 200, statusText: "OK" });
    });

    const result = await inspectCustomByoEndpoint({
      baseUrl: BASE_URL,
      apiKey: null,
      headers: null,
      model: "local-model",
      includeBody: Object.fromEntries([
        ["api_key", inBodyKey],
        ["provider", "cerebras"],
      ]),
      excludeBody: null,
    });

    // The real wire carried the plaintext key (it must — that IS the endpoint's auth)…
    expect(sentBody["api_key"]).toBe(inBodyKey);
    // …but the request we hand back to the dialog does not.
    expect(result.request.body).not.toContain(inBodyKey);
    expect(result.request.body).toContain("█");
    // The ordinary routing field survives — an inspector that redacts everything tells the user nothing.
    expect(result.request.body).toContain("cerebras");
  });

  test("SCRUBS the key-in-body credential out of an ECHOED response body", async () => {
    vi.stubGlobal("fetch", (_url: string | URL, init?: RequestInit): Response => {
      const echoed: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      return new Response(JSON.stringify({ json: echoed, note: "your request, reflected" }), { status: 200, statusText: "OK" });
    });

    const result = await inspectCustomByoEndpoint({
      baseUrl: BASE_URL,
      apiKey: null,
      headers: null,
      model: "local-model",
      includeBody: Object.fromEntries([["api_key", inBodyKey]]),
      excludeBody: null,
    });

    const preview = result.response?.bodyPreview ?? "";
    expect(preview).not.toContain(inBodyKey);
    expect(preview).toContain("█");
    expect(preview).toContain("your request, reflected");
  });
});

// #1785 (SECURITY): the surfaced `request.body` is `redactSecretsFromText(JSON.stringify(body, …), …)` —
// SERIALIZE, then scrub — and `JSON.stringify` escapes `"` and `\`. A credential containing either was
// present in the displayed bytes only in its ESCAPED spelling, which the raw-literal search never saw: the
// dialog rendered it in cleartext. The echoed `bodyPreview` is the same class one hop later (the endpoint
// reflects our serialized body back). The scrub set now carries both spellings.
//
// SHAPE-BLIND FIXTURE (the #1760 instrument-lie): `sk-…`/`Bearer …` fixtures are masked by the shape sweep
// whatever the by-value belt does, so they go green against the broken source. This one matches neither and
// is assembled from parts.
describe("inspectCustomByoEndpoint — a QUOTE-bearing credential (#1785)", () => {
  const quote = '"';
  const backslash = "\\";
  const quotedInBodyKey = `inbody${quote}cred${backslash}4d8e1b`;
  const quotedHeaderSecret = `hdr${quote}cred${backslash}6a2c90`;
  const escaped = (literal: string): string => JSON.stringify(literal).slice(1, -1);

  test("the surfaced request body masks a quoted key-in-body credential in BOTH spellings", async () => {
    let sentBody: Record<string, unknown> = {};
    vi.stubGlobal("fetch", (_url: string | URL, init?: RequestInit): Response => {
      sentBody = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      return new Response('{"ok":true}', { status: 200, statusText: "OK" });
    });

    const result = await inspectCustomByoEndpoint({
      baseUrl: BASE_URL,
      apiKey: null,
      headers: { "x-api-key": quotedHeaderSecret },
      model: "local-model",
      includeBody: Object.fromEntries([
        ["api_key", quotedInBodyKey],
        ["note", `sent with ${quotedHeaderSecret}`],
        ["provider", "cerebras"],
      ]),
      excludeBody: null,
    });

    // The real wire carried the plaintext key (it must — that IS the endpoint's auth)…
    expect(sentBody["api_key"]).toBe(quotedInBodyKey);
    // …and the dialog gets neither spelling of it, nor of the quoted custom auth header value.
    for (const secret of [quotedInBodyKey, quotedHeaderSecret]) {
      expect(result.request.body).not.toContain(secret);
      expect(result.request.body).not.toContain(escaped(secret));
    }
    // POSITIVE CONTROL: the ordinary routing field survives — an inspector that redacts everything tells
    // the user nothing, and a blank body would make the assertions above vacuous.
    expect(result.request.body).toContain("cerebras");
  });

  test("an ECHOED response body is scrubbed of a quoted credential in BOTH spellings", async () => {
    // httpbin-style: the endpoint reflects our serialized request straight back, so the credential arrives
    // inside a JSON document — escaped — exactly like the request preview above.
    vi.stubGlobal("fetch", (_url: string | URL, init?: RequestInit): Response => {
      const echoed: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      return new Response(JSON.stringify({ json: echoed, note: "your request, reflected" }), { status: 200, statusText: "OK" });
    });

    const result = await inspectCustomByoEndpoint({
      baseUrl: BASE_URL,
      apiKey: null,
      headers: null,
      model: "local-model",
      includeBody: Object.fromEntries([["api_key", quotedInBodyKey]]),
      excludeBody: null,
    });

    const preview = result.response?.bodyPreview ?? "";
    expect(preview).not.toContain(quotedInBodyKey);
    expect(preview).not.toContain(escaped(quotedInBodyKey));
    expect(preview).toContain("your request, reflected");
  });
});
