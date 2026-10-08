export const QUALIFICATION_AUTHORITIES = ["qualified", "publication"] as const;
type QualificationAuthority = (typeof QUALIFICATION_AUTHORITIES)[number];

export interface CiQualificationConfig {
  readonly repository: string;
  readonly generation: string;
  readonly publication: string;
  readonly requiredJobs: readonly string[];
  readonly runtimeJobs: readonly string[];
  readonly hasCurrentGeneration: (workflow: string) => boolean;
}

export interface QualificationDecision {
  readonly base: string;
  readonly head: string;
  readonly eventBase: string;
  readonly authority: QualificationAuthority;
  readonly code: boolean;
  readonly paths: readonly string[];
}

export interface QualificationMeasurement {
  readonly head: string;
  readonly eventBase: string;
  readonly base: string;
  readonly authority: QualificationAuthority;
}
