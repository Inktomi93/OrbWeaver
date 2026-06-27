import { fetchOpenAiModels } from "@orb/server/infra/network";
import { describe, expect, test, vi } from "vitest";

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
