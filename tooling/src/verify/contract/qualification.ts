export const QUALIFICATION_AUTHORITIES = ["qualified", "publication"] as const;
type QualificationAuthority = (typeof QUALIFICATION_AUTHORITIES)[number];
export const VERIFY_TOOL_MODES = ["affected", "full"] as const;
type VerifyToolMode = (typeof VERIFY_TOOL_MODES)[number];
export const VERIFY_TOOL_MODE_ENV = "ORB_VERIFY_TOOL_MODE";

export interface CiQualificationConfig {
  readonly repository: string;
  readonly generation: string;
  readonly publication: string;
  readonly corpusJobs: readonly [string, string];
  readonly hasCurrentGeneration: (workflow: string) => boolean;
}

export interface QualificationDecision {
  readonly base: string;
  readonly head: string;
  readonly eventBase: string;
  readonly authority: QualificationAuthority;
  readonly toolMode: VerifyToolMode;
  readonly code: boolean;
  readonly paths: readonly string[];
}

export interface QualificationMeasurement {
  readonly head: string;
  readonly eventBase: string;
  readonly base: string;
  readonly authority: QualificationAuthority;
}
