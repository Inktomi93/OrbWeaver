// infra/providers/contract/errors — the provider-agnostic failure surface every role dispatcher and
// sealed backend maps its errors onto. ONE error class across all seven roles (chat/agent/embed/…) so a
// consumer catches a single type regardless of which role/backend threw (ported from neo's `ChatError`,
// widened from chat-only to role-generic). The firewall (roles/firewall.ts) throws `kind:"forbidden"`;
// a wrong-source-for-role / unwired-backend / unsupported-pairing throws `kind:"invalid"`.
//
// SECURITY: a `ProviderError.message` is operator-facing and MUST NOT carry key/token material — the
// firewall + dispatch construct messages from the `source`/`role`/`backend` vocab only (never the
// credential's key). The wire-level secret-sanitiser (`backends/kit/sanitize.ts`) is a backend concern;
// the core never has plaintext to leak.

/** The normalized failure kinds every role/backend collapses its errors onto. A new kind is a member
 *  here + the consumers that branch on it — never an inline re-spelling (this is the one home). */
export const PROVIDER_ERROR_KINDS = [
  "rate_limit",
  "auth_failed",
  "billing",
  // The provider's CONTENT-moderation layer blocked the prompt (OpenRouter returns 403 +
  // `error.metadata.reasons`) — distinct from `auth_failed` (a bad key) and `forbidden` (OUR firewall).
  // Non-retryable; the UI can say "this content was moderated", never "authentication failed".
  "moderation",
  // The credential firewall denied this (source/role/consent policy) — fail-closed, not retryable.
  "forbidden",
  // A structurally-invalid request: a wrong source for a role, an unwired backend, an unsupported
  // (api, source) pairing, or a backend that doesn't implement the requested role.
  "invalid",
  "model_unavailable",
  "server",
  "max_output",
  "aborted",
  "unknown",
] as const;
export type ProviderErrorKind = (typeof PROVIDER_ERROR_KINDS)[number];

/** Construction inputs for {@link ProviderError}. `message` must be safe-for-log (no secrets). */
export interface ProviderErrorInit {
  readonly kind: ProviderErrorKind;
  /** Whether a retry could plausibly succeed (rate_limit/server → true; forbidden/invalid → false). */
  readonly retryable: boolean;
  /** Operator-facing, secret-free description. */
  readonly message: string;
  /** Epoch-ms at which a rate-limit window resets, when the provider reports it. */
  readonly resetsAt?: number;
  /** The upstream HTTP status, when an HTTP backend produced one. */
  readonly apiErrorStatus?: number;
  /** The model this turn ran against — debuggability provenance (which model failed). */
  readonly model?: string;
  /** The RAW backend terminal/subtype string this failure was classified from (agent-sdk dialect, e.g.
   *  "blocking_limit"/"prompt_too_long") — string-only provenance, NOT an SDK type (D8 keeps the contract
   *  SDK-free). Lets an operator see WHICH specific cause collapsed onto the generic `kind`. */
  readonly terminalReason?: string;
  /** The specific SDK code the classification narrowed from (e.g. "oauth_org_not_allowed" vs the generic
   *  "auth_failed" kind) — a plain string, the debuggable identity behind the normalized `kind`. */
  readonly detail?: string;
  /** The backend-internal session this failure occurred on (agent-sdk resume-cache id). Provenance ONLY —
   *  never surfaced on the SDK-free `ChatResult` (the session is backend-internal), but carried on the
   *  error so `toLog()` can correlate a failure to its session in the log stream. */
  readonly sessionId?: string;
  /** The upstream request/generation id, when an HTTP backend's response exposes one — correlates a
   *  failure to the provider's own trace (e.g. OpenRouter's generation id). */
  readonly requestId?: string;
  /** The underlying cause, chained for diagnostics (never logged as the user-facing message). */
  readonly cause?: unknown;
}

/**
 * Provider-agnostic inference failure. The single throw type for the role firewall, the dispatch
 * derivation, and (later) every sealed backend runner. `kind` + `retryable` let callers branch
 * without string-matching the message.
 */
export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly retryable: boolean;
  readonly resetsAt: number | undefined;
  readonly apiErrorStatus: number | undefined;
  readonly model: string | undefined;
  readonly terminalReason: string | undefined;
  readonly detail: string | undefined;
  readonly sessionId: string | undefined;
  readonly requestId: string | undefined;

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
  }

  /**
   * The full provenance of this failure as a flat structured record for `getLog().error(err.toLog(), …)`
   * — every carried field surfaces as its own log key so an aggregator never has to parse a flattened
   * message. Absent optionals are omitted (no `undefined` noise in the line). The `cause` is deliberately
   * NOT included: it is chained for a stack trace via the standard `err` serializer, not flattened here.
   * A field added to {@link ProviderErrorInit} MUST be mirrored here — the errors test asserts coverage.
   */
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
    };
  }
}
