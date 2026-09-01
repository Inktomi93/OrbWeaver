// Matrix-only evidence for #953's seven literal historical appearance rows. The client contract owns
// what must be sampled; Snap owns how one browser cell accounts for and judges those subjects.

import type { CssEvidenceReceipt } from "./cascade.ts";
import type { ContrastEvidence } from "./contrast.ts";
import type { DeadCssEvidence } from "./dead-css.ts";

interface AppearanceSkippedPopulation {
  readonly reason: string;
  readonly count: number;
}

export interface AppearancePopulationAccounting {
  readonly declared: number;
  readonly candidates: number;
  readonly reached: number;
  readonly sampled: number;
  readonly skipped: readonly AppearanceSkippedPopulation[];
  readonly occluded: number;
  readonly offViewport: number;
}

export interface AppearanceSubjectReceipt {
  readonly id: string;
  readonly selector: string;
  readonly matchIndex: number | null;
  readonly accounting: AppearancePopulationAccounting;
}

export interface AppearanceInvariantCheck {
  readonly id: string;
  readonly expected: string;
  readonly actual: string;
  readonly passed: boolean;
}

export interface AppearanceCascadeExpectation {
  readonly selector: string;
  readonly property: string;
  readonly matchIndex: number;
  readonly expectedValue: string;
  readonly expectedSource: string;
  readonly expectedOverloadedSources: readonly string[];
}

export type AppearanceMergeExpectation =
  | {
      readonly mechanism: "merge-required";
      readonly selector: string;
      readonly owner: string;
      readonly conflict: { readonly axis: string; readonly loser: string; readonly winner: string };
      readonly expectedOutput: string;
    }
  | {
      readonly mechanism: "merge-not-applicable";
      readonly reason: "direct-carrier";
      readonly selector: string;
      readonly owner: string;
    };

export interface AppearanceInvariantReceipt {
  readonly rowId: string;
  readonly accounting: AppearancePopulationAccounting;
  readonly subjects: readonly AppearanceSubjectReceipt[];
  readonly checks: readonly AppearanceInvariantCheck[];
  readonly pixels: readonly ContrastEvidence[];
  readonly cascade: readonly AppearanceCascadeExpectation[];
  readonly merge: AppearanceMergeExpectation;
  readonly deadCss: DeadCssEvidence;
  readonly css: CssEvidenceReceipt;
}

export interface AppearanceInvariantEvaluation {
  readonly status: "instrument-error" | "ok" | "violations";
  readonly errors: readonly string[];
  readonly violations: readonly string[];
  readonly accounting: AppearancePopulationAccounting;
  readonly mergeRequired: number;
  readonly mergeDirectCarrier: number;
}

export interface AppearanceInvariantResult {
  readonly receipt: AppearanceInvariantReceipt;
  readonly evaluation: AppearanceInvariantEvaluation;
}
