// infra/providers/backends/agent-sdk/verify — the init-frame SHAPE GUARD + the SDK error classifiers.
// All three speak the SDK's PRIVATE vocab (SDKAssistantMessageError codes, SDKResultError subtypes, the
// init frame), so they live in THIS backend (D8 — the SDK is the agent-sdk backend's private dep), NOT
// in the shared `backends/kit` (which is SDK-free OpenAI-wire helpers). They map onto the SDK-free
// `ProviderErrorKind` vocab so the runner builds one `ProviderError` surface for every caller.

import type { SDKAssistantMessageError, SDKResultError } from "@anthropic-ai/claude-agent-sdk";
import type { ProviderErrorKind } from "../../contract";

/** A classification result: the normalized kind + whether a retry could plausibly recover the turn. */
interface Classification {
  readonly kind: ProviderErrorKind;
  readonly retryable: boolean;
}

/**
 * The init-frame SHAPE GUARD (providers.md Esoteric §3). The SDK's `system/init` frame carries the
 * `session_id` every later resume lookup is keyed by, plus `apiKeySource` (the sub-vs-key canary). If a
 * future SDK version drops/renames either, every subsequent `session_id`-keyed lookup would silently
 * corrupt — so we throw LOUDLY at the first turn instead of orphaning a thousand session rows later. A
 * fresh boot fails fast; pin or upgrade the SDK carefully when this fires.
 */
export function assertInitFrameShape(message: unknown): void {
  const init = message as { session_id?: unknown; apiKeySource?: unknown };
  if (typeof init.session_id !== "string" || init.session_id.length === 0) {
    throw new Error(
      "agent-sdk: init frame is missing session_id (SDK shape changed?). Pin or upgrade carefully.",
    );
  }
  if (typeof init.apiKeySource !== "string") {
    throw new Error(
      "agent-sdk: init frame is missing apiKeySource (SDK shape changed?). Pin or upgrade carefully.",
    );
  }
}

/**
 * Classify an SDK assistant-error code → the normalized vocab. Exhaustive (no `default`) so a new SDK
 * error code is a `tsc` error here, not a silent collapse to "server". `overloaded` (SDK ≥0.3.161) is
 * transient capacity pressure; `max_output_tokens` is retryable (a smaller cap / continuation recovers).
 */
export function classifyAssistantError(code: SDKAssistantMessageError): Classification {
  switch (code) {
    case "authentication_failed":
    case "oauth_org_not_allowed":
      return { kind: "auth_failed", retryable: false };
    case "billing_error":
      return { kind: "billing", retryable: false };
    case "rate_limit":
      return { kind: "rate_limit", retryable: true };
    case "invalid_request":
      return { kind: "invalid", retryable: false };
    case "model_not_found":
      return { kind: "model_unavailable", retryable: false };
    case "max_output_tokens":
      return { kind: "max_output", retryable: true };
    case "server_error":
    case "overloaded":
      return { kind: "server", retryable: true };
    case "unknown":
      return { kind: "unknown", retryable: false };
    default:
      return assertNeverClassification(code);
  }
}

/**
 * Classify an SDK error-RESULT subtype → the normalized vocab. Exhaustive over
 * `SDKResultError["subtype"]`. `error_max_turns` maps to `aborted` (a tool loop hit its ceiling — not a
 * server fault and not worth retrying as-is).
 */
export function classifyResultSubtype(subtype: SDKResultError["subtype"]): Classification {
  switch (subtype) {
    case "error_during_execution":
      return { kind: "server", retryable: true };
    case "error_max_turns":
      return { kind: "aborted", retryable: false };
    case "error_max_budget_usd":
      return { kind: "billing", retryable: false };
    case "error_max_structured_output_retries":
      return { kind: "invalid", retryable: false };
    default:
      return assertNeverClassification(subtype);
  }
}

/** Compile-time exhaustiveness guard — a new SDK union member makes `value` non-`never` (a `tsc` error).
 *  Falls back to the conservative non-retryable "unknown" if ever reached at runtime. */
function assertNeverClassification(_value: never): Classification {
  return { kind: "unknown", retryable: false };
}
