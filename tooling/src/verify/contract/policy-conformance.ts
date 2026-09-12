// Stable failures emitted while proving final policy descriptors against their own examples.

export type PolicyProofArm = "mustFlag" | "mustPass" | "mustRefuse";

export interface PolicyConformanceFailure {
  readonly policyId: string;
  readonly arm: PolicyProofArm;
  readonly exampleIndex: number;
  readonly why: string;
  readonly detail: string;
}
