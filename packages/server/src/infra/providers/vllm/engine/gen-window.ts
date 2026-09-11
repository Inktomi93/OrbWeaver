// Each engine's self-reported context window. vLLM's OpenAI server exposes `GET /v1/models`, and each
// `data[]` entry carries `max_model_len` — the ACTUAL window the engine launched with (the full HF id AND
// the slash-free alias entry report it). This is the TRUTH source the resolved vllm capability math prefers
// over the env floor: a `--max-model-len` bump takes effect the moment the engine restarts, no redeploy of
// the app's env needed. Loopback-only, no credential. Returns null on any failure (engine warming / disabled
// / unexpected shape) so the caller degrades to the env default — never a guessed cap. Applies to all three
// engines (gen for the fit ceiling; embed + rerank for the 8192-consumers' pooling window).

import { engineBaseUrl } from "./engine-url.ts";
import type { VLLM_ENGINES } from "./engines.ts";

type VllmEngine = (typeof VLLM_ENGINES)[number];

interface ModelsListEntry {
  readonly id?: unknown;
  readonly max_model_len?: unknown;
}
interface ModelsListResponse {
  readonly data?: readonly ModelsListEntry[];
}

/** GET an engine's `/v1/models` and return the first positive `max_model_len` across its entries (the
 *  full-id and alias rows report the same value). null on unreachable/malformed — the caller falls back to
 *  the env-owned window for that engine. */
export async function fetchEngineMaxModelLen(engine: VllmEngine, signal?: AbortSignal): Promise<number | null> {
  const url = `${engineBaseUrl(engine)}/v1/models`;
  let res: Response;
  // @orb-waive caught-failure-ownership(catch): an engine /v1/models fetch failure returns null → the caller falls back to the env-owned context window; local engine, no auth/credential. Ends if null is read as a usable window.
  try {
    res = await fetch(url, { method: "GET", ...(signal !== undefined ? { signal } : {}) });
  } catch {
    return null;
  }
  if (!res.ok) {
    return null;
  }
  // @orb-waive caught-failure-ownership(res.json): a malformed /v1/models body collapses to null → env-owned window fallback; local engine data read, no auth/credential. Ends if null is read as a usable window.
  const body = (await res.json().catch(() => null)) as ModelsListResponse | null;
  for (const entry of body?.data ?? []) {
    const len = entry.max_model_len;
    if (typeof len === "number" && Number.isInteger(len) && len > 0) {
      return len;
    }
  }
  return null;
}
