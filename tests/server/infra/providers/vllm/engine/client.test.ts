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
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify({ ok: 1 }), { status: 200 })));
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

  // F6 — the hung-socket bound: enginePost ALWAYS passes a signal to fetch (the default request-timeout composed
  // with any caller signal), so a black-holed engine can't leak an unsettled promise (→ a permanent barrier-entry
  // leak downstream). Pinned here at the source: the request is always abort-armed.
  test("enginePost ALWAYS fetches with an abort signal (the default timeout — no unbounded hang)", async () => {
    let seenSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      seenSignal = init.signal ?? undefined;
      return Promise.resolve(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    });
    await client.enginePost("gen", "/v1/chat/completions", {});
    expect(seenSignal).toBeInstanceOf(AbortSignal); // never undefined — the bound is unconditional
  });

  // F6 — the hung flush SETTLES: when the bound fires, fetch rejects with a TimeoutError DOMException; that maps
  // to a RETRYABLE server ProviderError (not a raw DOMException), so the rpg flush promise settles → the
  // flush-barrier `.finally` runs → the entry clears (no permanent per-chat 15s tax).
  test("a request-timeout abort maps to a retryable server ProviderError (the flush settles, barrier clears)", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new DOMException("The operation timed out.", "TimeoutError")));
    const err = await client.enginePost("gen", "/v1/chat/completions", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).kind).toBe("server");
    expect((err as ProviderError).retryable).toBe(true);
    expect((err as ProviderError).message).toContain("bound");
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
    await expect(client.engineStream("gen", "/v1/chat/completions", {})).rejects.toBeInstanceOf(ProviderError);
  });

  test("a connection failure throws a 'not reachable' ProviderError", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("ECONNREFUSED")));
    const err = await client.engineStream("gen", "/v1/chat/completions", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).message).toContain("not reachable");
  });
});
