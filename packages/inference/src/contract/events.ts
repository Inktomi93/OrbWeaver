// The per-turn observability vocabulary a chat backend emits besides the reply text + final usage. Metadata
// only, never RP content. SDK-decoupled: status/limit fields are plain string/number, never an
// `@anthropic-ai/claude-agent-sdk` or `@ai-sdk/*` type — each backend maps its events at its boundary.

import type { AdjustedKnob } from "@orb/contracts/chat";
import type { EffortLevel } from "@orb/contracts/inference";
import type { WarningCode } from "./resolve.ts";

export type { ChatDeltaEvent } from "@orb/contracts/chat";

/** The ban-risk canary surfaced loudly on the subscription path. */
export interface RateLimitSnapshot {
  readonly status: string;
  readonly rateLimitType: string | undefined;
  readonly resetsAt: number | undefined;
  readonly utilization: number | undefined;
  readonly isUsingOverage: boolean | undefined;
  readonly surpassedThreshold: number | undefined;
  readonly overageStatus: string | undefined;
  readonly overageResetsAt: number | undefined;
  readonly overageDisabledReason: string | undefined;
  readonly errorCode: string | undefined;
}

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
      // Silent-downgrade detection: the backend billed a different model than requested.
      readonly kind: "model_downgrade";
      readonly at: number;
      readonly requested: string;
      readonly billed: readonly string[];
    }
  | {
      // The runner's honest-degrade report — a `ResolvedWarning` carried whole, never re-derived.
      readonly kind: "warning";
      readonly at: number;
      readonly code: WarningCode;
      readonly message: string;
      readonly knob?: AdjustedKnob | undefined;
      readonly key?: string | undefined;
      readonly field?: string | undefined;
      readonly appliedBudget?: number | undefined;
      readonly appliedEffort?: EffortLevel | undefined;
    }
  | {
      // `category` is an open vocab; `explanation` is unstable human prose — display only, never parse.
      readonly kind: "refusal";
      readonly at: number;
      readonly model: string;
      readonly category: string | null;
      readonly explanation: string | null;
      readonly retried: boolean;
      readonly fallbackModel: string | null;
    }
  | {
      // With the locked tool-less chat discipline this MUST be empty — a non-empty list means a tool leaked
      // past the discipline (security-load-bearing, never silent).
      readonly kind: "permission_leak";
      readonly at: number;
      readonly toolNames: readonly string[];
    };
