export const QUALIFICATION_AUTHORITIES = ["qualified", "publication"] as const;
type QualificationAuthority = (typeof QUALIFICATION_AUTHORITIES)[number];

/** One authored conditional job name and its complete expanded runtime population. */
export interface CiQualificationJobGroup {
  readonly name: string;
  readonly jobs: readonly string[];
}

export interface CiQualificationConfig {
  readonly repository: string;
  readonly generation: string;
  readonly publication: string;
  readonly requiredJobs: readonly string[];
  readonly runtimeJobs: readonly string[];
  /** Complete workflow-owned partition; omitted configurations admit expanded records only. */
  readonly runtimeJobGroups?: readonly CiQualificationJobGroup[];
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
