// infra/providers/backends/kit/error-classify — the HTTP-status → typed `ProviderErrorKind` table, plus
// the transport-name fallback and the one-line `ProviderError` builder every HTTP-based runner classifies
// through. ONE home for "an HTTP failure → our cross-provider error vocab" so adding a status is a
// one-file edit, not a hunt across runners.
//
// SCOPE (orbweaver vs neo): neo's error-classify also held the Agent-SDK assistant/result-subtype
// classifiers (which import `@anthropic-ai/claude-agent-sdk`). The SDK is the agent-sdk backend's PRIVATE
// dep (D8 — the core stays SDK-free) and kit sits BELOW the backends, so those classifiers do NOT live
// here — they belong to `backends/agent-sdk`. This module is the HTTP path only.

import { errorMessage } from "@orb/kit/error-message";
import type { ProviderErrorKind, ProviderScrubSet } from "../../contract/index.ts";
import { ProviderError } from "../../contract/index.ts";
import { redactSecretsFromText } from "./openai-compat/body.ts";
import { NO_PROVIDER_SECRETS, sanitizeApiError } from "./sanitize.ts";

// Transport-name patterns on the hot error-classification path.
const TRANSIENT_TRANSPORT_RE = /timeout|connection|network|overload/i;
const ABORT_NAME_RE = /abort/i;

// Documented OpenAI/OpenRouter/Anthropic status codes (named per noMagicNumbers).
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_PAYMENT_REQUIRED = 402;
const HTTP_NOT_FOUND = 404;
const HTTP_TIMEOUT = 408;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_UNPROCESSABLE = 422;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAVAILABLE_LEGAL = 451;
const HTTP_SERVER_ERROR_FLOOR = 500;

/** A classified failure — the typed kind + whether a retry could plausibly succeed. */
export interface ErrorClassification {
  readonly kind: ProviderErrorKind;
  readonly retryable: boolean;
}

/** Structured diagnostic peeled off an HTTP-error chain — safe to put on a log record (sanitized). */
export interface HttpErrorDiagnostic {
  /** Raw upstream response body, sanitized + length-capped. Absent when the chain carries no `body`. */
  readonly body?: string;
  /** Summary of the immediate `.cause` (typically the SDK's zod parse failure), sanitized. */
  readonly cause?: string;
}

// File-local: narrow an unknown to a string-keyed record without an `as` cast (biome bans single `as`).
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

/**
 * Map an HTTP status → the typed error kind. Exhaustive over the documented codes; an unmapped code →
 * `unknown` (non-retryable) so we never silently treat it as transient.
 */
export function classifyHttpStatus(status: number | undefined): ErrorClassification {
  if (status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN) {
    // 401 = bad/missing key; 403 = insufficient perms OR a guardrail block. Non-retryable either way.
    return { kind: "auth_failed", retryable: false };
  }
  if (status === HTTP_PAYMENT_REQUIRED) {
    return { kind: "billing", retryable: false };
  }
  if (status === HTTP_NOT_FOUND) {
    return { kind: "model_unavailable", retryable: false };
  }
  if (status === HTTP_TOO_MANY_REQUESTS) {
    return { kind: "rate_limit", retryable: true };
  }
  if (
    status === HTTP_BAD_REQUEST ||
    status === HTTP_PAYLOAD_TOO_LARGE ||
    status === HTTP_UNPROCESSABLE ||
    // RFC 7725 "Unavailable For Legal Reasons" — a permanent content/jurisdiction block. Map to
    // `invalid` (not the generic `unknown`) so the UI says "this request can't be served".
    status === HTTP_UNAVAILABLE_LEGAL
  ) {
    return { kind: "invalid", retryable: false };
  }
  if (status === HTTP_TIMEOUT || (status !== undefined && status >= HTTP_SERVER_ERROR_FLOOR)) {
    // 408 Request Timeout + 5xx — all transient.
    return { kind: "server", retryable: true };
  }
  return { kind: "unknown", retryable: false };
}

/**
 * Fallback classifier for when no HTTP status is present (connection failures, aborts, in-band SSE errors
 * with no code). Universal patterns every undici/node-fetch runner sees. `null` when nothing matches so the
 * caller can decide on the `unknown` floor.
 */
export function classifyTransportName(name: string, message: string): ErrorClassification | null {
  // ABORT WINS, and it is tested FIRST (belt to `abort-flatten.ts`'s braces): an error NAMED an abort is a
  // cancellation whatever its message says, so it can never be retried. Order matters — the transient regex
  // reads the MESSAGE too, and an abort whose message contains "connection"/"timeout" (the whole
  // STRUCTURED-ABORT-REASON-LEAK class) would otherwise be re-run as a transient fault. Nothing legitimately
  // transient is named `*Abort*`.
  if (ABORT_NAME_RE.test(name)) {
    return { kind: "aborted", retryable: false };
  }
  const haystack = `${name} ${message}`;
  if (TRANSIENT_TRANSPORT_RE.test(haystack)) {
    return { kind: "server", retryable: true };
  }
  return null;
}

// File-local: read a numeric `statusCode` off an error-like object (the OpenRouter SDK + undici attach it).
function readStatusCode(error: unknown): number | undefined {
  if (!isRecord(error)) {
    return;
  }
  const status = error["statusCode"];
  return typeof status === "number" ? status : undefined;
}

// OpenRouter content-moderation blocks arrive as `403 { error: { metadata: { reasons: [...] } } }` — the
// non-empty `reasons` array is the definitive signal (a plain 403 is a key/permission failure). The SDK
// attaches `body` as a raw JSON STRING today, but may hand back an already-PARSED object after a version
// change — accept both shapes (belt) and the discriminator is identical either way.
function moderationReasons(body: unknown): unknown {
  const parsed = parseBody(body);
  if (!isRecord(parsed)) {
    return;
  }
  const inner = parsed["error"];
  const metadata = isRecord(inner) ? inner["metadata"] : undefined;
  return isRecord(metadata) ? metadata["reasons"] : undefined;
}

// A string body is JSON-parsed (a non-JSON string isn't a moderation block); an object body passes through.
function parseBody(body: unknown): unknown {
  if (isRecord(body)) {
    return body;
  }
  return typeof body === "string" && body.includes("reasons") ? safeJsonParse(body) : undefined;
}

function safeJsonParse(text: string): unknown {
  // @orb-gate-ignore caught-failure-ownership(default:catch): parsing a provider error body to detect a moderation block; an unparseable body collapses to null (not a moderation block) and classification falls through to the status table — no credential/auth decision, no leak. Ends if a null parse ever forces a green/authorized verdict.
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isModerationBlock(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }
  const reasons = moderationReasons(error["body"]);
  return Array.isArray(reasons) && reasons.length > 0;
}

// File-local: the full HTTP-runner classification path — moderation block → status table → transport-name
// fallback → `unknown` floor. Returns the status so the caller can attach it as `apiErrorStatus`.
function classifyHttpError(error: unknown): ErrorClassification & { status: number | undefined } {
  const status = readStatusCode(error);
  if (isModerationBlock(error)) {
    return { kind: "moderation", retryable: false, status };
  }
  if (status !== undefined) {
    return { ...classifyHttpStatus(status), status };
  }
  const name = error instanceof Error ? error.name : "";
  const transport = classifyTransportName(name, errorMessage(error));
  if (transport !== null) {
    return { ...transport, status: undefined };
  }
  return { kind: "unknown", retryable: false, status: undefined };
}

/**
 * Peel `body` + `cause` off an HTTP-error chain (the OpenRouter SDK carries the raw upstream body + the zod
 * parse failure that wrapped it). Defensive throughout (unknown-narrowing only) so it works for any
 * HTTP-based error; both fields are sanitized before they land on a log record.
 *
 * `secrets` is REQUIRED and branded for the same reason {@link providerErrorFromHttp}'s is (#1599) — the
 * peeled `body` is the reflected upstream body, the single most secret-prone string on this boundary.
 *
 * ORDER (#1809): SCRUB, then sanitize — never the reverse. See {@link sanitizeApiError}'s file header.
 */
export function extractHttpErrorDiagnostic(error: unknown, secrets: ProviderScrubSet): HttpErrorDiagnostic {
  if (!isRecord(error)) {
    return {};
  }
  const out: { body?: string; cause?: string } = {};
  const body = error["body"];
  if (typeof body === "string" && body.length > 0) {
    out.body = sanitizeApiError(redactSecretsFromText(body, secrets));
  }
  const cause = error["cause"];
  if (cause !== undefined && cause !== null) {
    const causeMsg = errorMessage(cause);
    if (causeMsg.length > 0) {
      out.cause = sanitizeApiError(redactSecretsFromText(causeMsg, secrets));
    }
  }
  return out;
}

/**
 * Build a {@link ProviderError} from any HTTP-runner failure: classify it, prefix the message with the
 * caller's provider+endpoint label, attach the status (when known) for curl-ability, and preserve the
 * cause. The message is sanitized BEFORE concatenation so an HTML error page or control-char-laced body
 * can't poison logs/UI.
 *
 * SECURITY (#1599): `secrets` is REQUIRED and is a branded {@link ProviderScrubSet} — it used to default to
 * `[]`, which made the by-value scrub pure call-site discipline on a message that reaches a DURABLE sink
 * (the #1373 strike-out logs it as `securityEvent("credential_revoked", { reason })`). A credential-bearing
 * runner now cannot omit it, and cannot fake it with a bare `[]`: the only two admissible values are
 * `providerCredentialSecretValues(credential)` and the loudly-named `NO_PROVIDER_SECRETS`.
 *
 * ORDER (#1809): the by-value scrub runs FIRST, on intact text, and `sanitizeApiError` mangles what is
 * left — a message reaching that durable sink cannot carry a credential fragment the 500-char cap or the
 * `<…>` strip created. See {@link sanitizeApiError}'s file header.
 */
export function providerErrorFromHttp(error: unknown, prefix: string, secrets: ProviderScrubSet): ProviderError {
  const { kind, retryable, status } = classifyHttpError(error);
  const safe = sanitizeApiError(redactSecretsFromText(errorMessage(error), secrets));
  // Credential-bearing HTTP boundaries must never retain the raw thrown object: SDK/fetch errors can
  // carry reflected bodies, headers and nested causes as enumerable fields that a later logger serializes.
  // Keep the classified status and sanitized message, but replace that opaque graph with a safe cause.
  //
  // The test is the caller's DECLARED nature, not `secrets.length`: a length test also un-guarded a
  // credential-bearing boundary whose set happens to be empty at runtime (a no-auth custom_openai endpoint
  // whose `includeBody` carries key-in-body auth mints `[]`), and that is precisely a keyed path. Only the
  // explicit keyless spelling licenses retaining the raw graph.
  const cause = secrets === NO_PROVIDER_SECRETS ? error : new Error(safe);
  return new ProviderError({
    kind,
    retryable,
    message: `${prefix}: ${safe}`,
    ...(status !== undefined ? { apiErrorStatus: status } : {}),
    cause,
  });
}
