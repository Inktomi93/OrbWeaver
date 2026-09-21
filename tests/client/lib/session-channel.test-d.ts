// The cross-tab channel is an origin-wide transport, not an identity authority. Outbound recovered handles
// originate in the authenticated `/api/auth/me` read and retain their brand; inbound bytes are only strings
// until the receiving tab performs its own authenticated session read.

import type { postSessionMessage, SessionMessage } from "@orb/client/lib";
import type { Handle } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

type ReceivedRecovered = Extract<SessionMessage, { readonly kind: "session-recovered" }>;
type PostedRecovered = Extract<Parameters<typeof postSessionMessage>[0], { readonly kind: "session-recovered" }>;

test("received channel strings do not acquire the Handle brand", () => {
  expectTypeOf<ReceivedRecovered["handle"]>().toEqualTypeOf<string | null>();
  expectTypeOf<ReceivedRecovered["handle"]>().not.toEqualTypeOf<Handle | null>();
});

test("posting a recovered handle still requires authenticated branded provenance", () => {
  expectTypeOf<PostedRecovered["handle"]>().toEqualTypeOf<Handle | null>();
  expectTypeOf<string>().not.toExtend<PostedRecovered["handle"]>();
});
