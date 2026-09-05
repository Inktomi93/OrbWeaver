/** Mechanical authoring violations for Orb gate modules. Semantic rule quality stays in each gate's
 * planted proofs and review; this contract only reports source shapes the shared runtime forbids. */
export const GATE_CONTRACT_CODES = [
  "descriptor-wrapper",
  "legacy-field",
  "direct-walk",
  "gate-owned-project",
  "module-let",
  "module-mutation",
  "baseline-ledger",
] as const;

export type GateContractCode = (typeof GATE_CONTRACT_CODES)[number];

export interface GateContractFinding {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly code: GateContractCode;
  readonly detail: string;
}

export interface GateContractReport {
  readonly files: number;
  readonly findings: readonly GateContractFinding[];
}
