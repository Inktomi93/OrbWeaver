// The family's ONE loopback HTTP seam. Engines are supervised children, loopback-only, OpenAI-compatible.
// A connection-refused while an engine is still warming is the EXPECTED first-minutes state, so it maps
// to a retryable {@link ProviderError} enriched with the supervisor's known status (`failed` is the one
// non-retryable lifecycle state). Two seams: `enginePost` (typed JSON) and `engineStream` (raw SSE bytes).

import { env } from "#foundation/env";
import { ProviderError } from "../../contract";
import { getEngineStatus } from "./engine-status";
import type { VLLM_ENGINES } from "./engines";

type VllmEngine = (typeof VLLM_ENGINES)[number];

// HTTP statuses a request body / shape error uses (vLLM rejects over-long or malformed input with these).
const HTTP_BAD_REQUEST = 400;
const HTTP_UNPROCESSABLE = 422;
const HTTP_SERVER_ERROR_FLOOR = 500;
// Cap the upstream error text we echo into a ProviderError message (operator-facing; not secret-bearing).
const ERROR_TEXT_CAP = 500;

const PORTS: Record<VllmEngine, number> = {
  embed: env.VLLM_EMBED_PORT,
  rerank: env.VLLM_RERANK_PORT,
  gen: env.VLLM_GEN_PORT,
};

/** Loopback base URL for an engine — `http://127.0.0.1:<port>`. */
export function engineBaseUrl(engine: VllmEngine): string {
  return `http://127.0.0.1:${PORTS[engine]}`;
}

/** The injected HTTP surface the surfaces close over (the real impl, or a test fake). One generic POST +
 *  one streaming POST cover all five roles; surfaces never construct URLs or map transport errors. */
export interface VllmEngineClient {
  readonly enginePost: <T>(engine: VllmEngine, path: string, body: unknown, signal?: AbortSignal) => Promise<T>;
  readonly engineStream: (engine: VllmEngine, path: string, body: unknown, signal?: AbortSignal) => Promise<ReadableStream<Uint8Array>>;
  readonly baseUrl: (engine: VllmEngine) => string;
}

// Build the actionable "engine not reachable" error from the supervisor's known status (if any).
function unreachable(engine: VllmEngine, url: string, cause: unknown): ProviderError {
  const known = getEngineStatus(engine);
  const story =
    known !== undefined ? `supervisor says '${known.status}'${known.detail.length > 0 ? ` (${known.detail})` : ""}` : "still warming, or engines disabled?";
  return new ProviderError({
    kind: "server",
    // `failed` (breaker open) is the one state backing off cannot fix — everything else is transient.
    retryable: known?.status !== "failed",
    message:
      `vllm ${engine} engine not reachable at ${url} — ${story} ` +
      "Check the engine logs / supervisor status. " +
      `(${cause instanceof Error ? cause.message : String(cause)})`,
    cause,
  });
}

// Map a non-ok engine response into a typed ProviderError (400/422 = invalid request; 5xx = retryable).
async function httpError(engine: VllmEngine, path: string, res: Response): Promise<ProviderError> {
  const text = await res.text().catch(() => "");
  return new ProviderError({
    kind: res.status === HTTP_BAD_REQUEST || res.status === HTTP_UNPROCESSABLE ? "invalid" : "server",
    retryable: res.status >= HTTP_SERVER_ERROR_FLOOR,
    apiErrorStatus: res.status,
    message: `vllm ${engine} ${path} → HTTP ${res.status}: ${text.slice(0, ERROR_TEXT_CAP)}`,
  });
}

/** POST a JSON body to an engine endpoint; typed JSON back or a mapped {@link ProviderError}. */
async function enginePost<T>(engine: VllmEngine, path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const url = `${engineBaseUrl(engine)}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      ...(signal !== undefined ? { signal } : {}),
    });
  } catch (cause) {
    throw unreachable(engine, url, cause);
  }
  if (!res.ok) {
    throw await httpError(engine, path, res);
  }
  return (await res.json()) as T;
}

/** POST a JSON body and return the raw SSE byte stream (the chat surface drives the reducer over it). */
async function engineStream(engine: VllmEngine, path: string, body: unknown, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  const url = `${engineBaseUrl(engine)}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      ...(signal !== undefined ? { signal } : {}),
    });
  } catch (cause) {
    throw unreachable(engine, url, cause);
  }
  if (!res.ok || res.body === null) {
    throw await httpError(engine, path, res);
  }
  return res.body;
}

/** The real (env-backed) engine client — the composition wiring for production. */
export function createVllmEngineClient(): VllmEngineClient {
  return { enginePost, engineStream, baseUrl: engineBaseUrl };
}
