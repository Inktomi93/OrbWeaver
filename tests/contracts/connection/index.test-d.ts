import type { CredentialSource as CredentialSourceViaConnection } from "@orb/contracts/connection";
import type { CredentialSource } from "@orb/contracts/credentials";
import { expectTypeOf, test } from "vitest";

// Type-level pins for the connection contract (moved out of `.contract.test.ts` per core/Spine-Testing.md §1
// — type assertions live in the `.test-d.ts` lane so the contract lane's noUnusedLocals stays clean).

// ── D31: connection re-exports CredentialSource verbatim (one tuple, no second declaration; divergence fails `tsc`) ──
test("connection re-exports CredentialSource verbatim (D31, no second tuple)", () => {
  expectTypeOf<CredentialSourceViaConnection>().toEqualTypeOf<CredentialSource>();
});
