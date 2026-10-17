import type { Node } from "ts-morph";
import type { GlobalMemberOrigin, ReferenceFact, ReferenceUnresolvedReason } from "../../floor/code-facts/reference-fact-contract.ts";
import type { OriginReferenceServices } from "./origin-verdict.ts";

export interface AmbientReferenceServices extends OriginReferenceServices {
  readonly globalOrigin: (node: Node) => ReferenceFact<GlobalMemberOrigin>;
}

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
