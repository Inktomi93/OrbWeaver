import { fetchOpenAiModels } from "@orb/server/infra/network";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures";

// biome-ignore lint/security/noSecrets: this is the name of the function under test, not a credential.
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
    expect(
      await fetchOpenAiModels({ baseUrl: "https://api.example.com", apiKey: "k", headers: null }),
    ).toEqual(["gpt-4o", "llama-3"]);
  });

  test("returns [] on a non-2xx response (best-effort, never throws)", async () => {
    vi.stubGlobal("fetch", () => new Response("nope", { status: 500 }));
    expect(
      await fetchOpenAiModels({ baseUrl: "https://api.example.com", apiKey: null, headers: null }),
    ).toEqual([]);
  });

  test("returns [] when fetch throws (unreachable endpoint)", async () => {
    vi.stubGlobal("fetch", () => {
      throw new Error("ECONNREFUSED");
    });
    expect(
      await fetchOpenAiModels({ baseUrl: "https://down.example.com", apiKey: null, headers: null }),
    ).toEqual([]);
  });

  test("returns [] on a non-OpenAI-shaped body", async () => {
    vi.stubGlobal(
      "fetch",
      () => new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
    );
    expect(
      await fetchOpenAiModels({ baseUrl: "https://api.example.com", apiKey: null, headers: null }),
    ).toEqual([]);
  });

  test("drops an over-cap /models body — proves it now rides safeFetch's size cap, not a raw fetch", async () => {
    // safeFetch caps the body at MODELS_MAX_BYTES (2 MB). A raw fetch had NO cap, so this uniquely proves
    // the routing: a body past the cap makes bytes() throw → caught → [] (never buffered whole / parsed).
    const overCap = "x".repeat(2_000_001);
    vi.stubGlobal(
      "fetch",
      () => new Response(overCap, { status: 200, headers: { "content-type": "application/json" } }),
    );
    expect(
      await fetchOpenAiModels({ baseUrl: "https://api.example.com", apiKey: null, headers: null }),
    ).toEqual([]);
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
});
