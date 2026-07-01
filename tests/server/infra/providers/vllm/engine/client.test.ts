// Unit tests for the loopback HTTP seam — the connection/non-ok → typed ProviderError mapping. `fetch` is
// stubbed (no real socket); the engine ports come from foundation/env defaults.

import { ProviderError } from "@orb/server/infra/providers";
import { createVllmEngineClient } from "@orb/server/infra/providers/vllm/engine";
import { afterEach, describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

afterEach(() => vi.unstubAllGlobals());

const client = createVllmEngineClient();

describe("enginePost", () => {
  test("returns the parsed JSON on a 2xx response", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response(JSON.stringify({ ok: 1 }), { status: 200 })),
    );
    await expect(client.enginePost("embed", "/v1/embeddings", {})).resolves.toEqual({ ok: 1 });
  });

  test("a 400 maps to a non-retryable 'invalid' ProviderError carrying the status", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("bad body", { status: 400 })));
    const err = await client.enginePost("embed", "/v1/embeddings", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).kind).toBe("invalid");
    expect((err as ProviderError).retryable).toBe(false);
    expect((err as ProviderError).apiErrorStatus).toBe(400);
  });

  test("a 5xx maps to a retryable 'server' ProviderError", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("boom", { status: 503 })));
    const err = await client.enginePost("gen", "/v1/chat/completions", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).kind).toBe("server");
    expect((err as ProviderError).retryable).toBe(true);
  });

  test("a connection failure maps to a 'not reachable' server ProviderError", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("fetch failed")));
    const err = await client.enginePost("rerank", "/v1/rerank", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).kind).toBe("server");
    expect((err as ProviderError).message).toContain("not reachable");
  });
});

describe("engineStream", () => {
  test("returns the response body stream on a 2xx", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("data: x\n", { status: 200 })));
    const body = await client.engineStream("gen", "/v1/chat/completions", {});
    expect(body).toBeInstanceOf(ReadableStream);
  });

  test("a non-ok status throws a typed ProviderError (never yields a stream)", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("nope", { status: 500 })));
    await expect(client.engineStream("gen", "/v1/chat/completions", {})).rejects.toBeInstanceOf(
      ProviderError,
    );
  });

  test("a connection failure throws a 'not reachable' ProviderError", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("ECONNREFUSED")));
    const err = await client
      .engineStream("gen", "/v1/chat/completions", {})
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).message).toContain("not reachable");
  });
});
