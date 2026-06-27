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
    };
