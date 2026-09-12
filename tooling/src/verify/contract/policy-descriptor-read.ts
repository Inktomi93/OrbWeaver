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

/** One report site's message provenance: the descriptor's own `message`, a readable override, or unreadable.
 *
 *  An override carries ALTERNATIVES, never one folded read (#2055): a site whose message is
 *  `cond ? A : B` emits A or B and never a text containing both, so it is TWO sources — folding them into
 *  one union made a substring that lives in exactly one branch read as matching the module's only source,
 *  and the TAUTOLOGY arm fired on a row that discriminates. Every entry is one text the site can emit; an
 *  entry with no segments is a branch this reader could not read at all, which the census counts as an
 *  unreadable SOURCE. */
export type ReportSiteMessage =
  | { readonly kind: "policy" }
  | { readonly kind: "override"; readonly texts: readonly StaticSegments[] }
  | { readonly kind: "unreadable" };

/** What a `messageIncludes` substring can tell apart, given a module's message sources. */
export const DISCRIMINATIONS = ["discriminates", "tautology", "shared", "unjudged"] as const;
export type Discrimination = (typeof DISCRIMINATIONS)[number];
