// The shapes `lib/ambient-determinism.ts` reads and answers with (#1988). The reader is shared by
// `no-raw-clock` and `no-raw-random`, so BOTH its input tuple and its verdict cross the lib↔policy
// boundary: each policy AUTHORS an `AmbientSource[]` and dispatches on the verdict's `kind`. A shape two
// policies write and one reader returns has one home, and `lib/` is not a type home
// (Spine-TypeScript-and-Patterns.md §7.4, Core-Tooling-Law.md §2.5).
import type { ReferenceUnresolvedReason } from "../../_shared/reference-fact-contract.ts";

/** One ambient source: the global's own name plus the property path below it (`Date` + `["now"]`). */
export interface AmbientSource {
  readonly globalName: string;
  readonly memberPath: readonly string[];
  /** The token a finding carries, so one policy's two arms stay distinguishable in a waiver/grant. */
  readonly token: string;
}

export type AmbientInvocationVerdict =
  | { readonly kind: "ambient"; readonly source: AmbientSource }
  /** The callee provably binds something else — an injected clock, a seeded PRNG, a local helper. */
  | { readonly kind: "other" }
  /** The callee could not be read at all; fail-closed evidence for the caller, never a silent pass. */
  | { readonly kind: "unreadable"; readonly reason: ReferenceUnresolvedReason; readonly detail: string };
