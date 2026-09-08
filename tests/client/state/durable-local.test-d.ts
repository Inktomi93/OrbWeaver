// #854 — THE TYPE PIN FOR THE DURABLE-LOCAL BIND BOUNDARY. `durable-local.ts` decides whether an
// identity's `orb:*` namespace stays live by comparing the incoming id against a BROWSER-WRITABLE boot
// hint (`orb:active-user`). The module cannot inspect provenance, so its security property — a forged
// hint can choose which namespace to MINT on but can never keep another identity's namespace live —
// depends entirely on the caller passing the SESSION-VERIFIED viewer id. #837 left that resting on there
// being exactly one production caller; this makes it a compile error instead.
//
// The runtime arms (no-op / adopt / switch, and the forged-hint pin) live in the `.test.ts` sibling and are
// untouched — only a type-level assertion can see the boundary this file guards.

import { bindDurableLocalToUser } from "@orb/client/state";
import type { UserId, VerifiedUserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

// `async` + `await`, not `void`: `bindDurableLocalToUser` returns a Promise, and this repo's
// no-floating-promises runs with `ignoreVoid: false` — `void <promise>` is exactly the discard it refuses.
// (These two calls are the SUBJECT of the type assertions; the file is typecheck-only, so awaiting them
// changes nothing but the honesty of the discard. Found when #1574 gave `tests/client/**/*.ts` an eslint
// config block at all — the tree matched none before.)
test("bindDurableLocalToUser REFUSES a bare UserId and accepts only the session-verified brand", async () => {
  const clientDerived = castId<UserId>("usr_from_a_route_param");
  const verified = castId<VerifiedUserId>("usr_from_sessions_me");

  // @ts-expect-error — a plain `UserId` (a route param, a cached blob, the browser-writable boot hint)
  // cannot reach the namespace gate. THIS is the #854 defect, now unbuildable.
  await bindDurableLocalToUser(clientDerived);

  // The session-recovery seam's mint is the one thing that type-checks here.
  await bindDurableLocalToUser(verified);

  expectTypeOf(bindDurableLocalToUser).parameter(0).toEqualTypeOf<VerifiedUserId>();
  // ...and the brand is not silently widened back to UserId by the export boundary.
  expectTypeOf<UserId>().not.toExtend<Parameters<typeof bindDurableLocalToUser>[0]>();
});
