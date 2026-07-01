import type { ChatSource } from "@orb/contracts/connection";
import type { CredentialSource } from "@orb/contracts/credentials";
import { expectTypeOf, test } from "vitest";

// Type-level pins for the connection contract (moved out of `.contract.test.ts` per core/Spine-Testing.md §1
// — type assertions live in the `.test-d.ts` lane so the contract lane's noUnusedLocals stays clean).

// ── D31: ChatSource IS CredentialSource (one tuple, re-exported; divergence fails `tsc`) ──────────────
test("ChatSource is a verbatim re-export of CredentialSource (D31, no second tuple)", () => {
  expectTypeOf<ChatSource>().toEqualTypeOf<CredentialSource>();
});
