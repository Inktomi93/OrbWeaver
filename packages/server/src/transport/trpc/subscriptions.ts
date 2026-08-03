// The SSE subscription typed-error wrapper. A subscription generator bypasses domainErrorMiddleware (the
// middleware returned a result long before the generator yields/throws), so a thrown typed DomainError
// would surface as a spurious 500. `withSubscriptionErrors` catches a DomainError thrown anywhere in the
// stream and converts it into a typed terminal frame instead; a genuine non-domain throw still propagates.
//
// Every yield stays tracked() (the error frame too): a mix of tracked + plain breaks the client's
// discriminant narrowing.

import type { TRPCError, TrackedEnvelope } from "@trpc/server";
import { tracked } from "@trpc/server";
import { classifyDomainError } from "./error-mapping.ts";

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

/** Wrap a tracked subscription source so a thrown `DomainError` becomes a typed terminal frame instead of
 *  a raw 500. Re-throws anything that is not a domain error. The generator returns after the error frame
 *  — the stream is terminal at that point. */
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
