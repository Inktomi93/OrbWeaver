// #854 — THE TYPE PIN FOR THE DURABLE-LOCAL BIND BOUNDARY. `durable-local.ts` decides whether an
// identity's `orb:*` namespace stays live by comparing the incoming id against a BROWSER-WRITABLE boot
// hint (`orb:active-user`). The module cannot inspect provenance, so its security property — a forged
// hint can choose which namespace to MINT on but can never keep another identity's namespace live —
// depends entirely on the caller passing the SESSION-VERIFIED viewer id. #837 left that resting on there
// being exactly one production caller; this makes it a compile error instead.
//
// The runtime arms (no-op / adopt / switch, and the forged-hint pin) live in the `.test.ts` sibling and are
// untouched — only a type-level assertion can see the boundary this file guards.
//
// WHICH LANE VERDICTS THIS FILE: `types:tests-dom` (`pnpm typecheck:tests-dom`) — tsconfig.tests-dom.json
// includes `tests/client/**/*.ts`. The vitest `types` project ALSO collects it (its typecheck include is
// `tests/**/*.test-d.ts`) and prints a green tick, but that green is VACUOUS: that lane's program is
// `tsconfig.json`, which #1243 excluded `tests/client` from WHOLESALE. Measured 2026-09-02 — a planted
// `export const x: number = "…"` in this tree was reported `✓ … (n tests)` by `pnpm test:types` and
// TS2322 by `pnpm typecheck:tests-dom`. Do not read a `pnpm test:types` pass as this file passing.
// The partition is pinned by tests/tooling/testd-lane-program-coverage.int.test.ts (#1270).

import { bindDurableLocalToUser } from "@orb/client/state/pure";
import type { UserId, VerifiedUserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

test("bindDurableLocalToUser REFUSES a bare UserId and accepts only the session-verified brand", () => {
  const clientDerived = castId<UserId>("usr_from_a_route_param");
  const verified = castId<VerifiedUserId>("usr_from_sessions_me");

  // @ts-expect-error — a plain `UserId` (a route param, a cached blob, the browser-writable boot hint)
  // cannot reach the namespace gate. THIS is the #854 defect, now unbuildable.
  void bindDurableLocalToUser(clientDerived);

  // The session-recovery seam's mint is the one thing that type-checks here.
  void bindDurableLocalToUser(verified);

  expectTypeOf(bindDurableLocalToUser).parameter(0).toEqualTypeOf<VerifiedUserId>();
  // ...and the brand is not silently widened back to UserId by the export boundary.
  expectTypeOf<UserId>().not.toExtend<Parameters<typeof bindDurableLocalToUser>[0]>();
});
