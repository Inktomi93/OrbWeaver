export const ACCOUNTING_CASES = [
  { name: "recorded zero", tokens: 0, provenance: "measured", cost: 0, tokenValue: "0", costValue: "$0.00", label: "Recorded" },
  { name: "estimated tokens", tokens: 1200, provenance: "estimated", cost: null, tokenValue: "~1.2k", costValue: "—", label: "Estimated" },
  { name: "missing accounting", tokens: null, provenance: "unrecorded", cost: null, tokenValue: "—", costValue: "—", label: "Not recorded" },
] as const;
