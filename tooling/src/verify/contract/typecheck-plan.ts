import type { PolicySemanticPath } from "./policy-scope.ts";

export const TYPECHECK_PLAN_MODES = ["primary", "affected"] as const;
export type TypecheckPlanMode = (typeof TYPECHECK_PLAN_MODES)[number];

export const TYPECHECK_SUBJECT_DISPOSITIONS = ["selected", "not-applicable"] as const;
export type TypecheckSubjectDisposition = (typeof TYPECHECK_SUBJECT_DISPOSITIONS)[number];

export interface TypecheckPlanSubject extends PolicySemanticPath {
  readonly disposition: TypecheckSubjectDisposition;
  readonly rootedBy: readonly string[];
  readonly containedBy: readonly string[];
  readonly selectedPrograms: readonly string[];
  readonly reason: "primary-root" | "affected-closure" | "compiler-config-input" | "deleted-conservative" | "not-type-input" | "abstract-config";
}

export interface TypecheckPlan {
  readonly mode: TypecheckPlanMode;
  readonly coverage: "advisory-primary-programs" | "complete-affected-programs";
  readonly programs: readonly string[];
  readonly subjects: readonly TypecheckPlanSubject[];
}
