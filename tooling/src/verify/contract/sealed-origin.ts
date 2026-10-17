// Sealed-origin verdicts cross the reader/policy boundary; unresolved evidence retains its complete refusal.

import type { Node } from "ts-morph";
import type { ModuleMemberOrigin, ReferenceFact } from "../../floor/code-facts/reference-fact-contract.ts";

export interface SealedReferenceAnchor {
  readonly node: Node;
  readonly token: string;
  readonly offset: number;
}

/** The verdict for one candidate reference. `unresolved` is never absence: a candidate whose origin cannot
 *  be read is fail-closed evidence for the caller, not a silent pass. */
export type SealedOriginVerdict =
  | { readonly kind: "sealed"; readonly exportedName: string; readonly origin: ModuleMemberOrigin }
  | { readonly kind: "foreign"; readonly origin: ModuleMemberOrigin }
  | { readonly kind: "unresolved"; readonly fact: Extract<ReferenceFact<ModuleMemberOrigin>, { readonly kind: "unresolved" }> };
