// Synthetic ledger vocabulary used only by gate-modernization's policy proofs. Keeping the complete
// baseline identity in the sanctioned proof surface prevents the production gate module from declaring a
// gate-owned baseline while its file maps still exercise the exact spelling.
export const GATE_MODERNIZATION_PROBE_LEDGER_SUFFIX = ".baseline.json";
export const GATE_MODERNIZATION_PROBE_LEDGER = `tooling/src/verify/gates/__probe${GATE_MODERNIZATION_PROBE_LEDGER_SUFFIX}`;
