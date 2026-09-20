// The proof denominators that apply to the WHOLE ui-audit walker rather than one finding family.
// Split from samples.ts at #976 so that file remains under Core-Tooling-Law's hard source-size cap.

/** ONE element that keeps the document from fitting the width it was laid out at, in the two shapes the
 *  walk can tell apart (ops/walker/census-frame.ts owns why one shape alone misses half the population):
 *  `spillPx` is the box's own content overflowing it (`scrollWidth - clientWidth`), `pastViewportPx` is
 *  the box's RECT reaching past the viewport's right edge. The pair is what makes the refusal a finding
 *  a reader can act on in a minute rather than a wall saying "this page overflows". */
export interface DocumentFrameCarrier {
  readonly selector: string;
  readonly clientWidth: number;
  readonly scrollWidth: number;
  readonly spillPx: number;
  readonly pastViewportPx: number;
}

/** The page's own frame against the viewport the walk judged it at (lane cb-audit-viewport, 2026-09-20).
 *  REQUIRED on `RawSamples`, deliberately and for `censusCaps`' reason: an absent-reads-as-fits field
 *  would restore the exact silence the refusal exists to end, so a walker that omits it is an instrument
 *  error at the seam (ops/page-validate.ts) rather than a run that reads uncrushed-clean.
 *
 *  `carriers.total` is the WHOLE population and `worst` is the bounded list — a truncated list must never
 *  read as the complete one. The HEIGHT pair is carried and never judged: pages scroll down by design,
 *  and the ruling (and the separate fold defect that symptom belonged to) is in census-frame.ts's header. */
export interface DocumentFrameInput {
  readonly viewportWidth: number;
  readonly contentWidth: number;
  readonly viewportHeight: number;
  readonly contentHeight: number;
  readonly tolerancePx: number;
  readonly carriers: {
    readonly total: number;
    readonly worst: readonly DocumentFrameCarrier[];
  };
}

/** Exact ownership of the document-element population the walk took as its one judged snapshot (#976).
 *  `observed` is the population at the end of the bounded pre-walk settle; `settled` is the immediately
 *  following identity snapshot. Every snapshot identity must be walked or belong to one closed skip class,
 *  and the identity set must remain unchanged until the walker returns. */
export interface SubjectAccountingInput {
  readonly observed: number;
  readonly settled: number;
  readonly stabilized: boolean;
  /** Element-bearing child-list mutations seen while waiting for the pre-walk quiet window. */
  readonly settleMutations: number;
  readonly walked: number;
  /** Walked subjects that painted on the active rendered surface. */
  readonly renderedSubjects: number;
  /** Walked identities retained in the DOM but hidden by their own or an ancestor's rendered state. */
  readonly retainedHiddenSubjects: number;
  readonly skipped: {
    readonly documentHead: number;
    readonly devChrome: number;
  };
  /** Snapshot subjects whose basic computed-style read threw. Never a clean skip. */
  readonly inaccessible: number;
  readonly final: number;
  readonly added: number;
  readonly detached: number;
  /** Element-bearing child-list mutations seen after the snapshot and before return. */
  readonly walkMutations: number;
}

/** Rendered theme facts, gathered only from painted subjects in the same identity snapshot (#976). */
export interface ThemeRenderInput {
  readonly rootDataTheme: string | null;
  readonly shellScope: {
    readonly present: boolean;
    readonly inlineBackground: string | null;
    readonly colorScheme: string | null;
  };
  readonly subjectSources: {
    readonly default: number;
    readonly seed: number;
    readonly custom: number;
    readonly unknown: number;
  };
  readonly subjectPolarities: {
    readonly light: number;
    readonly dark: number;
    readonly mixed: number;
    readonly unknown: number;
  };
}

/** The obscured census's own denominator (#797). A centre still outside the frame after a legitimate
 * reveal, or an in-frame centre whose compositor hit-test answers null, is withheld rather than read as
 * unobscured. Historical fixture bundles may omit the additive reach and subject details. */
export interface ObscuredScanInput {
  readonly candidates: number;
  readonly recentred?: number;
  readonly revealScrolls?: number;
  readonly unaskable: number;
  readonly subjects?: readonly {
    readonly selector: string;
    readonly reason: "centre-outside-frame" | "hit-test-null";
    readonly centre: { readonly x: number; readonly y: number };
    readonly rect: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
    readonly interactive: boolean;
    readonly text: string;
  }[];
}
