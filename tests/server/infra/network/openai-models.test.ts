import { fetchOpenAiModels } from "@orb/server/infra/network";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

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

  test.each(["a", "red", "act"])("invalid JSON cannot echo short credential %j into logs", async (secret) => {
    vi.stubGlobal("fetch", () => new Response(secret, { status: 200 }));
    const info = vi.fn();
    const log = (await import("@orb/server/foundation/observability")).getLog();
    const prior = log.info;
    log.info = info;
    try {
      expect(await fetchOpenAiModels({ baseUrl: "https://api.example.com", apiKey: secret, headers: { "x-key": secret } })).toEqual([]);
      expect(String(info.mock.calls[0]?.[0]?.err ?? "")).not.toContain(secret);
    } finally {
      log.info = prior;
    }
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
