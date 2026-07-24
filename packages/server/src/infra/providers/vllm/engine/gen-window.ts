// The gen engine's self-reported context window. vLLM's OpenAI server exposes `GET /v1/models`, and each
// `data[]` entry carries `max_model_len` — the ACTUAL window the engine launched with (both the full HF id
// AND the slash-free alias entry report it). This is the TRUTH source the resolved vllm ModelCapability
// prefers over the env floor: a `--max-model-len` bump takes effect the moment the engine restarts, no
// redeploy of the app's env needed. Loopback-only, no credential. Returns null on any failure (engine
// warming / disabled / unexpected shape) so the caller degrades to the env default — never a guessed cap.

import { engineBaseUrl } from "./client";

interface ModelsListEntry {
  readonly id?: unknown;
  readonly max_model_len?: unknown;
}
interface ModelsListResponse {
  readonly data?: readonly ModelsListEntry[];
}

/** GET the gen engine's `/v1/models` and return the first positive `max_model_len` across its entries
 *  (the full-id and alias rows report the same value). null on unreachable/malformed — the caller falls
 *  back to the env-owned window. */
export async function fetchGenMaxModelLen(signal?: AbortSignal): Promise<number | null> {
  const url = `${engineBaseUrl("gen")}/v1/models`;
  let res: Response;
  try {
    res = await fetch(url, { method: "GET", ...(signal !== undefined ? { signal } : {}) });
  } catch {
    return null;
  }
  if (!res.ok) {
    return null;
  }
  const body = (await res.json().catch(() => null)) as ModelsListResponse | null;
  for (const entry of body?.data ?? []) {
    const len = entry.max_model_len;
    if (typeof len === "number" && Number.isInteger(len) && len > 0) {
      return len;
    }
  }
  return null;
}
