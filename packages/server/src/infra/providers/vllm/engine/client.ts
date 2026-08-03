// The family's ONE loopback HTTP seam. Engines are supervised children, loopback-only, OpenAI-compatible.
// A connection-refused while an engine is still warming is the EXPECTED first-minutes state, so it maps
// to a retryable {@link ProviderError} enriched with the supervisor's known status (`failed` is the one
// non-retryable lifecycle state). Two seams: `enginePost` (typed JSON) and `engineStream` (raw SSE bytes).

import { ProviderError } from "../../contract/index.ts";
import { getEngineStatus } from "./engine-status.ts";
// engineBaseUrl lives in the engine-url LEAF (extracted to break the client↔wake-gate↔fleet-control cycle).
import { engineBaseUrl } from "./engine-url.ts";
import type { VLLM_ENGINES } from "./engines.ts";
import type { WakeGateDeps } from "./wake-gate.ts";
import { ensureAwake } from "./wake-gate.ts";

type VllmEngine = (typeof VLLM_ENGINES)[number];

// HTTP statuses a request body / shape error uses (vLLM rejects over-long or malformed input with these).
const HTTP_BAD_REQUEST = 400;
const HTTP_UNPROCESSABLE = 422;
const HTTP_SERVER_ERROR_FLOOR = 500;
// Cap the upstream error text we echo into a ProviderError message (operator-facing; not secret-bearing).
const ERROR_TEXT_CAP = 500;

// DEFAULT REQUEST TIMEOUT (F6): a non-streaming engine POST (summarize/structured/tool-round — the rpg state
// round's vehicle) has NO natural bound today, so a hung/black-holed socket leaves the caller's promise
// UNSETTLED forever. Downstream that means the rpg flush promise never settles → the flush-barrier entry never
// clears → every later turn on that chat eats the full 15s `awaitInFlight` bound until process restart (the
// permanent per-chat leak the stickler flagged). A bounded default makes an engine POST ALWAYS settle (as a
// retryable timeout error), so the flush promise settles and the barrier entry self-clears. The BOUND: 120s —
// matching the agent-sdk summarize watchdog precedent (`summarize.ts`). A state-round generation is normally
// seconds; 120s is generous headroom for a busy GPU while still being finite (never infinite). It composes with
// any caller-supplied signal (`AbortSignal.any`), so a real abort still cancels earlier.
const DEFAULT_ENGINE_TIMEOUT_MS = 120_000;

/** Compose the caller's optional signal with the default request-timeout signal — whichever aborts first wins.
 *  Always returns a live signal (the timeout is unconditional), so no engine POST/stream-open can hang forever. */
function withTimeout(signal: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(DEFAULT_ENGINE_TIMEOUT_MS);
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
}

/** The injected HTTP surface the surfaces close over (the real impl, or a test fake). One generic POST +
 *  one streaming POST cover all five roles; surfaces never construct URLs or map transport errors. */
export interface VllmEngineClient {
  readonly enginePost: <T>(engine: VllmEngine, path: string, body: unknown, signal?: AbortSignal) => Promise<T>;
  readonly engineStream: (engine: VllmEngine, path: string, body: unknown, signal?: AbortSignal) => Promise<ReadableStream<Uint8Array>>;
  readonly baseUrl: (engine: VllmEngine) => string;
}

// Build the actionable "engine not reachable" error from the supervisor's known status (if any). A
// TimeoutError (the default-bound `AbortSignal.timeout` fired — the socket hung past DEFAULT_ENGINE_TIMEOUT_MS)
// is a distinct, retryable story: the engine was reachable enough to connect but never answered in the bound.
function unreachable(engine: VllmEngine, url: string, cause: unknown): ProviderError {
  if (cause instanceof DOMException && cause.name === "TimeoutError") {
    return new ProviderError({
      kind: "server",
      retryable: true,
      message: `vllm ${engine} request at ${url} exceeded the ${DEFAULT_ENGINE_TIMEOUT_MS}ms bound (hung/slow engine) — aborted so the caller's promise settles.`,
      cause,
    });
  }
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

/** The per-request knobs both seams share: the caller's abort signal and the auto-wake gate's I/O override
 *  (undefined ⇒ the gate's real loopback impls). Grouped so each seam stays within the param budget. */
interface RequestOpts {
  readonly signal: AbortSignal | undefined;
  readonly wake: WakeGateDeps | undefined;
}

/** POST a JSON body to an engine endpoint; typed JSON back or a mapped {@link ProviderError}. */
async function enginePost<T>(engine: VllmEngine, path: string, body: unknown, opts: RequestOpts): Promise<T> {
  // Pre-dispatch AUTO-WAKE gate (B.1/B.6): a request to a SLEEPING engine silently queues forever, so wake it
  // FIRST (single-flight, VRAM/hold-gated) rather than react to an error that never comes. Near-free for an
  // awake engine (a cached observation, else one loopback /is_sleeping GET). A wake refusal throws a named,
  // non-retryable ProviderError.
  await ensureAwake(engine, opts.wake);
  const url = `${engineBaseUrl(engine)}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      // ALWAYS signalled (F6): the default request-timeout composed with any caller signal, so a hung socket
      // aborts at the bound and the caller's promise settles instead of leaking forever.
      signal: withTimeout(opts.signal),
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
async function engineStream(engine: VllmEngine, path: string, body: unknown, opts: RequestOpts): Promise<ReadableStream<Uint8Array>> {
  await ensureAwake(engine, opts.wake); // pre-dispatch auto-wake gate (see enginePost) — the streaming chat path.
  const url = `${engineBaseUrl(engine)}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      // NO default timeout on the STREAM path (deliberately, unlike enginePost): an `AbortSignal.timeout` here
      // would abort the whole response INCLUDING an in-flight body stream, cutting a legitimately-long chat
      // generation mid-token. A stream's lifetime is the turn's — the caller threads the turn's abort `signal`,
      // and the SSE reducer owns per-chunk idle handling. The F6 leak is the non-streaming `enginePost` path
      // (the rpg state round); the streaming chat path is already turn-abortable.
      ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
    });
  } catch (cause) {
    throw unreachable(engine, url, cause);
  }
  if (!res.ok || res.body === null) {
    throw await httpError(engine, path, res);
  }
  return res.body;
}

/** The real (env-backed) engine client — the composition wiring for production. `wake` overrides the auto-wake
 *  gate's I/O (sleep probe / reconcile / GPU query / wake POST); production omits it and the gate uses its own
 *  real loopback impls. A test injects it to drive the sleeping/held/refused arms through THIS seam without
 *  shelling out to `ps`/`nvidia-smi` or touching a real fleet. */
export function createVllmEngineClient(wake?: WakeGateDeps): VllmEngineClient {
  return {
    enginePost: (engine, path, body, signal) => enginePost(engine, path, body, { signal, wake }),
    engineStream: (engine, path, body, signal) => engineStream(engine, path, body, { signal, wake }),
    baseUrl: engineBaseUrl,
  };
}
