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

  constructor(init: ProviderErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = "ProviderError";
    this.kind = init.kind;
    this.retryable = init.retryable;
    this.resetsAt = init.resetsAt;
    this.apiErrorStatus = init.apiErrorStatus;
  }
}
