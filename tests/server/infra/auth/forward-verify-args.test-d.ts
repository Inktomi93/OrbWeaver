// A request cannot hand the forward verifier a key source: the call has no key input to fill.
// @subject packages/server/src/infra/auth/contract.ts

import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { expectTypeOf } from "vitest";

type VerifyArgs = Parameters<NonNullable<ServerTestHarness["app"]["forwardJwtVerifier"]>["verify"]>[0];

expectTypeOf<keyof VerifyArgs>().toEqualTypeOf<"jwt" | "issuer" | "audience">();
