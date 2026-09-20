// The pure error → tRPC code classifier for the TWO taxonomies that cross this boundary: the
// `@orb/kit/errors` DomainError tree (thrown by domain verbs) and `ProviderError` (thrown by
// `@orb/inference`, which is a cake package below server and has no DomainError to throw). No t, no
// middleware context, no router state, so it is tested in isolation against every subclass and every kind.
//
// Walks the .cause chain (not a single deref): a re-wrap layer over the original throw would otherwise
// turn a DomainError into a 500. Order is load-bearing in ONE place: DomainNoCredentialError is checked
// before DomainOperationError so it never falls into the generic 400 bucket. (The ProviderError arm sits
// last for READABILITY, not for precedence — what makes a domain class wrapping a provider fault classify
// as the DOMAIN meant it to is the walk stopping at the OUTERMOST modelled error, below.)
//
// ── WHY ProviderError IS HERE AT ALL ─────────────────────────────────────────────────────────────────────
// `ProviderError extends Error`, not DomainError, so until now it fell out of this function as `null` and
// tRPC answered INTERNAL_SERVER_ERROR. Two costs, both measured:
//   • DISHONEST STATUS. 37 server files / 64 call sites reach the inference runtime and only five look at
//     the error type; the rest propagate. An admin dropping a built-in provider row, a user with no embed
//     connection bound, a provider rate-limit — every ordinary refusal answered 500.
//   • A RETRY STORM. INTERNAL_SERVER_ERROR is in tRPC's `retryableRpcCodes`, so a raw ProviderError thrown
//     inside a subscription was not an error to `httpSubscriptionLink` at all: it reported "connecting"
//     and let EventSource reconnect every ~3s forever, re-running the generator (a full silent
//     re-generation per reconnect) while no client callback fired. That is the owner's dead-engine
//     incident, documented at `packages/client/src/features/chat/hooks/use-guided-actions.ts`. A classified
//     ProviderError becomes a typed terminal frame in `withSubscriptionErrors` instead, which terminates.
//
// ── WHY MOST KINDS DO NOT CARRY THEIR OWN MESSAGE ────────────────────────────────────────────────────────
// A `ProviderError.message` is OPERATOR-facing by its own contract (`packages/inference/src/contract/
// errors.ts` SECURITY note). Over 90 mint sites it is built from three different sources and only one of
// them is ours:
//   • OUR vocabulary — the resolver's refusals, the registry's admin refusals, `NoConnectionError`, the
//     backends' structural-disagreement sentences. Host-readable and actionable.
//   • FOREIGN prose — a reflected upstream body (`providerErrorFromHttp`, `fetchJson`), a vendor `refusal`
//     string, an SDK error. Scrubbed of secrets by value and sanitized, but it is still someone else's text.
//   • ENVIRONMENTAL text — a node errno, a spawn failure, a filesystem path. Two live examples were found
//     while this was being built (2026-09-20): `local-light/model-cache.ts` put the ABSOLUTE host cache dir
//     plus the mkdir errno on the wire, and `kit/fetch-json.ts` mints upstream prose with no
//     `sanitizeApiError` at all (no cap, no control-char strip, no markup strip). Both are fixed at their
//     mint sites in the same commit — and both were `kind: "server"`, which is exactly the point: nobody
//     audits 90 mint sites, and the census that preceded this work reported the channel as clean.
// `kind` is NOT a discriminator for which of the three a message holds — `classifyHttpStatus` maps upstream
// statuses onto `auth_failed`/`billing`/`rate_limit`/`model_unavailable`/`invalid`/`server`, so every one of
// those kinds mixes ours with foreign. So the rule is per-kind but justified per-kind, and the DEFAULT is
// fixed host copy. The next author's instinct will be "surely a server error should say what went wrong";
// the answer is: to the OPERATOR yes (the middleware logs `toLog()`), to the WIRE no.
//
// ── THE ONE KIND THAT DOES: `invalid` ────────────────────────────────────────────────────────────────────
// `invalid` is where the two headline refusals live — `NoConnectionError` ("no embed connection is bound
// for this user — bind one in Connections", the most user-facing refusal in the system) and the registry's
// admin refusals ("provider X is built-in and cannot be dropped"). Replacing those with generic copy is the
// exact "silently degrade a typed refusal into something-went-wrong" failure this work exists to avoid. It
// also carries an upstream 4xx body, and that is ACCEPTED on three stated assumptions:
//   1. the surfaces that produce it are OWNER-SCOPED (a connection, its credential and its baseUrl are the
//      caller's own; cross-tenant reach is held by the domain pre-gates and probed by
//      tests/server/transport/cross-tenant-sweep.suite.int.test.ts),
//   2. every upstream-derived message is `sanitizeApiError(redactSecretsFromText(…))` — true of
//      `providerErrorFromHttp` always, and of `fetchJson` only as of this commit. A THIRD upstream-prose
//      path added without that composition re-opens this,
//   3. the by-value scrub set is branded (`ProviderScrubSet`, #1599), so a credential-bearing boundary
//      cannot omit it.
//
// ── WHY `forbidden` DOES NOT, EVEN THOUGH ALL THREE OF ITS MINT SITES ARE OURS ───────────────────────────
// `requireOwned` (`packages/inference/src/index.ts`) throws `forbidden` with "connection <id> is not the
// caller's", while the missing-row arm one function over throws `invalid` with "connection <id> no longer
// exists". Carrying that message under a clean 403 would mint a cross-tenant EXISTENCE ORACLE — the exact
// defect `domain/connection/verbs/resolve.ts::createCapabilities` pre-gated away with
// `ConnectionNotFoundError` on 2026-09-20. The domain pre-gates every door today, so this is defence in
// depth; fail-closed still wins on a tenancy boundary. Collapsing `requireOwned` onto the not-found
// spelling at its own mint site is the better long-run fix and is a follow-up, not this lane.
//
// ── WHY `aborted` AND `unknown` ARE NOT CLASSIFIED AT ALL ────────────────────────────────────────────────
// Neither is a modelled OUTCOME. `unknown` is the inference classifier's own admission that it could not
// name the failure, so promoting it here would claim a certainty the layer below explicitly disclaimed;
// `aborted` is a cancellation whose reader is by definition gone. Both stay unclassified, which keeps the
// `trpc.unhandled` error trace firing for exactly the failures an operator most needs to see, and costs
// nothing on the wire: they collapse to the same fixed sentence every other unclassified throw gets.

import type { ProviderErrorKind } from "@orb/inference";
import { ProviderError } from "@orb/inference";
import {
  DomainConflictError,
  DomainError,
  DomainForbiddenError,
  DomainNoCredentialError,
  DomainNotFoundError,
  DomainOperationError,
  DomainRateLimitError,
  DomainUnavailableError,
} from "@orb/kit/errors";
import { TRPCError } from "@trpc/server";

/**
 * One provider kind's wire treatment. Both `null`s are deliberate and mean different things:
 *  - `code: null` ⇒ NOT a modelled outcome; leave the error unclassified so it collapses at the formatter.
 *  - `copy: null` ⇒ carry the `ProviderError`'s OWN message (see the header — `invalid` only).
 * When `code` is `null` the `copy` field is never read.
 */
interface ProviderWireArm {
  readonly code: TRPCError["code"] | null;
  readonly copy: string | null;
}

/** The `copy` value that says "this kind's own message is host copy — send it". Named rather than a bare
 *  `null` because it is the one security-relevant choice in the table below and must read as a decision. */
const CARRY_THE_ERRORS_OWN_MESSAGE: ProviderWireArm["copy"] = null;

const UNCLASSIFIED: ProviderWireArm = { code: null, copy: null };

/**
 * Every {@link ProviderErrorKind} → the code and the copy that reach the caller.
 *
 * EXHAUSTIVE by construction (§5.5): the `switch` ends in {@link assertNeverKind}, so a member added to
 * `PROVIDER_ERROR_KINDS` fails `tsc` HERE until it is given a wire treatment, rather than silently
 * falling through to a 500. A snake_case-keyed `Record` is the other §5.5 shape but its PROPERTY keys trip
 * `useNamingConvention`; a string-literal `case` is DATA and does not (the `warning-notice` /
 * `arm-executors` precedent), so the switch is the suppression-free spelling of the same guarantee.
 *
 * THE CODES ARE DRAWN FROM `STREAM_ERROR_CODES` (`@orb/contracts/stream`) AND MAY NOT LEAVE IT. That tuple
 * documents itself as "exactly the codes the transport's ONE domain-error classifier can produce", and
 * `stream/socket.ts::roomFailure` narrows onto it — a code outside it would be downgraded to
 * INTERNAL_SERVER_ERROR on the room path. Adding one here therefore means adding it there too.
 *
 * The copy is USER copy, not operator copy: it rides the tRPC error message AND the typed terminal frame
 * `withSubscriptionErrors` yields, which a chat surface toasts verbatim.
 */
function providerWireArm(kind: ProviderErrorKind): ProviderWireArm {
  switch (kind) {
    case "rate_limit":
      return { code: "TOO_MANY_REQUESTS", copy: "The provider is rate-limiting this connection. Wait a moment, then try again." };
    case "auth_failed":
      return { code: "PRECONDITION_FAILED", copy: "The provider rejected this connection's credential. Check the key under Settings → Connections." };
    case "billing":
      return { code: "PRECONDITION_FAILED", copy: "The provider refused this call for billing reasons. Check the account behind this connection." };
    case "moderation":
      return { code: "FORBIDDEN", copy: "The provider's content filter blocked this request." };
    case "refused":
      return { code: "BAD_REQUEST", copy: "The model declined to answer this request." };
    case "forbidden":
      return { code: "FORBIDDEN", copy: "This connection isn't allowed to serve that request." };
    case "invalid":
      return { code: "BAD_REQUEST", copy: CARRY_THE_ERRORS_OWN_MESSAGE };
    case "model_unavailable":
      // NOT `NOT_FOUND`: every client that discriminates reads NOT_FOUND as "the entity you named was
      // deleted" (`features/preset/lib/resolve-failure.ts` prints exactly that), and a model the provider
      // does not serve is a CONFIGURATION fact, not a deleted row. PRECONDITION_FAILED is the honest
      // class — change something, then retry — and `data.reason` carries the precision.
      return { code: "PRECONDITION_FAILED", copy: "The provider doesn't serve that model. Pick another under Settings → Connections." };
    case "server":
      return { code: "SERVICE_UNAVAILABLE", copy: "The provider failed to answer. Try again in a moment." };
    case "max_output":
      return { code: "BAD_REQUEST", copy: "The request asked for more output than this model will produce." };
    case "aborted":
    case "unknown":
      return UNCLASSIFIED;
    default:
      return assertNeverKind(kind);
  }
}

function assertNeverKind(kind: never): never {
  throw new Error(`providerWireArm: unhandled ProviderErrorKind ${JSON.stringify(kind)}`);
}

/** The `data.reason` prefix every provider failure rides, so a client can discriminate the whole class with
 *  one test and a specific kind by the full literal (`provider_rate_limit`). The vocabulary after the
 *  prefix is `PROVIDER_ERROR_KINDS` verbatim — a closed union in `@orb/inference`, never a free string. */
const PROVIDER_REASON_PREFIX = "provider_";

/** The mapped `TRPCError` for a provider failure, or `null` for a kind this boundary does not model. */
function classifyProviderError(err: ProviderError): TRPCError | null {
  const arm = providerWireArm(err.kind);
  return arm.code === null ? null : new TRPCError({ code: arm.code, message: arm.copy ?? err.message, cause: err });
}

/**
 * Walk the (possibly wrapped) error chain, find a `DomainError` or a `ProviderError`, and return the mapped
 * `TRPCError`. Returns `null` when neither is found at any depth — the caller leaves the original error
 * alone (tRPC surfaces it as `INTERNAL_SERVER_ERROR`, the correct outcome for a genuine bug, and the
 * formatter substitutes a fixed sentence for its message).
 */
export function classifyDomainError(err: unknown): TRPCError | null {
  // START AT `err`, NOT AT `err.cause` (fixed 2026-09-20, caught by this lane's own policy pin). The first
  // line used to be `(err as { cause?: unknown }).cause ?? err` — an UNCONDITIONAL one-level deref meant to
  // skip tRPC's wrapper. It also skipped any modelled error that CARRIES a cause, which is exactly the
  // house idiom for a leak-free collapse: `ScrapeFailedError({ cause: err })` (the SSRF refusal whose whole
  // point is "The web page could not be scraped." with the resolved private address staying server-side),
  // `RefineryRunFailedError(msg, { cause })`, and the `unavailable.cause = err` sites in chat/fork,
  // import-write, character/card, imagery and workloads. Every one of them classified by its CAUSE — which
  // is usually unmodelled — so the domain's curated sentence was discarded and the caller got a 500.
  // The loop below already skips a non-modelled wrapper, so the deref bought nothing the walk did not.
  let cause: unknown = err;
  const seen = new Set<unknown>();
  while (cause instanceof Error && !(cause instanceof DomainError) && !(cause instanceof ProviderError) && cause.cause !== undefined && !seen.has(cause)) {
    seen.add(cause);
    cause = cause.cause;
  }
  if (cause instanceof DomainNotFoundError) {
    return new TRPCError({ code: "NOT_FOUND", message: cause.message, cause });
  }
  if (cause instanceof DomainConflictError) {
    return new TRPCError({ code: "CONFLICT", message: cause.message, cause });
  }
  if (cause instanceof DomainForbiddenError) {
    return new TRPCError({ code: "FORBIDDEN", message: cause.message, cause });
  }
  if (cause instanceof DomainNoCredentialError) {
    return new TRPCError({ code: "PRECONDITION_FAILED", message: cause.message, cause });
  }
  if (cause instanceof DomainOperationError) {
    return new TRPCError({ code: "BAD_REQUEST", message: cause.message, cause });
  }
  if (cause instanceof DomainRateLimitError) {
    return new TRPCError({ code: "TOO_MANY_REQUESTS", message: cause.message, cause });
  }
  if (cause instanceof DomainUnavailableError) {
    return new TRPCError({ code: "SERVICE_UNAVAILABLE", message: cause.message, cause });
  }
  // Reached only when the OUTERMOST modelled error on the chain was a ProviderError: a DomainError
  // wrapping a provider fault stopped the walk above and classified by the domain's own framing, which is
  // what we want — the domain knows why it caught, the runtime only knows what failed.
  if (cause instanceof ProviderError) {
    return classifyProviderError(cause);
  }
  return null;
}

/**
 * The honest, leak-free reason for a mapped error — the discriminator the error formatter rides on
 * `data.reason` so the client keys on a structured field, never message text. Two producers, both closed
 * vocabularies: a `DomainOperationError`'s `.code` (e.g. `owner_not_present`/`agent_disabled`) and a
 * `ProviderError`'s `kind` under the `provider_` prefix. Every other mapped error — including the leak-free
 * NOT_FOUND collapse — is intentionally codeless, so nothing beyond the reason string ever reaches the wire
 * (no cause chain, no internals). `undefined` ⇒ the formatter emits no `reason` field (JSON drops the key).
 *
 * The provider arm exists because most kinds no longer carry their own message (see the header): without a
 * structured reason, collapsing the message would leave the client nothing to discriminate on at all, which
 * is the lazy version of this change rather than the intended one.
 */
export function domainReason(error: { cause?: unknown }): string | undefined {
  if (error.cause instanceof DomainOperationError) {
    return error.cause.code;
  }
  return error.cause instanceof ProviderError ? `${PROVIDER_REASON_PREFIX}${error.cause.kind}` : undefined;
}

/** The `ProviderError` a mapped `TRPCError` was built from, for the caller that owes it a log line — the
 *  message most kinds no longer put on the wire exists ONLY in that log now. `null` for everything else. */
export function providerFaultOf(error: { cause?: unknown }): ProviderError | null {
  return error.cause instanceof ProviderError ? error.cause : null;
}
