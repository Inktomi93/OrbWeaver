// Unit tests for the gen engine's self-reported context window (`GET /v1/models` → `max_model_len`). `fetch`
// is stubbed (no real socket). Proves: the engine's window is read from either the full-id or alias entry;
// any failure (non-ok / unreachable / malformed / no positive max_model_len) degrades to null so the caller
// falls back to the env-owned window.
//
// biome-ignore-all lint/style/useNamingConvention: `max_model_len` is vLLM's real /v1/models field name — the
// fixtures mirror the wire shape verbatim, so the snake_case key is required, not a style choice.

import { fetchEngineMaxModelLen, fetchGenMaxModelLen } from "@orb/server/infra/providers/vllm/engine";
import { afterEach, describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

afterEach(() => vi.unstubAllGlobals());

function modelsResponse(body: unknown, status = 200): () => Promise<Response> {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status }));
}

describe("fetchGenMaxModelLen", () => {
  test("returns max_model_len from the full-id entry", async () => {
    vi.stubGlobal("fetch", modelsResponse({ data: [{ id: "Qwen/Qwen3-VL-8B-Instruct", max_model_len: 32_768 }] }));
    await expect(fetchGenMaxModelLen()).resolves.toBe(32_768);
  });

  test("reads max_model_len from the slash-free alias entry too (first positive wins)", async () => {
    vi.stubGlobal("fetch", modelsResponse({ data: [{ id: "Qwen3-VL-8B-Instruct", max_model_len: 65_536 }] }));
    await expect(fetchGenMaxModelLen()).resolves.toBe(65_536);
  });

  test("a non-ok response degrades to null (caller uses the env window)", async () => {
    vi.stubGlobal("fetch", modelsResponse({}, 503));
    await expect(fetchGenMaxModelLen()).resolves.toBeNull();
  });

  test("an unreachable engine degrades to null", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("fetch failed")));
    await expect(fetchGenMaxModelLen()).resolves.toBeNull();
  });

  test("a malformed body (no positive max_model_len) degrades to null", async () => {
    vi.stubGlobal("fetch", modelsResponse({ data: [{ id: "x", max_model_len: 0 }, { id: "y" }] }));
    await expect(fetchGenMaxModelLen()).resolves.toBeNull();
  });

  test("an empty data array degrades to null", async () => {
    vi.stubGlobal("fetch", modelsResponse({ data: [] }));
    await expect(fetchGenMaxModelLen()).resolves.toBeNull();
  });
});

describe("fetchEngineMaxModelLen (embed + rerank self-report, extends the gen seam)", () => {
  test("embed engine reports its pooling window", async () => {
    vi.stubGlobal("fetch", modelsResponse({ data: [{ id: "Qwen/Qwen3-VL-Embedding-2B", max_model_len: 8192 }] }));
    await expect(fetchEngineMaxModelLen("embed")).resolves.toBe(8192);
  });

  test("rerank engine reports its pooling window", async () => {
    vi.stubGlobal("fetch", modelsResponse({ data: [{ id: "Qwen/Qwen3-VL-Reranker-2B", max_model_len: 16_384 }] }));
    await expect(fetchEngineMaxModelLen("rerank")).resolves.toBe(16_384);
  });

  test("an unreachable embed engine degrades to null (caller uses the env floor)", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("fetch failed")));
    await expect(fetchEngineMaxModelLen("embed")).resolves.toBeNull();
  });

  test("fetchGenMaxModelLen is the gen-engine alias of fetchEngineMaxModelLen", async () => {
    vi.stubGlobal("fetch", modelsResponse({ data: [{ id: "x", max_model_len: 32_768 }] }));
    await expect(fetchEngineMaxModelLen("gen")).resolves.toBe(32_768);
  });
});
