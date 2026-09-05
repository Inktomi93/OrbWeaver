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

declare const providerScrubSet: unique symbol;

/**
 * The by-value scrub set an HTTP boundary hands the error classifier: a `readonly string[]` with a phantom
 * brand, so it flows INTO every plain-array consumer (`redactSecretsFromText`) while nothing flows into it.
 * Homed here rather than beside its producers because this file is the providers TYPE HOME, and the two
 * producers live in `backends/kit/sanitize.ts` — `providerCredentialSecretValues` (derive it from the
 * credential) and `NO_PROVIDER_SECRETS` (the keyless boundary).
 *
 * SECURITY (#1599) — the brand exists to make "no scrub" UNWRITABLE BY ACCIDENT. `providerErrorFromHttp`'s
 * message reaches a DURABLE sink: the #1373 post-generation strike-out puts it in
 * `securityEvent("credential_revoked", { reason })`. While the scrub set was an OPTIONAL parameter
 * (`secrets: readonly string[] = []`), a runner that forgot the third argument — or handed it a bare `[]` —
 * silently shipped an unscrubbed upstream message into that trail, with no compile-time tell. A future
 * runner now cannot reach the unscrubbed path without typing `NO_PROVIDER_SECRETS`, which greps in one line
 * and shows up in review.
 */
export type ProviderScrubSet = readonly string[] & { readonly [providerScrubSet]: true };

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
  // The MODEL itself declined — a 200 carrying the vendor's `refusal` field instead of schema-shaped content
  // (both hosted families document it as a first-class field that does NOT follow the caller's schema).
  // Distinct from `moderation` (the provider's own layer blocked the PROMPT, HTTP 403) and from a parse
  // failure: the model understood and said no, in its own sentence. Non-retryable.
  "refused",
  // The credential firewall denied this (source/role/consent policy) — fail-closed, not retryable.
  "forbidden",
  // A structurally-invalid REQUEST — a wrong source for a role, an unwired backend, an unsupported
  // (api, source) pairing, a backend that doesn't implement the requested role — OR a structurally-invalid
  // RESPONSE the backend cannot decode: a misaligned embedding payload, a vector width that contradicts the
  // `dimensions` the request asked for, a vector count that does not match the inputs. Both halves are
  // NON-RETRYABLE for the same reason: the shape disagreement is deterministic, so a retry re-buys the same
  // refusal (on an embed, with the caller's money). Distinct from `server` (an upstream that FAILED, which a
  // retry can plausibly get past).
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
  // @foreign-id-ok(sessionId): the Claude Agent SDK's OWN chat-session id (its `session_id` wire field) — a NAME COLLISION with our BFF `SessionId = TypeIdOf<"session">`, a different wire's id that merely shares the spelling. Ends if this position ever carries one of our session rows, or if the field is renamed `sdkSessionId` (which would dissolve this marker).
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
  // @foreign-id-ok(sessionId): the Claude Agent SDK's OWN chat-session id (its `session_id` wire field) — a NAME COLLISION with our BFF `SessionId = TypeIdOf<"session">`, a different wire's id that merely shares the spelling. Ends if this position ever carries one of our session rows, or if the field is renamed `sdkSessionId` (which would dissolve this marker).
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

  /**
   * Re-frame this failure under a NEW message, carrying EVERY classification and provenance field forward
   * and chaining the original as `cause`. THE ONE re-mint helper, because the hand-rolled version was
   * lossy by construction: a call site that re-spells `new ProviderError({ kind, retryable, message })` to
   * add coordinates ("item 3 failed: …") silently DESTROYS `resetsAt` (the rate-limit reset a backoff
   * honors), `apiErrorStatus`, `model`, `requestId` and the rest — and a dropped field looks exactly like a
   * provider that never sent one. Adding context to a message is not a reason to lose the provenance.
   *
   * A field added to {@link ProviderErrorInit} MUST be mirrored here, exactly as it must in `toLog()`; the
   * errors test asserts both by comparing a fully-populated error's `toLog()` across the re-frame.
   */
  rewrap(message: string): ProviderError {
    return new ProviderError({
      kind: this.kind,
      retryable: this.retryable,
      message,
      ...(this.resetsAt !== undefined ? { resetsAt: this.resetsAt } : {}),
      ...(this.apiErrorStatus !== undefined ? { apiErrorStatus: this.apiErrorStatus } : {}),
      ...(this.model !== undefined ? { model: this.model } : {}),
      ...(this.terminalReason !== undefined ? { terminalReason: this.terminalReason } : {}),
      ...(this.detail !== undefined ? { detail: this.detail } : {}),
      ...(this.sessionId !== undefined ? { sessionId: this.sessionId } : {}),
      ...(this.requestId !== undefined ? { requestId: this.requestId } : {}),
      cause: this,
    });
  }
}
