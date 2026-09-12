// The ONE enumeration of a policy's proof rows across every arm (#2111). Before this, the conformance runner, the
// stage's counts and a dozen family tests each spelled `[...mustFlag, ...mustPass, ...(mustRefuse ?? [])]` by hand —
// and the #1977 arm was added to the runner while two of those spellings kept counting two arms, which is exactly
// how a third arm runs unmentioned. Every reader now walks `POLICY_PROOF_ARMS` through this door, so a fourth arm
// is one contract row and no enumeration is left behind.
import type { GatePolicy, GatePolicyProof, PolicyProofArm } from "../contract/policy.ts";
import { POLICY_PROOF_ARMS } from "../contract/policy.ts";

export interface PolicyProofRow {
  readonly arm: PolicyProofArm;
  readonly index: number;
  readonly proof: GatePolicyProof;
}

/** Every declared row, in arm order then declaration order — an absent optional arm contributes nothing. */
export function policyProofRows(policy: GatePolicy): readonly PolicyProofRow[] {
  return POLICY_PROOF_ARMS.flatMap((arm) => (policy[arm] ?? []).map((proof, index) => ({ arm, index, proof })));
}

/** How many rows a policy carries under each arm — the stage prints the arms apart so a total can never hide one. */
export function policyProofArmCounts(policy: GatePolicy): Readonly<Record<PolicyProofArm, number>> {
  return Object.fromEntries(POLICY_PROOF_ARMS.map((arm) => [arm, policy[arm]?.length ?? 0])) as Record<PolicyProofArm, number>;
}
