// The raw facts `--contrast`'s in-page script returns, before any verdict is formed. Split out of
// ops/contrast.ts when the #466 exemption pushed that file past the tooling size cap; shapes live in
// contract/ by the five-slot template (docs/design/tooling-package.md §2.5).

/** Every match is outside the viewport (#211): measuring one would be a verdict on pixels nobody saw. */
export interface ContrastOffscreen {
  offscreen: true;
  total: number;
}

/** Matches that ARE in the viewport but every one of them is painted over by something else (#211) — a
 *  third distinct outcome, because measuring one samples the OCCLUDER's pixels, and "I can only see the
 *  topbar there" is not "it fails contrast" either. */
export interface ContrastOccluded {
  occluded: true;
  total: number;
  inViewport: number;
  occluder: string | null;
}

export interface ContrastMeasured {
  color: string;
  fontSizePx: number;
  fontWeight: number;
  // "flat" = a trustworthy opaque ancestor bg (css-resolve path); "transparent"/"indeterminate" = the
  // ancestor walk couldn't see the real backdrop (a fixed sibling layer / a background-image) — Node
  // pixel-samples the composite instead of trusting a fabricated baseline.
  backdrop: { kind: "flat"; color: string } | { kind: "transparent" } | { kind: "indeterminate" };
  hasText: boolean;
  inactive: boolean;
  role: string;
  tag: string;
  /** Product of `opacity` over the element + ancestors — <1 means the foreground is painted dimmed and
   *  must be composited at this alpha over the backdrop before measuring. */
  foregroundOpacity: number;
  box: { x: number; y: number; width: number; height: number };
  /** Which querySelectorAll index actually got measured, and how many matched — a non-zero index means
   *  earlier matches were skipped as off-viewport OR as occluded, which the report states so nobody
   *  assumes "the first one". */
  matchIndex: number;
  total: number;
}

export type ContrastFacts = ContrastMeasured | ContrastOffscreen | ContrastOccluded | null;

export interface ContrastBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
