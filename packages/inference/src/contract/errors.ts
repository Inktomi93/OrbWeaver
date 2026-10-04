// The provider-agnostic failure surface every task dispatcher and backend maps its errors onto. ONE error
// class across every task so a consumer catches a single type regardless of which backend threw.
//
// SECURITY: a `ProviderError.message` is operator-facing and MUST NOT carry key/token material — dispatch
// constructs messages from the task/wire/provider vocabulary only; the wire-level secret scrub
// (`backends/kit/sanitize.ts`) is a backend concern.

import type { WireSchemaViolation } from "@orb/contracts/inference";
import type { SummarizeResultItem } from "@orb/contracts/providers";
import type { AgentSdkSessionId } from "./identity.ts";

declare const providerScrubSet: unique symbol;

/** The by-value scrub set an HTTP boundary hands the error classifier: a `readonly string[]` with a phantom
 *  brand, so it flows INTO every plain-array consumer while nothing flows into it. The brand makes "no
 *  scrub" UNWRITABLE BY ACCIDENT (#1599): `providerErrorFromHttp`'s message reaches a DURABLE sink (the
 *  #1373 revoke trail), and a runner that forgets the scrub set would otherwise ship an unscrubbed upstream
 *  message there with no compile-time tell. Producers: `resolvedScrubSet` and
 *  `NO_PROVIDER_SECRETS` in `backends/kit/sanitize.ts`. */
export type ProviderScrubSet = readonly string[] & { readonly [providerScrubSet]: true };

/** The normalized failure kinds. A new kind is a member here + the consumers that branch on it. */
export const PROVIDER_ERROR_KINDS = [
  "rate_limit",
  "auth_failed",
  "billing",
  // The provider's CONTENT-moderation layer blocked the prompt — distinct from `auth_failed` (a bad key).
  "moderation",
  // The MODEL declined — a 200 carrying the vendor's `refusal` field instead of schema-shaped content.
  "refused",
  // Policy denied this (a background task on a row without `allowBackground`, a task the row cannot serve).
  "forbidden",
  // A structurally-invalid REQUEST (an unwired wire, a backend that lacks the method) OR a structurally-invalid
  // RESPONSE (a misaligned embedding payload, a vector width that contradicts the request). Both halves are
  // NON-RETRYABLE: the shape disagreement is deterministic, so a retry re-buys the same refusal.
  "invalid",
  "model_unavailable",
  "server",
  // The reply reached its output cap before writing any text; a capped reply WITH text is returned truncated.
  "max_output",
  "aborted",
  "unknown",
] as const;
export type ProviderErrorKind = (typeof PROVIDER_ERROR_KINDS)[number];

/** The `invalid` detail of a structured schema the planner or the provider refused; `violations` say why. */
export const SCHEMA_REJECTED_DETAIL = "schema_rejected";

export interface ProviderErrorInit {
  readonly kind: ProviderErrorKind;
  /** Whether a retry could plausibly succeed (rate_limit/server → true; forbidden/invalid → false). */
  readonly retryable: boolean;
  /** Operator-facing, secret-free description. */
  readonly message: string;
  /** Epoch-ms at which a rate-limit window resets, when the provider reports it. */
  readonly resetsAt?: number;
  readonly apiErrorStatus?: number;
  readonly model?: string;
  /** The RAW backend terminal/subtype string this failure was classified from — string-only provenance. */
  readonly terminalReason?: string;
  /** The specific SDK code the classification narrowed from (`oauth_org_not_allowed` under `auth_failed`). */
  readonly detail?: string;
  /** The backend-internal session this failure occurred on (the agent-sdk resume-cache id) — provenance only. */
  readonly sessionId?: AgentSdkSessionId;
  /** The upstream request/generation id, when the response exposes one. */
  readonly requestId?: string;
  /** An `invalid` embed whose vector width is not the width the connection states: the caller can say both
   *  numbers instead of reading them out of the message. */
  readonly width?: VectorWidthMismatch;
  /** A structured request the plan or the provider refused (`detail: "schema_rejected"`): every reason, as data. */
  readonly violations?: readonly WireSchemaViolation[];
  /** A failed summarize or structured batch: the items that finished before it stopped, by input index. A hole
   *  is an item that failed or never started, so a caller re-sends only those. */
  readonly partialItems?: readonly (SummarizeResultItem | undefined)[];
  readonly cause?: unknown;
}

/** The width a connection states for its vectors, and the width the model actually returned. */
export interface VectorWidthMismatch {
  readonly stated: number;
  readonly measured: number;
}

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly retryable: boolean;
  readonly resetsAt: number | undefined;
  readonly apiErrorStatus: number | undefined;
  readonly model: string | undefined;
  readonly terminalReason: string | undefined;
  readonly detail: string | undefined;
  readonly sessionId: AgentSdkSessionId | undefined;
  readonly requestId: string | undefined;
  readonly width: VectorWidthMismatch | undefined;
  readonly violations: readonly WireSchemaViolation[] | undefined;
  // A private field, never an own enumerable property: an error serializer copies every enumerable field, and an
  // item's text is model output that must not reach a log line.
  readonly #partialItems: readonly (SummarizeResultItem | undefined)[] | undefined;

  constructor(init: ProviderErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = "ProviderError";
    this.kind = init.kind;
    this.retryable = init.retryable;
    this.resetsAt = init.resetsAt;
    this.apiErrorStatus = init.apiErrorStatus;
    this.model = init.model;
    this.terminalReason = init.terminalReason;
    this.detail = init.detail;
    this.sessionId = init.sessionId;
    this.requestId = init.requestId;
    this.width = init.width;
    this.violations = init.violations;
    this.#partialItems = init.partialItems;
  }

  /** {@link ProviderErrorInit.partialItems}: read only by a caller re-sending a failed batch. */
  get partialItems(): readonly (SummarizeResultItem | undefined)[] | undefined {
    return this.#partialItems;
  }

  /** Every carried field as its own log key. A field added to {@link ProviderErrorInit} MUST be mirrored
   *  here AND in {@link rewrap} — the errors test asserts both by round-tripping a fully-populated error. */
  toLog(): Record<string, unknown> {
    return {
      kind: this.kind,
      retryable: this.retryable,
      message: this.message,
      ...(this.model !== undefined ? { model: this.model } : {}),
      ...(this.terminalReason !== undefined ? { terminalReason: this.terminalReason } : {}),
      ...(this.detail !== undefined ? { detail: this.detail } : {}),
      ...(this.resetsAt !== undefined ? { resetsAt: this.resetsAt } : {}),
      ...(this.apiErrorStatus !== undefined ? { apiErrorStatus: this.apiErrorStatus } : {}),
      ...(this.sessionId !== undefined ? { sessionId: this.sessionId } : {}),
      ...(this.requestId !== undefined ? { requestId: this.requestId } : {}),
      ...(this.width !== undefined ? { width: this.width } : {}),
      ...(this.violations !== undefined ? { violations: this.violations } : {}),
      // The count only: an item's text is model output, never a log field.
      ...(this.partialItems !== undefined ? { partialItems: this.partialItems.filter((item) => item !== undefined).length } : {}),
    };
  }

  /** Re-frame under a NEW message carrying EVERY classification/provenance field forward — THE ONE re-mint
   *  helper, because a hand-rolled `new ProviderError({ kind, retryable, message })` silently destroys
   *  `resetsAt`, `apiErrorStatus`, `model`, `requestId`, and a dropped field looks like a provider that never
   *  sent one. */
  rewrap(message: string): ProviderError {
    return new ProviderError({ ...this.#carried(), message, ...this.#partialOf(this.#partialItems), cause: this });
  }

  /** The same failure, carrying the items its batch finished. Not a re-frame: the message and cause stay as they
   *  were, so a logged chain does not repeat the message. */
  withPartialItems(partialItems: readonly (SummarizeResultItem | undefined)[]): ProviderError {
    return new ProviderError({
      ...this.#carried(),
      message: this.message,
      ...this.#partialOf(partialItems),
      ...(this.cause !== undefined ? { cause: this.cause } : {}),
    });
  }

  #partialOf(partialItems: ProviderErrorInit["partialItems"]): Pick<ProviderErrorInit, "partialItems"> {
    return partialItems !== undefined ? { partialItems } : {};
  }

  #carried(): Omit<ProviderErrorInit, "message" | "partialItems" | "cause"> {
    return {
      kind: this.kind,
      retryable: this.retryable,
      ...(this.resetsAt !== undefined ? { resetsAt: this.resetsAt } : {}),
      ...(this.apiErrorStatus !== undefined ? { apiErrorStatus: this.apiErrorStatus } : {}),
      ...(this.model !== undefined ? { model: this.model } : {}),
      ...(this.terminalReason !== undefined ? { terminalReason: this.terminalReason } : {}),
      ...(this.detail !== undefined ? { detail: this.detail } : {}),
      ...(this.sessionId !== undefined ? { sessionId: this.sessionId } : {}),
      ...(this.requestId !== undefined ? { requestId: this.requestId } : {}),
      ...(this.width !== undefined ? { width: this.width } : {}),
      ...(this.violations !== undefined ? { violations: this.violations } : {}),
    };
  }
}

/** Compile-time exhaustiveness guard for the closed axes — a member a switch does not handle makes this
 *  argument non-`never`, a `tsc` error. */
export function assertNever(value: never, where: string): never {
  throw new ProviderError({ kind: "invalid", retryable: false, message: `${where}: unhandled axis member ${String(value)}` });
}
