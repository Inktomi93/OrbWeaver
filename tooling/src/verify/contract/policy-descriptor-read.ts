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

/** What a `messageIncludes` substring can tell apart, given a module's message sources.
 *  @public knip type-face false positive — the one-home vocabulary tuple behind the exported `Discrimination` union (line 32) —
 *  the ONE importable spelling of this axis, which nothing outside this module enumerates YET; un-exporting it would invite the
 *  re-spell `no-inline-union-redecl` exists to stop. */
export const DISCRIMINATIONS = ["discriminates", "tautology", "shared", "unjudged"] as const;
export type Discrimination = (typeof DISCRIMINATIONS)[number];

/** The marker GRAMMARS the final contract retired (gate-runtime-standardization.md §7 kinds 1 and 3, plus the
 *  three the census found parsed gate-locally): the central legacy `@orb-gate-ignore` and every gate-owned custom
 *  opener. A FINAL module has exactly one waiver vocabulary, the central `@orb-waive`, and receives no marker
 *  parser (§12.5) — so a regex literal, a `new RegExp(…)` or a membership test that names one of these is a
 *  private grammar carried across a conversion, and `policy-soundness` E6 reports it. A MENTION in prose (a
 *  `why`, a `message`, a `fix` naming the retired spelling) is not a parse and is acquitted. */
export const RETIRED_MARKER_OPENERS = [
  "@orb-gate-ignore",
  "@foreign-id-ok",
  "@owner-scope-ok",
  "@owner-scope-write-ok",
  "@owner-scope-upsert-ok",
  "@nullable-cmp-ok",
  "@sub-floor-ok",
  "@swallowed-ok",
  "@surface-focus-elsewhere",
  "@finding-overload-ok",
  "@first-boot-only",
  "@over-art-plate-ok",
  "@column-ok",
  "FABRICATION-OK",
  "ONESHOT-OK",
  "PROSE-OK",
] as const;
/** @public knip type-face false positive — the importable union spelling of the `RETIRED_MARKER_OPENERS` vocabulary — one home
 *  for the axis (Spine-TypeScript-and-Patterns.md §5.5), which consumers reach through the literal today rather than by naming
 *  the alias. */
export type RetiredMarkerOpener = (typeof RETIRED_MARKER_OPENERS)[number];

/** How a final module registers under the contract, as the family reader sees it: the callee resolved by import
 *  origin to `contract/policy.ts`, and the descriptor literal when the argument IS one. A non-literal argument
 *  (`defineGate(DESCRIPTOR)`) is a registration with no readable descriptor — §12.1 requires the direct object
 *  literal, and `policy-soundness` E7 reports the shape; every arm that reads fields needs the literal. */
export interface FinalRegistration {
  readonly callee: Node;
  readonly argument: Node | undefined;
  readonly descriptor: ObjectLiteralExpression | undefined;
}
