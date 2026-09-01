// The proof denominators that apply to the WHOLE ui-audit walker rather than one finding family.
// Split from samples.ts at #976 so that file remains under Core-Tooling-Law's hard source-size cap.

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

/** Rendered theme facts, gathered from the same subject snapshot as the design census (#976). */
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
