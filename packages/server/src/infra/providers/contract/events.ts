// infra/providers/contract/events — the per-turn observability vocab a chat/agent runner emits BESIDES
// the reply text + final usage. METADATA only (never RP content — that lives in the DB). Returned on
// `ChatResult.events` AND logged live so auto-compaction, transient retries, and rate-limit warnings are
// observable via /api/_debug without scanning model output. Infra-internal (behind the contract barrel):
// only the providers backends build these and the chat/buddy domains read them; not a wire shape.
//
// SDK-DECOUPLED: neo typed several fields with `@anthropic-ai/claude-agent-sdk` types (SDKStatus,
// SDKRateLimitInfo, …). The core stays SDK-free (the SDK is the agent-sdk backend's private dep, D8) —
// status/limit fields are plain `string`/`number`; the agent-sdk backend maps its SDK events into this
// shape at its boundary. The streaming token-delta shape (`ChatDeltaEvent`) is re-exported from
// `@orb/contracts/chat` (its canonical home) so a runner's `onDelta` signature lines up with the domain.

import type { WarningCode } from "./resolve";

/** The streaming token-delta the chat domain consumes — canonical home is `@orb/contracts/chat`. */
export type { ChatDeltaEvent } from "@orb/contracts/chat";

/** Per-turn rate-limit snapshot — the ban-risk canary surfaced loudly on the sub path. Emitted via a
 *  `ChatEvent` of `kind:"rate_limit"` and carried as the latest on `ChatResult.rateLimit`. */
export interface RateLimitSnapshot {
  /** Provider-reported status string (e.g. "allowed" | "allowed_warning" | "rejected"). */
  readonly status: string;
  /** Which limit bucket tripped — undefined when the provider doesn't report it (OpenRouter). */
  readonly rateLimitType: string | undefined;
  readonly resetsAt: number | undefined;
  readonly utilization: number | undefined;
  /** True when consuming overage beyond the subscription limit — surface loudly (ban-risk canary). */
  readonly isUsingOverage: boolean | undefined;
  /** Threshold fraction (0–1) crossed to trigger this event (e.g. 0.75). */
  readonly surpassedThreshold: number | undefined;
  /** The overage bucket's own status (allowed | allowed_warning | rejected) — undefined when the provider
   *  reports no separate overage window. */
  readonly overageStatus: string | undefined;
  /** Epoch-ms the overage window resets, when reported. */
  readonly overageResetsAt: number | undefined;
  /** WHY overage is unavailable (e.g. "out_of_credits" | "org_level_disabled" | "overage_not_provisioned")
   *  — the actionable "why the fallback is off" signal; undefined when overage is available/in use. */
  readonly overageDisabledReason: string | undefined;
  /** A hard error code on the limit (currently only "credits_required") — the ban-risk / wallet-blocked
   *  signal that the subscription is exhausted AND overage can't cover it. Undefined in the normal case. */
  readonly errorCode: string | undefined;
}

/**
 * Structured events a runner emits during a turn. Metadata only; the agent-sdk backend populates these
 * richly, the stateless backends mostly return `[]` (their transient events surface as a thrown
 * {@link ProviderError} instead). The discriminator is `kind`.
 */
export type ChatEvent =
  | {
      readonly kind: "compaction";
      readonly at: number;
      readonly trigger: "manual" | "auto";
      readonly preTokens: number;
      readonly postTokens: number | undefined;
      readonly durationMs: number | undefined;
      readonly preserved: boolean;
    }
  | {
      readonly kind: "api_retry";
      readonly at: number;
      readonly attempt: number;
      readonly maxRetries: number;
      readonly retryDelayMs: number;
      readonly errorStatus: number | null;
    }
  | {
      readonly kind: "rate_limit";
      readonly at: number;
      readonly status: string;
      readonly rateLimitType: string | undefined;
      readonly resetsAt: number | undefined;
      readonly utilization: number | undefined;
      /** True when consuming overage beyond the subscription limit — the ban-risk canary event consumers
       *  branch on (the event was a lossy projection of the snapshot; this is the one signal worth it). */
      readonly isUsingOverage: boolean | undefined;
    }
  | {
      readonly kind: "status";
      readonly at: number;
      readonly status: string;
      readonly compactResult: "success" | "failed" | undefined;
    }
  | {
      readonly kind: "auth_status";
      readonly at: number;
      readonly isAuthenticating: boolean;
      readonly error: string | undefined;
    }
  | {
      // Silent-downgrade detection: the backend billed a different model than requested (overage /
      // rate-limit fallback). The UI renders an "actually served by X" badge.
      readonly kind: "model_downgrade";
      readonly at: number;
      readonly requested: string;
      readonly billed: readonly string[];
    }
  | {
      // resolve-chat dropped/ignored a knob the model can't honor (e.g. a temperature the model exposes
      // no range for — the old `agentSdkHonorsTemperature` surface). Metadata only; the UI can toast it.
      // `code` is the machine-dispatchable reason; `message` is the readable detail.
      readonly kind: "warning";
      readonly at: number;
      readonly code: WarningCode;
      readonly message: string;
    }
  | {
      // A safety-classifier refusal (agent-sdk `model_refusal_fallback`/`model_refusal_no_fallback`).
      // Without this event a refusal is only visible as a bare `finishReason:"filter"` — the category
      // and whether a fallback model retried the turn are the actionable parts. `category` is an OPEN
      // vocab ("cyber", "bio", …; new values ship on the wire ahead of schema); `explanation` is
      // unstable human prose — display only, never parse.
      readonly kind: "refusal";
      readonly at: number;
      /** The model whose request was refused. */
      readonly model: string;
      readonly category: string | null;
      readonly explanation: string | null;
      /** True when the runtime retried on a fallback model (the turn may still have succeeded). */
      readonly retried: boolean;
      /** The fallback model that retried, when `retried`. */
      readonly fallbackModel: string | null;
    }
  | {
      // A tool call was auto-denied by the SDK permission layer (SDKResult.permission_denials). With our
      // LOCKED tool-less config this MUST always be empty — a non-empty list means a tool leaked past the
      // roleplay firewall, so this event exists to make that never-fire case LOUD (never silent). Distinct
      // from `warning` (a resolve-chat dropped-knob) — this is a firewall-breach signal, security-load-bearing.
      readonly kind: "permission_leak";
      readonly at: number;
      /** The tool names the SDK denied (the leak surface — never the tool_input, which could carry content). */
      readonly toolNames: readonly string[];
    };
