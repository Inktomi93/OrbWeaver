// Unit tests for the gen engine's self-reported context window (`GET /v1/models` → `max_model_len`). `fetch`
// is stubbed (no real socket). Proves: the engine's window is read from either the full-id or alias entry;
// any failure (non-ok / unreachable / malformed / no positive max_model_len) degrades to null so the caller
// falls back to the env-owned window.
//

import { fetchEngineMaxModelLen } from "@orb/server/infra/providers/vllm/engine";
import { afterEach, describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

afterEach(() => vi.unstubAllGlobals());

function modelsResponse(body: unknown, status = 200): () => Promise<Response> {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status }));
}

// `fetchGenMaxModelLen` — the gen-engine back-compat alias — was deleted (census #72 item 2a: zero
// production callers besides its own re-export barrels; `fetchEngineMaxModelLen("gen", …)` is the
// live seam every consumer (`entry/compose/services.ts`) already calls). These cases pin the SAME
// gen-engine behavior through the successor directly.
describe("fetchEngineMaxModelLen (gen engine)", () => {
  test("returns max_model_len from the full-id entry", async () => {
    // biome-ignore lint/style/useNamingConvention: `max_model_len` is vLLM's real /v1/models field name — the fixtures mirror the wire shape verbatim, so the snake_case key is required, not a style choice.
    vi.stubGlobal("fetch", modelsResponse({ data: [{ id: "Qwen/Qwen3-VL-8B-Instruct", max_model_len: 32_768 }] }));
    await expect(fetchEngineMaxModelLen("gen")).resolves.toBe(32_768);
  });

  test("reads max_model_len from the slash-free alias entry too (first positive wins)", async () => {
    // biome-ignore lint/style/useNamingConvention: `max_model_len` is vLLM's real /v1/models field name — the fixtures mirror the wire shape verbatim, so the snake_case key is required, not a style choice.
    vi.stubGlobal("fetch", modelsResponse({ data: [{ id: "Qwen3-VL-8B-Instruct", max_model_len: 65_536 }] }));
    await expect(fetchEngineMaxModelLen("gen")).resolves.toBe(65_536);
  });

  test("a non-ok response degrades to null (caller uses the env window)", async () => {
    vi.stubGlobal("fetch", modelsResponse({}, 503));
    await expect(fetchEngineMaxModelLen("gen")).resolves.toBeNull();
  });

  test("an unreachable engine degrades to null", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("fetch failed")));
    await expect(fetchEngineMaxModelLen("gen")).resolves.toBeNull();
  });

  test("a malformed body (no positive max_model_len) degrades to null", async () => {
    // biome-ignore lint/style/useNamingConvention: `max_model_len` is vLLM's real /v1/models field name — the fixtures mirror the wire shape verbatim, so the snake_case key is required, not a style choice.
    vi.stubGlobal("fetch", modelsResponse({ data: [{ id: "x", max_model_len: 0 }, { id: "y" }] }));
    await expect(fetchEngineMaxModelLen("gen")).resolves.toBeNull();
  });

  test("an empty data array degrades to null", async () => {
    vi.stubGlobal("fetch", modelsResponse({ data: [] }));
    await expect(fetchEngineMaxModelLen("gen")).resolves.toBeNull();
  });
});

describe("fetchEngineMaxModelLen (embed + rerank self-report, extends the gen seam)", () => {
  test("embed engine reports its pooling window", async () => {
    // biome-ignore lint/style/useNamingConvention: `max_model_len` is vLLM's real /v1/models field name — the fixtures mirror the wire shape verbatim, so the snake_case key is required, not a style choice.
    vi.stubGlobal("fetch", modelsResponse({ data: [{ id: "Qwen/Qwen3-VL-Embedding-2B", max_model_len: 8192 }] }));
    await expect(fetchEngineMaxModelLen("embed")).resolves.toBe(8192);
  });

  test("rerank engine reports its pooling window", async () => {
    // biome-ignore lint/style/useNamingConvention: `max_model_len` is vLLM's real /v1/models field name — the fixtures mirror the wire shape verbatim, so the snake_case key is required, not a style choice.
    vi.stubGlobal("fetch", modelsResponse({ data: [{ id: "Qwen/Qwen3-VL-Reranker-2B", max_model_len: 16_384 }] }));
    await expect(fetchEngineMaxModelLen("rerank")).resolves.toBe(16_384);
  });

  test("an unreachable embed engine degrades to null (caller uses the env floor)", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("fetch failed")));
    await expect(fetchEngineMaxModelLen("embed")).resolves.toBeNull();
  });
});
