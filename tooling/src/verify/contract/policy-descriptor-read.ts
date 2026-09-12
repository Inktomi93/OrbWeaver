// The shapes the `policy-soundness` family's shared reader (`lib/policy-descriptor-read.ts`) answers with.
// A type home below the reader, so the four consuming policies and the reader's own tests import one spelling.
import type { Node, ObjectLiteralExpression } from "ts-morph";

/** The contiguous static text pieces of a string expression; `complete` when nothing dynamic interrupted. */
export interface StaticSegments {
  readonly segments: readonly string[];
  readonly complete: boolean;
}

/** The object-literal rows of a `mustFlag`/`mustPass` array, plus every element that is not one. */
export interface ProofRows {
  readonly rows: readonly ObjectLiteralExpression[];
  readonly unreadable: readonly Node[];
}

/** One report site's message provenance: the descriptor's own `message`, a readable override, or unreadable. */
export type ReportSiteMessage = { readonly kind: "policy" } | { readonly kind: "override"; readonly text: StaticSegments } | { readonly kind: "unreadable" };

/** What a `messageIncludes` substring can tell apart, given a module's message sources. */
export const DISCRIMINATIONS = ["discriminates", "tautology", "shared", "unjudged"] as const;
export type Discrimination = (typeof DISCRIMINATIONS)[number];
