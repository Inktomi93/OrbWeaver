// transport/trpc/subscriptions — the SSE subscription typed-error wrapper (core/Tier-4-Transport.md Esoteric #5).
// A subscription GENERATOR bypasses `domainErrorMiddleware` (the middleware returned a
// result long before the generator yields/throws), so a thrown typed `DomainError` — e.g. a `NOT_FOUND`
// during a draft-tolerant ownership gate — would surface as a spurious 500. `withSubscriptionErrors`
// catches a `DomainError` thrown anywhere in the stream and converts it into a typed terminal frame
// instead; a genuine non-domain throw still propagates (a real 500, the correct outcome for a bug).
//
// Every yield stays `tracked()` (the error frame too): a MIX of tracked + plain breaks the client's
// discriminant narrowing (Esoteric #5), so the frame is wrapped with a sentinel tracked id.

import type { TRPCError, TrackedEnvelope } from "@trpc/server";
import { tracked } from "@trpc/server";
import { classifyDomainError } from "./error-mapping";

// The sentinel tracked id for the terminal error frame — never a durable cursor, so a reconnect's
// `lastEventId` never resumes "from the error".
const SUBSCRIPTION_ERROR_ID = "__error__";

/**
 * The typed terminal frame a subscription yields when its source throws a `DomainError`. `code` is the
 * classified tRPC code (the same mapping `classifyDomainError` applies to unary calls); the client
 * discriminates on `__subscriptionError` and surfaces `code`/`message` rather than tearing the stream
 * down with an opaque 500.
 */
export interface SubscriptionErrorFrame {
  readonly __subscriptionError: true;
  readonly code: TRPCError["code"];
  readonly message: string;
}

/**
 * Wrap a tracked subscription source so a thrown `DomainError` becomes a typed terminal frame instead of
 * a raw 500. Re-throws anything that is NOT a domain error (a genuine bug → real 500). The generator
 * RETURNS after the error frame — the stream is terminal at that point.
 */
export async function* withSubscriptionErrors<TData>(
  source: AsyncIterable<TrackedEnvelope<TData>>,
): AsyncGenerator<TrackedEnvelope<TData> | TrackedEnvelope<SubscriptionErrorFrame>> {
  try {
    yield* source;
  } catch (err) {
    const mapped = classifyDomainError(err);
    if (mapped === null) {
      throw err;
    }
    yield tracked(SUBSCRIPTION_ERROR_ID, {
      __subscriptionError: true,
      code: mapped.code,
      message: mapped.message,
    } satisfies SubscriptionErrorFrame);
  }
}
