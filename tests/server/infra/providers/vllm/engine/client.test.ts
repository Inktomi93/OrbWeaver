// Unit tests for the loopback HTTP seam — the connection/non-ok → typed ProviderError mapping, and the
// PRE-DISPATCH auto-wake gate this seam owns (every role's request funnels through here). `fetch` is stubbed
// (no real socket) and the wake gate's I/O is injected where a sleeping fleet is exercised, so nothing shells
// out to `ps`/`nvidia-smi` and no real engine is ever touched. Engine ports come from foundation/env defaults.
//
// biome-ignore-all lint/style/useNamingConvention: `is_sleeping` is vLLM's real /is_sleeping response field —
// a wire fixture must spell the wire, and renaming it would stop reproducing the endpoint (the gen-window
// spec carries the same suppression for `max_model_len`).

import { ProviderError } from "@orb/server/infra/providers";
import type { GpuVram, WakeGateDeps } from "@orb/server/infra/providers/vllm/engine";
import { __resetWakeGateCache, createVllmEngineClient } from "@orb/server/infra/providers/vllm/engine";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

beforeEach(() => {
  __resetWakeGateCache();
});
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

// ── the pre-dispatch auto-wake gate, exercised through the REQUEST seam (the live 2026-07-31 bug) ──────────
// A slept engine answers /health 200 and accepts the connection, then queues the request forever behind a
// paused scheduler — so the gate must fire BEFORE dispatch, off the engine's own /is_sleeping answer, and a
// wake it may not perform must fail LOUD instead of hanging.

const GIB = 1_073_741_824;
const freeGpus: GpuVram[] = [
  { index: 0, totalBytes: 48 * GIB, freeBytes: 40 * GIB, tenants: [] },
  { index: 1, totalBytes: 48 * GIB, freeBytes: 40 * GIB, tenants: [] },
];

/** Injected wake-gate I/O for a SLEEPING fleet — no subprocesses, no real engine. */
function sleepingFleet(over: Partial<WakeGateDeps> = {}): WakeGateDeps {
  return {
    repoRoot: "/repo",
    isSleeping: () => Promise.resolve(true),
    reap: () => Promise.resolve([]),
    queryGpu: () => Promise.resolve(freeGpus),
    wakeAndAwait: () => Promise.resolve(true),
    held: () => false,
    now: () => 1000,
    ...over,
  };
}

describe("pre-dispatch auto-wake gate at the request seam", () => {
  test("the sleep probe asks /is_sleeping — never /health — before the request goes out", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      calls.push(url);
      return Promise.resolve(new Response(JSON.stringify({ is_sleeping: false }), { status: 200 }));
    });
    await createVllmEngineClient().enginePost("gen", "/v1/chat/completions", {});
    expect(calls[0]).toContain("/is_sleeping");
    expect(calls.some((u) => u.includes("/health"))).toBe(false);
    expect(calls[1]).toContain("/v1/chat/completions");
  });

  test("an ASLEEP engine is woken first, THEN the request dispatches (the turn waits, it never hangs)", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      calls.push(url);
      return Promise.resolve(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    });
    let woke = false;
    const woken = createVllmEngineClient(
      sleepingFleet({
        wakeAndAwait: () => {
          woke = true;
          return Promise.resolve(true);
        },
      }),
    );
    await expect(woken.enginePost("gen", "/v1/chat/completions", {})).resolves.toEqual({ ok: 1 });
    expect(woke).toBe(true);
    expect(calls).toHaveLength(1); // only the dispatch — the probe was the injected fake
  });

  test("a HELD fleet fails the request LOUD (named state + remedy) and never dispatches", async () => {
    let dispatched = false;
    vi.stubGlobal("fetch", () => {
      dispatched = true;
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    const held = createVllmEngineClient(sleepingFleet({ held: () => true }));
    const err = await held.enginePost("gen", "/v1/chat/completions", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).retryable).toBe(false);
    expect((err as ProviderError).message).toContain("sleeping-held");
    expect((err as ProviderError).message).toContain("pnpm engines:wake");
    expect(dispatched).toBe(false);
  });

  test("the STREAMING chat path is gated too — a wake timeout throws instead of opening a doomed stream", async () => {
    let dispatched = false;
    vi.stubGlobal("fetch", () => {
      dispatched = true;
      return Promise.resolve(new Response("data: x\n", { status: 200 }));
    });
    const stuck = createVllmEngineClient(sleepingFleet({ wakeAndAwait: () => Promise.resolve(false) }));
    const err = await stuck.engineStream("gen", "/v1/chat/completions", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).retryable).toBe(true);
    expect((err as ProviderError).message).toContain("waking timed out");
    expect(dispatched).toBe(false);
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
