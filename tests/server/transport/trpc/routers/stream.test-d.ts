// Type-level pin for what `stream.connect` puts on the wire. The socket is deliberately NOT parsed per frame
// (a chat room streams one frame per token, and a per-frame parse is paid on every one), so the control is the
// typed producer chain: every room pump yields `StreamDataFrame` (pinned in `../stream/room-sources.test-d.ts`),
// `runSocket` yields `TrackedEnvelope<StreamFrame>`, and `withSubscriptionErrors` adds only its typed terminal
// frame. This pin holds the PROCEDURE-level output to exactly that union, so a wrapper or pump that widens a
// frame (a Principal, a raw row) fails `tsc` here instead of reaching every attached tab. The frame arms
// themselves are pinned in `tests/contracts/stream/index.test-d.ts`.

import type { StreamFrame } from "@orb/contracts/stream";
import type { createCaller, SubscriptionErrorFrame } from "@orb/server/transport/trpc";
import { expectTypeOf, test } from "vitest";

type AppCaller = ReturnType<typeof createCaller>;
type Yielded<T> = T extends AsyncIterable<infer Y> ? Y : never;
/** The `data` of a tracked yield, as the caller and the client see it (`TrackedData<T>`); distributes over a
 *  union of yields. */
type EnvelopeData<E> = E extends { readonly data: infer D } ? D : never;

test("stream.connect yields exactly the stream frame vocabulary plus the typed terminal frame", () => {
  type Envelope = Yielded<Awaited<ReturnType<AppCaller["stream"]["connect"]>>>;
  expectTypeOf<EnvelopeData<Envelope>>().toEqualTypeOf<StreamFrame | SubscriptionErrorFrame>();
});
