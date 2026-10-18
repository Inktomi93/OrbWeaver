// The part of `reports/check-structure.json` that tools other than verify read. verify's `StructureReport`
// extends these shapes, so a rename on the writing side fails `tsc` instead of drifting past a reader.

/** One effective finding as a reader sees it. */
export interface StructureArtifactFinding {
  readonly file: string;
  readonly line: number;
  readonly token?: string;
}

/** Partial analysis is advisory evidence, never a severity-bearing finding. */
export interface StructureAnalysisCoverage {
  readonly supported: number;
  readonly unknown: readonly { readonly file: string; readonly line: number; readonly column: number; readonly token: string; readonly reason: string }[];
}

/** One final policy's outcome. */
export interface StructureArtifactGate {
  readonly analysis?: StructureAnalysisCoverage;
  readonly name: string;
  readonly withheld: boolean;
  readonly violations: readonly StructureArtifactFinding[];
  readonly waived: number;
  readonly granted: number;
  readonly population: { readonly effectiveSourcePaths: number };
}

/** The aggregate of the final-policy pass: tool errors, authority alarms and waiver consumption. */
export interface StructureArtifactPolicy {
  readonly toolErrors: readonly { readonly message: string }[];
  readonly authority: {
    readonly alarms: readonly { readonly kind: string; readonly policyId: string; readonly message: string }[];
    readonly toolErrors: readonly { readonly message: string }[];
    readonly ordinaryConsumption: readonly { readonly id: string; readonly count: number }[];
  };
}

/** The artifact. `policy` is null when the corpus resolved no policy. */
export interface StructureArtifact {
  readonly gates: readonly StructureArtifactGate[];
  readonly policy: StructureArtifactPolicy | null;
}
