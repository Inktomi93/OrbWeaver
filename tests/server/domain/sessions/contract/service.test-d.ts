// Type-level pin for the SessionToken brand (kit/ids): the BFF session cookie value is a trust-boundary
// string, so every seam that accepts or returns one is typed `SessionToken`, not `string`. Without this a
// handle / an externalId / a raw request field flows into a session-token position and typechecks.
//
// Each assertion below IS the enforcement: `not.toMatchTypeOf` flips to a compile error the moment a seam
// widens back to `string`. Runtime behavior (hash lookup, revoke, expiry slide) is covered by the
// `.int.test.ts` siblings — this file only pins the compile-time refusal.

import type { ResolvedIdentity } from "@orb/contracts/identity";
import type { SessionToken } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";
import type { ProvisionIdentityOptions } from "../../../../../packages/server/src/domain/sessions/contract/params.ts";
import type { CreateSessionResult } from "../../../../../packages/server/src/domain/sessions/contract/results.ts";
import type { SessionsContext, SessionsService } from "../../../../../packages/server/src/domain/sessions/contract/service.ts";
import type { decideProvision } from "../../../../../packages/server/src/domain/sessions/substrate/decide-provision.ts";

test("the session-token READ seams accept only a SessionToken — a plain string is refused", () => {
  expectTypeOf<SessionsService["validate"]>().parameter(0).toEqualTypeOf<SessionToken>();
  expectTypeOf<SessionsService["revokeByToken"]>().parameter(0).toEqualTypeOf<SessionToken>();
  // The refusal itself: an unbranded string cannot flow into a session-token position.
  expectTypeOf<string>().not.toExtend<Parameters<SessionsService["validate"]>[0]>();
  expectTypeOf<string>().not.toExtend<Parameters<SessionsService["revokeByToken"]>[0]>();
});

test("the MINT seam returns a SessionToken (the cookie write side can't be handed a bare string)", () => {
  expectTypeOf<CreateSessionResult["token"]>().toEqualTypeOf<SessionToken>();
  expectTypeOf<string>().not.toExtend<CreateSessionResult["token"]>();
});

test("the MINT rides the DI seam and yields the brand (verbs never reach tokens/ directly)", () => {
  expectTypeOf<SessionsContext["mintToken"]>().returns.toEqualTypeOf<SessionToken>();
  expectTypeOf<SessionsContext["mintToken"]>().parameters.toEqualTypeOf<[]>();
});

test("the peppered hasher is bound to session tokens inside the sessions context", () => {
  // `createTokenHasher` stays a generic `(string) => string` (chat invites share the primitive); the
  // NARROWING is on the sessions DI bundle, so a sessions verb can only hash a session token.
  expectTypeOf<SessionsContext["hashToken"]>().parameter(0).toEqualTypeOf<SessionToken>();
  expectTypeOf<string>().not.toExtend<Parameters<SessionsContext["hashToken"]>[0]>();
});

// D258: every SSO caller states its owner-claim proof. An optional or defaulted proof would hand a new caller
// handle-based ownership by omission, which is the takeover the proof exists to stop.
test("provisionIdentity and decideProvision refuse a call that omits the owner-claim proof", () => {
  expectTypeOf<ProvisionIdentityOptions["ownerClaimProven"]>().toEqualTypeOf<boolean>();
  expectTypeOf<SessionsService["provisionIdentity"]>().parameter(1).toEqualTypeOf<ProvisionIdentityOptions>();
  const omissions = async (provision: SessionsService["provisionIdentity"], decide: typeof decideProvision, identity: ResolvedIdentity): Promise<void> => {
    // @ts-expect-error the options argument, which carries the proof, is required
    await provision(identity);
    // @ts-expect-error an options object without the proof is refused
    await provision(identity, { allowJitProvision: true });
    // @ts-expect-error the pure decision takes the same required proof
    void decide(undefined, identity, undefined, {});
  };
  expectTypeOf(omissions).toBeFunction();
});
