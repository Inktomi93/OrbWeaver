// The verdict `lib/sealed-origin.ts#readSealedOrigin` answers with (#1988). Nine policies narrow it
// (`membership-enforcer`, `providers-runner-seal`, `vector-scope-derived`, `no-direct-users-read`,
// `turn-identity`, `discovery-no-stats-rollups`, `scrubber-home`, `content-part-seam`,
// `untrusted-regex-safe-exec`), so it crosses the lib↔policy boundary and `lib/` is not a type home
// (Spine-TypeScript-and-Patterns.md §7.4, Core-Tooling-Law.md §2.5).
//
// It is an OBJECT union carrying the resolved origin, not the three-string identity axis, so it derives
// from `origin-verdict.ts` no more than `ModuleMemberOrigin` does: its `unresolved` arm carries the whole
// refusing fact so the caller can report WHAT could not be read.
import type { ModuleMemberOrigin, ReferenceFact } from "./reference-fact.ts";

/** The verdict for one candidate reference. `unresolved` is never absence: a candidate whose origin cannot
 *  be read is fail-closed evidence for the caller, not a silent pass. */
export type SealedOriginVerdict =
  | { readonly kind: "sealed"; readonly exportedName: string; readonly origin: ModuleMemberOrigin }
  | { readonly kind: "foreign"; readonly origin: ModuleMemberOrigin }
  | { readonly kind: "unresolved"; readonly fact: Extract<ReferenceFact<ModuleMemberOrigin>, { readonly kind: "unresolved" }> };
