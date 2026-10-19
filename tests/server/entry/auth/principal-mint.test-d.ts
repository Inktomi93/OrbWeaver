// @subject packages/contracts/src/identity/index.ts
// @subject packages/server/src/entry/auth/principal-mint.ts
// D1/D40: a Principal comes only from the entry mint, so a hand-built, spread or retargeted value is a type error.
import type { Principal } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";
import type { AuthSeam, createHostPrincipalResolver } from "@orb/server/entry/auth";
import { expectTypeOf, test } from "vitest";

type RootPrincipal = Awaited<ReturnType<ReturnType<typeof createHostPrincipalResolver>>>;
type RequestPrincipal = Awaited<ReturnType<AuthSeam["resolvePrincipal"]>>["principal"];

declare const caller: RootPrincipal;
declare const victim: UserId;
declare function actAs(principal: Principal): void;

test("a holder of a real Principal cannot forge another one outside the entry mint", () => {
  const unannotated = { ...caller, userId: victim };
  // @ts-expect-error An unannotated spread carries no annotation for lint to see, so the brand alone refuses it at the call.
  actAs(unannotated);
  // @ts-expect-error A literal carrying every field and a real captured role is still not a minted Principal.
  const literal: Principal = { userId: victim, role: caller.role, handle: caller.handle, externalId: null, via: "fallback" };
  // @ts-expect-error Spreading a minted Principal under another user id forges an identity, so the brand does not survive it.
  const respread: Principal = { ...caller, userId: victim };
  // @ts-expect-error `satisfies` cannot stand in for the mint either.
  const satisfied = { userId: victim, role: caller.role, handle: caller.handle, externalId: null, via: "cookie" } satisfies Principal;
  const rebound = (): Principal => {
    // @ts-expect-error A return position is not a mint.
    return { ...caller, userId: victim };
  };
  // @ts-expect-error A hardcoded role string is not captured role data, and the spread drops the brand.
  const elevated: Principal = { ...caller, role: "user" };
  // @ts-expect-error A minted Principal is immutable, so a holder cannot retarget it at another user.
  caller.userId = victim;
  expectTypeOf([literal, respread, satisfied, rebound, elevated]).toBeArray();
});

test("the production request seam and row resolver hand out minted Principals", () => {
  expectTypeOf<RootPrincipal>().toEqualTypeOf<Principal>();
  expectTypeOf<RequestPrincipal>().toEqualTypeOf<Principal | null>();
  expectTypeOf<Pick<Principal, keyof Principal>>().not.toExtend<Principal>();
});

test("the public entry doors expose resolvers, never the mint itself", () => {
  expectTypeOf<"mintPrincipal">().not.toExtend<keyof typeof import("@orb/server/entry/auth")>();
  expectTypeOf<"mintPrincipal">().not.toExtend<keyof typeof import("@orb/server/entry/compose")>();
  expectTypeOf<"mintPrincipal">().not.toExtend<keyof typeof import("@orb/contracts/identity")>();
});
