// infra/providers/backends/anth-direct/errors — map an `@anthropic-ai/sdk` failure → the ONE typed
// `ProviderError` taxonomy (contract/errors.ts). REUSES the kit classification path
// (`classifyHttpStatus` + `sanitizeApiError`, part 02 §5e) — it does NOT reinvent the status table.
//
// WHY NOT `providerErrorFromHttp` VERBATIM: the kit's HTTP builder reads a `statusCode` field (the
// undici / `@openrouter/sdk` convention). The Anthropic SDK's typed exceptions
// (`AuthenticationError`/`RateLimitError`/`BadRequestError`/`APIError`) expose the status as `.status`
// (error.d.ts:4-6), so this module peels `.status` off the SDK exception, then routes it through the SAME
// kit `classifyHttpStatus` table + the SAME `sanitizeApiError` scrub. One taxonomy, one status table —
// only the field name where the status lives differs by SDK.
//
// SECURITY: the SDK exception's `.error` body can carry an upstream message — it is sanitized BEFORE it
// reaches the `ProviderError.message`, so an HTML error page / control-char blob can't poison logs/UI. The
// credential NEVER appears here (it rides only the outbound Bearer header, part 02 §6.4).

import { errorMessage } from "@orb/kit/error-message";
import { ProviderError } from "../../contract";
import { classifyHttpStatus, sanitizeApiError } from "../kit";

const MS_PER_SECOND = 1000;

// File-local: narrow an unknown to a string-keyed record without an `as` cast (biome bans a lone `as`).
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

// File-local: read the numeric `.status` the Anthropic SDK's `APIError` subclasses attach (error.d.ts:5).
// `undefined` for a connection/abort failure (`APIConnectionError` has `status: undefined`) or a
// non-SDK throw — the caller then falls through to the `unknown` floor.
function readAnthStatus(error: unknown): number | undefined {
  if (!isRecord(error)) {
    return;
  }
  const status = error["status"];
  return typeof status === "number" ? status : undefined;
}

// File-local: a `retry-after` (seconds) → an epoch-ms `resetsAt`, when the SDK exposes it on the error's
// headers. Best-effort: absent/unparseable ⇒ no `resetsAt` (the caller still classifies `rate_limit`).
function readRetryAfterMs(error: unknown, now: number): number | undefined {
  if (!isRecord(error)) {
    return;
  }
  const headers = error["headers"];
  const raw = headers instanceof Headers ? headers.get("retry-after") : undefined;
  if (raw === null || raw === undefined) {
    return;
  }
  const seconds = Number.parseInt(raw, 10);
  return Number.isFinite(seconds) && seconds > 0 ? now + seconds * MS_PER_SECOND : undefined;
}

/**
 * Build a {@link ProviderError} from any anth-direct failure. When the SDK exception carries a numeric
 * `.status`, classify it through the kit `classifyHttpStatus` table (401→auth_failed · 429→rate_limit ·
 * 5xx/529→server retryable · 402→billing · 400/413/422→invalid). A status-less failure (connection /
 * abort / non-SDK throw) → the `unknown` floor. The message is sanitized BEFORE concatenation and prefixed
 * with the model label; a `429` attaches `resetsAt` from `retry-after` when present. `now` is injected (the
 * determinism seam — no ambient clock).
 */
export function anthDirectError(error: unknown, model: string, now: number): ProviderError {
  const status = readAnthStatus(error);
  const { kind, retryable } = classifyHttpStatus(status);
  const safe = sanitizeApiError(errorMessage(error));
  const resetsAt = kind === "rate_limit" ? readRetryAfterMs(error, now) : undefined;
  return new ProviderError({
    kind,
    retryable,
    message: `anth-direct chat (${model}): ${safe}`,
    model,
    ...(status !== undefined ? { apiErrorStatus: status } : {}),
    ...(resetsAt !== undefined ? { resetsAt } : {}),
    cause: error,
  });
}
