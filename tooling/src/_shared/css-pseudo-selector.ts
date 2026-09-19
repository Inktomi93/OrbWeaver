// A CSS subject may be a PSEUDO-ELEMENT CARRIER, and this is the one place that says so (#2431). Both
// rendered readers — the DevTools-SDK cascade bridge and the appearance census — take their subject as a
// selector STRING, and neither could address `.shell-panel::before`: `querySelectorAll` cannot select a
// pseudo (it answers population 0, measured) and `getComputedStyle(el)` with no second argument reads the
// HOST. That blind spot is not hypothetical — #1154 deliberately moved both of the shell panes' glass
// declarations off `.shell-panel` onto `.shell-panel::before` (a backdrop-filter on the pane composited it
// and killed per-paint baseline snapping for its text), so from that commit the appearance row
// `light-art-scrim-glass-elevation` asked the pane for a declaration the pane no longer carries and the
// matrix cell refused with "declaration population is zero: backdrop-filter".
//
// THE PSEUDO RIDES THE SELECTOR STRING rather than a parallel field: it is how CSS itself names the
// carrier, it keeps the appearance manifest's row shape unchanged, and it means the cascade FLAG
// (`--cascade '.shell-panel::before=backdrop-filter'`) and the manifest row reach the same subject through
// the same spelling. Each reader splits node-side and addresses the carrier in its own vocabulary.

/** The carriers a paint can legitimately live on — the generated-box pseudos, and only those. A
 *  highlight/state pseudo (`::selection`, `::first-line`) has no box to sample and no `pseudoElements()`
 *  node to read a computed style from, so admitting one would hand a reader a subject it cannot measure. */
export const CSS_PSEUDO_CARRIERS = ["::before", "::after"] as const;

export type CssPseudoCarrier = (typeof CSS_PSEUDO_CARRIERS)[number];

/** Chromium's `Protocol.DOM.PseudoType` spelling for a carrier — the key `DOMNode#pseudoElements()` maps. */
export const CSS_PSEUDO_TYPE: Readonly<Record<CssPseudoCarrier, string>> = { "::before": "before", "::after": "after" };

export interface CssSubjectSelector {
  /** The selector a DOM query can actually run. */
  readonly host: string;
  readonly pseudo: CssPseudoCarrier | null;
}

/** Split a TRAILING carrier suffix off a subject selector. Trailing only, deliberately: `:has(a::before)`
 *  names a host whose match CONDITION mentions a pseudo, and that selector is the host's, not the pseudo's. */
export function splitPseudoSelector(selector: string): CssSubjectSelector {
  const pseudo = CSS_PSEUDO_CARRIERS.find((candidate) => selector.endsWith(candidate));
  if (pseudo === undefined) {
    return { host: selector, pseudo: null };
  }
  return { host: selector.slice(0, -pseudo.length), pseudo };
}
