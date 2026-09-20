// The SSE subscription typed-error wrapper. A subscription generator bypasses domainErrorMiddleware (the
// middleware returned a result long before the generator yields/throws), so a thrown typed DomainError
// would surface as a spurious 500. `withSubscriptionErrors` catches anything `classifyDomainError` models
// — a DomainError, or a ProviderError of a modelled kind — thrown anywhere in the stream and converts it
// into a typed terminal frame instead; an unmodelled throw still propagates.
//
// THE PROVIDER HALF IS NOT COSMETIC. INTERNAL_SERVER_ERROR is in tRPC's `retryableRpcCodes`, so a raw
// `ProviderError` propagating out of a generator was not an error to `httpSubscriptionLink` at all: it
// reported "connecting" and let EventSource reconnect every ~3s forever, silently re-running the
// generator. A terminal frame is terminal (the owner's dead-engine incident — see
// `features/chat/hooks/use-guided-actions.ts`).
//
// Every yield stays tracked() (the error frame too): a mix of tracked + plain breaks the client's
// discriminant narrowing.

import type { TRPCError, TrackedEnvelope } from "@trpc/server";
import { tracked } from "@trpc/server";
import { getLog } from "#foundation/observability";
import { classifyDomainError, providerFaultOf } from "./error-mapping.ts";

// Never a durable cursor, so a reconnect's lastEventId never resumes "from the error".
const SUBSCRIPTION_ERROR_ID = "__error__";

/** The typed terminal frame a subscription yields when its source throws a `DomainError`. The client
 *  discriminates on `__subscriptionError` and surfaces code/message rather than tearing the stream down
 *  with an opaque 500. */
export interface SubscriptionErrorFrame {
  readonly __subscriptionError: true;
  readonly code: TRPCError["code"];
  readonly message: string;
}

/** Wrap a tracked subscription source so a modelled throw becomes a typed terminal frame instead of a raw
 *  500. Re-throws anything `classifyDomainError` does not model. The generator returns after the error
 *  frame — the stream is terminal at that point. */
export async function* withSubscriptionErrors<TData>(
  source: AsyncIterable<TrackedEnvelope<TData>>,
): AsyncGenerator<TrackedEnvelope<TData> | TrackedEnvelope<SubscriptionErrorFrame>> {
  // @orb-waive caught-failure-ownership(err): documented above — a modelled error becomes a
  // typed terminal frame consumed by the client (and, when it is a provider fault, one log line); an
  // unmodelled error is re-thrown. Ends if the re-throw for unmodelled errors is removed.
  try {
    yield* source;
  } catch (err) {
    const mapped = classifyDomainError(err);
    if (mapped === null) {
      throw err;
    }
    // The sibling of `domainErrorMiddleware`'s provider-fault line, and it exists for the same reason: a
    // generator throws long after that middleware returned, so this is the ONLY server-side trace a
    // provider failure inside a subscription leaves — and for most `ProviderErrorKind`s the frame below
    // carries fixed host copy rather than the error's own message. No `path` here: a subscription's
    // procedure name is not in scope, and `toLog()` carries the model/status/session provenance instead.
    const provider = providerFaultOf(mapped);
    if (provider !== null) {
      getLog().warn({ ...provider.toLog(), event: "trpc.provider" }, `trpc: provider failure inside a subscription (${provider.kind})`);
    }
    yield tracked(SUBSCRIPTION_ERROR_ID, {
      __subscriptionError: true,
      code: mapped.code,
      message: mapped.message,
    } satisfies SubscriptionErrorFrame);
  }
}
