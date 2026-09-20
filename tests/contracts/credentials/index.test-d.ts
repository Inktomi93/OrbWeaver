import type { ResolvedSecret } from "@orb/contracts/credentials";
import { expectTypeOf, test } from "vitest";

// Type-level pin for the credentials contract (core/Spine-Testing.md §1 — the brand-unconstructable pin is a
// `tsc`-time assertion, so it lives in the `.test-d.ts` lane).

// ── The ResolvedSecret brand is unconstructable from a bare literal (phantom `unique symbol`) ─────────
// The only way to mint a `ResolvedSecret` is the credentials domain's `mintSecret` factory; the brand key is
// unreachable outside that module, so a plain object literal can NEVER satisfy it.
test("a plain object literal cannot satisfy the ResolvedSecret brand", () => {
  // @ts-expect-error — the phantom brand key is unreachable, so the literal is unassignable.
  const fake: ResolvedSecret = { kind: "none", secret: null, credentialId: null };
  // Reference `fake` so it is not an unused local; after the suppressed assignment it types as the brand.
  expectTypeOf(fake).toEqualTypeOf<ResolvedSecret>();
});
