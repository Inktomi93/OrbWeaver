// Type-level pin for what `chat.impersonateStream` puts on the wire. Like the multiplexed socket, this
// subscription is NOT parsed per frame (it streams one delta per generated token), so the control is the typed
// producer: the verb yields `ImpersonateStreamDelta`, the router only wraps each yield in `tracked()`, and
// `withSubscriptionErrors` adds its typed terminal frame. The delta is pinned to exactly `{ delta }`: a draft
// the composer fills carries text and nothing else, so a field added there (the assembled prompt, a model
// id) is a wire change that must fail `tsc` here first.

import type { ImpersonateStreamDelta } from "@orb/server/domain/chat";
import type { createCaller, SubscriptionErrorFrame } from "@orb/server/transport/trpc";
import { expectTypeOf, test } from "vitest";

type AppCaller = ReturnType<typeof createCaller>;
type Yielded<T> = T extends AsyncIterable<infer Y> ? Y : never;
/** The `data` of a tracked yield, as the caller and the client see it (`TrackedData<T>`); distributes over a
 *  union of yields. */
type EnvelopeData<E> = E extends { readonly data: infer D } ? D : never;

test("an impersonation delta is exactly the text delta", () => {
  expectTypeOf<ImpersonateStreamDelta>().toEqualTypeOf<{ readonly delta: string }>();
});

test("chat.impersonateStream yields the delta plus the typed terminal frame, nothing else", () => {
  type Envelope = Yielded<Awaited<ReturnType<AppCaller["chat"]["impersonateStream"]>>>;
  expectTypeOf<EnvelopeData<Envelope>>().toEqualTypeOf<ImpersonateStreamDelta | SubscriptionErrorFrame>();
});
