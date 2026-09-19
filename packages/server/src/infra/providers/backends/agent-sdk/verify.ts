// infra/providers/backends/agent-sdk/verify — the init-frame SHAPE GUARD + the SDK error classifiers.
// All three speak the SDK's PRIVATE vocab (SDKAssistantMessageError codes, SDKResultError subtypes, the
// init frame), so they live in THIS backend (D8 — the SDK is the agent-sdk backend's private dep), NOT
// in the shared `backends/kit` (which is SDK-free OpenAI-wire helpers). They map onto the SDK-free
// `ProviderErrorKind` vocab so the runner builds one `ProviderError` surface for every caller.

import type { SDKAssistantMessageError, SDKResultError, TerminalReason } from "@anthropic-ai/claude-agent-sdk";
import type { ProviderErrorKind } from "../../contract/index.ts";

/** A classification result: the normalized kind + whether a retry could plausibly recover the turn. */
interface Classification {
  readonly kind: ProviderErrorKind;
  readonly retryable: boolean;
}

/**
 * The init-frame SHAPE GUARD (Tier-3b-Providers.md Esoteric §3). The SDK's `system/init` frame carries the
 * `session_id` every later resume lookup is keyed by, plus `apiKeySource` (the sub-vs-key canary). If a
 * future SDK version drops/renames either, every subsequent `session_id`-keyed lookup would silently
 * corrupt — so we throw LOUDLY at the first turn instead of orphaning a thousand session rows later. A
 * fresh boot fails fast; pin or upgrade the SDK carefully when this fires.
 */
export function assertInitFrameShape(message: unknown): void {
  const init = message as { session_id?: unknown; apiKeySource?: unknown };
  if (typeof init.session_id !== "string" || init.session_id.length === 0) {
    throw new Error("agent-sdk: init frame is missing session_id (SDK shape changed?). Pin or upgrade carefully.");
  }
  if (typeof init.apiKeySource !== "string") {
    throw new Error("agent-sdk: init frame is missing apiKeySource (SDK shape changed?). Pin or upgrade carefully.");
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

/**
 * Classify an SDK loop-level `TerminalReason` → the normalized vocab. Exhaustive over the 19-member union
 * (SDK 0.3.206) so a new member is a `tsc` error, never a silent collapse to a generic subtype. Unlike
 * `classifyResultSubtype` (4 coarse subtypes), the terminal reason distinguishes the ban-risk +
 * context-overflow + input-error causes an error RESULT otherwise flattens — `buildResultError` prefers
 * it. Ban-risk vs transient: `blocking_limit` is a HARD block (fail-fast, non-retryable — retrying courts
 * the ban the locked decisions guard against); `rapid_refill_breaker` is a transient breaker (retry after
 * backoff). Both keep `kind:"rate_limit"`; the specific member rides `terminalReason`/`detail` provenance
 * so a consumer distinguishes them without a new error kind.
 */
export function classifyTerminalReason(reason: TerminalReason): Classification {
  switch (reason) {
    case "blocking_limit":
      return { kind: "rate_limit", retryable: false };
    case "rapid_refill_breaker":
      return { kind: "rate_limit", retryable: true };
    case "prompt_too_long":
    case "image_error":
      return { kind: "invalid", retryable: false };
    // Deferral requested against a runtime/config that can't honor it — a retry won't make the feature
    // exist, so it classifies with the input errors, not the aborts (unlike `tool_deferred`, a clean stop).
    case "tool_deferred_unavailable":
      return { kind: "invalid", retryable: false };
    case "model_error":
      return { kind: "server", retryable: true };
    // Upstream API fault / pre-turn setup (spawn) fault / the model exhausting the runtime's own
    // malformed-tool-use retries — all transient generation-side faults, same treatment as `model_error`.
    case "api_error":
    case "turn_setup_failed":
    case "malformed_tool_use_exhausted":
      return { kind: "server", retryable: true };
    // The caller-imposed spend ceiling — mirrors `error_max_budget_usd` (classifyResultSubtype): a
    // retry burns budget again, never auto-retry into spend.
    case "budget_exhausted":
      return { kind: "billing", retryable: false };
    // Mirrors `error_max_structured_output_retries`: the schema/output contract can't be met as-given.
    case "structured_output_retry_exhausted":
      return { kind: "invalid", retryable: false };
    case "aborted_streaming":
    case "aborted_tools":
    case "stop_hook_prevented":
    case "hook_stopped":
    case "tool_deferred":
    case "max_turns":
    case "background_requested":
      return { kind: "aborted", retryable: false };
    case "completed":
      // A `completed` terminal reason on the ERROR path is contradictory — treat conservatively as a
      // transient server fault (it never reaches the success return, which handles the normal completion).
      return { kind: "server", retryable: true };
    default:
      return assertNeverClassification(reason);
  }
}

/** Compile-time exhaustiveness guard — a new SDK union member makes `value` non-`never` (a `tsc` error).
 *  Falls back to the conservative non-retryable "unknown" if ever reached at runtime. */
function assertNeverClassification(_value: never): Classification {
  return { kind: "unknown", retryable: false };
}
