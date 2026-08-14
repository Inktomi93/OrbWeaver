import { fetchOpenAiModels, probeOpenAiEndpoint } from "@orb/server/infra/network";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const CHECKED_AT = 1_750_000_000_000;
const clock = (): number => CHECKED_AT;

describe("fetchOpenAiModels", () => {
  test("returns the model id list from an OpenAI-shaped /models response", async () => {
    vi.stubGlobal(
      "fetch",
      () =>
        new Response(JSON.stringify({ data: [{ id: "gpt-4o" }, { id: "llama-3" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    expect(await fetchOpenAiModels({ baseUrl: "https://api.example.com", apiKey: "k", headers: null })).toEqual(["gpt-4o", "llama-3"]);
  });

  test("returns [] on a non-2xx response (best-effort, never throws)", async () => {
    vi.stubGlobal("fetch", () => new Response("nope", { status: 500 }));
    expect(await fetchOpenAiModels({ baseUrl: "https://api.example.com", apiKey: null, headers: null })).toEqual([]);
  });

  test("returns [] when fetch throws (unreachable endpoint)", async () => {
    vi.stubGlobal("fetch", () => {
      throw new Error("ECONNREFUSED");
    });
    expect(await fetchOpenAiModels({ baseUrl: "https://down.example.com", apiKey: null, headers: null })).toEqual([]);
  });

  test("returns [] on a non-OpenAI-shaped body", async () => {
    vi.stubGlobal("fetch", () => new Response(JSON.stringify({ unexpected: true }), { status: 200 }));
    expect(await fetchOpenAiModels({ baseUrl: "https://api.example.com", apiKey: null, headers: null })).toEqual([]);
  });

  test("drops an over-cap /models body — proves it now rides safeFetch's size cap, not a raw fetch", async () => {
    // safeFetch caps the body at MODELS_MAX_BYTES (2 MB). A raw fetch had NO cap, so this uniquely proves
    // the routing: a body past the cap makes bytes() throw → caught → [] (never buffered whole / parsed).
    const overCap = "x".repeat(2_000_001);
    vi.stubGlobal("fetch", () => new Response(overCap, { status: 200, headers: { "content-type": "application/json" } }));
    expect(await fetchOpenAiModels({ baseUrl: "https://api.example.com", apiKey: null, headers: null })).toEqual([]);
  });

  test("forwards the Bearer key + custom headers through safeFetch to the endpoint", async () => {
    let sentAuth: string | null = null;
    let sentCustom: string | null = null;
    vi.stubGlobal("fetch", (_url: string | URL, init?: RequestInit) => {
      const h = new Headers(init?.headers);
      sentAuth = h.get("authorization");
      sentCustom = h.get("x-org");
      return new Response(JSON.stringify({ data: [{ id: "m1" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const ids = await fetchOpenAiModels({
      baseUrl: "https://api.example.com",
      apiKey: "sk-test",
      headers: { "x-org": "acme" },
    });
    expect(ids).toEqual(["m1"]);
    expect(sentAuth).toBe("Bearer sk-test");
    expect(sentCustom).toBe("acme");
  });

  test("strips a trailing slash from baseUrl before appending /models", async () => {
    let calledUrl = "";
    vi.stubGlobal("fetch", (url: string | URL) => {
      calledUrl = String(url);
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    await fetchOpenAiModels({ baseUrl: "https://api.example.com/", apiKey: null, headers: null });
    expect(calledUrl).toBe("https://api.example.com/models");
  });

  // SSRF seal (2026-08-02 security review). `hostAllowed` reads a LEADING-DOT allowlist entry as a SUFFIX
  // WILDCARD, and WHATWG `URL` preserves a leading dot — so `new URL(base).hostname` on a user-supplied
  // baseUrl was the one remaining way to mint a wildcard host pin. The probe must refuse to build the pin at
  // all: asserting NO FETCH IS ISSUED is what distinguishes "sealed at construction" from "happened to be
  // blocked downstream" (this endpoint class is ownerConfigured, which defers address gating to the global
  // firewall, so downstream would NOT have caught it).
  test.each([".com", ".example.com", ".internal"])("refuses to build a WILDCARD host pin from baseUrl host %j — no fetch at all", async (host) => {
    let fetched = false;
    vi.stubGlobal("fetch", () => {
      fetched = true;
      return new Response(JSON.stringify({ data: [{ id: "leaked" }] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    expect(await fetchOpenAiModels({ baseUrl: `https://${host}`, apiKey: "sk-test", headers: null })).toEqual([]);
    expect(fetched).toBe(false);
  });

  test("an ordinary host that merely CONTAINS dots is untouched by the wildcard seal", async () => {
    vi.stubGlobal("fetch", () => new Response(JSON.stringify({ data: [{ id: "m1" }] }), { status: 200, headers: { "content-type": "application/json" } }));
    expect(await fetchOpenAiModels({ baseUrl: "https://sub.domain.example.com", apiKey: null, headers: null })).toEqual(["m1"]);
  });
});

// The credential-health twin (SID-01). Same host-pinned request, classified instead of listed — a green here
// is what `credentials.testHealth` reports as `ok`, so every arm is pinned: what earns a green, what revokes,
// what merely strikes, and what must stay a non-verdict.
describe("probeOpenAiEndpoint", () => {
  const endpoint = { baseUrl: "https://byo.example.com/v1", apiKey: "sk-byo-secret-key", headers: null };

  test("a 2xx /models answer is ok — and carries the injected clock's checkedAt", async () => {
    vi.stubGlobal("fetch", () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    expect(await probeOpenAiEndpoint(endpoint, clock)).toEqual({ status: "ok", checkedAt: CHECKED_AT });
  });

  test("the probe carries the real key — an auth verdict off an unauthenticated request would be meaningless", async () => {
    let sentAuth: string | null = null;
    let calledUrl = "";
    vi.stubGlobal("fetch", (url: string | URL, init?: RequestInit) => {
      calledUrl = String(url);
      sentAuth = new Headers(init?.headers).get("authorization");
      return new Response("{}", { status: 200 });
    });
    await probeOpenAiEndpoint(endpoint, clock);
    expect(calledUrl).toBe("https://byo.example.com/v1/models");
    expect(sentAuth).toBe("Bearer sk-byo-secret-key");
  });

  test.each([401, 403])("HTTP %i is an auth-class rejection → revoked", async (status) => {
    vi.stubGlobal("fetch", () => new Response("nope", { status }));
    const health = await probeOpenAiEndpoint(endpoint, clock);
    expect(health.status).toBe("revoked");
    expect(health).toHaveProperty("reason", `endpoint rejected the credential (HTTP ${status})`);
  });

  // The anti-self-inflicted-outage pin: `unreachable` feeds testHealth's 3-strike breaker, so a reachable BYO
  // endpoint that simply doesn't serve /models must NOT be classified as one — it earns no verdict at all.
  test.each([404, 405, 500])("HTTP %i is reachable-but-unclassifiable → unchecked, never unreachable and never ok", async (status) => {
    vi.stubGlobal("fetch", () => new Response("nope", { status }));
    const health = await probeOpenAiEndpoint(endpoint, clock);
    expect(health.status).toBe("unchecked");
    expect(health).toHaveProperty("reason", `endpoint answered HTTP ${status} — the credential could not be verified`);
  });

  test("a transport failure is unreachable (the only strike-worthy arm) and never throws", async () => {
    vi.stubGlobal("fetch", () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:8799");
    });
    const health = await probeOpenAiEndpoint(endpoint, clock);
    expect(health.status).toBe("unreachable");
    expect(health).toHaveProperty("reason", expect.stringContaining("ECONNREFUSED"));
  });

  // undici's own shape: the message is the useless "fetch failed" and the diagnosis is one level down. Pinned
  // against a live closed port during the SID-01 lane: reason = "fetch failed: connect ECONNREFUSED 127.0.0.1:8799".
  test("unwraps the transport cause — a bare 'fetch failed' is not a diagnosis", async () => {
    vi.stubGlobal("fetch", () => {
      throw new Error("fetch failed", { cause: new Error("connect ECONNREFUSED 127.0.0.1:8799") });
    });
    const health = await probeOpenAiEndpoint(endpoint, clock);
    expect(health).toHaveProperty("reason", "fetch failed: connect ECONNREFUSED 127.0.0.1:8799");
  });

  test("SCRUBS the key + custom header values out of the failure reason (credential-echo class)", async () => {
    const key = "sk-live-abc123SECRETvalue";
    const headerSecret = "team-alpha-secret-token-xyz";
    vi.stubGlobal("fetch", () => {
      // A proxy/undici error that quotes what it was handed — the reason is user-visible, so it must not
      // become a display surface for the credential.
      throw new Error(`upstream refused: sent authorization=Bearer ${key} and x-api-key=${headerSecret}`);
    });
    const health = await probeOpenAiEndpoint({ baseUrl: "https://byo.example.com/v1", apiKey: key, headers: { "x-api-key": headerSecret } }, clock);
    const reason = "reason" in health ? health.reason : "";
    expect(reason).not.toContain(key);
    expect(reason).not.toContain(headerSecret);
    expect(reason).toContain("«redacted»"); // proves it was scrubbed, not merely absent
    expect(reason).toContain("upstream refused");
  });

  test("reads the STATUS only — an over-cap body never reaches the health result", async () => {
    // fetchOpenAiModels drops an over-cap body via safeFetch's reader; the probe never opens the body at all,
    // so a hostile endpoint's bytes cannot ride a health check back to the user.
    vi.stubGlobal("fetch", () => new Response("x".repeat(2_000_001), { status: 200, headers: { "content-type": "application/json" } }));
    expect(await probeOpenAiEndpoint(endpoint, clock)).toEqual({ status: "ok", checkedAt: CHECKED_AT });
  });

  // Same SSRF seal as the sibling fetch: a leading-dot host would become a SUFFIX-WILDCARD pin. The probe must
  // refuse to build it — and, since it never dialled, answer `unchecked` rather than a reachability verdict.
  test.each([".com", ".example.com"])("refuses a WILDCARD host pin from baseUrl host %j — no fetch, and no verdict", async (host) => {
    let fetched = false;
    vi.stubGlobal("fetch", () => {
      fetched = true;
      return new Response("{}", { status: 200 });
    });
    const health = await probeOpenAiEndpoint({ baseUrl: `https://${host}`, apiKey: "sk-test", headers: null }, clock);
    expect(health.status).toBe("unchecked");
    expect(fetched).toBe(false);
  });

  test("a malformed baseUrl is unchecked (a typo must not strike toward auto-revocation)", async () => {
    let fetched = false;
    vi.stubGlobal("fetch", () => {
      fetched = true;
      return new Response("{}", { status: 200 });
    });
    const health = await probeOpenAiEndpoint({ baseUrl: "not a url", apiKey: null, headers: null }, clock);
    expect(health.status).toBe("unchecked");
    expect(fetched).toBe(false);
  });
});
