import { gate as lengthTokens } from "../../tooling/src/verify/gates/css-length-tokens.ts";
import { gate as variableResolution } from "../../tooling/src/verify/gates/css-var-defined.ts";
import { gate as polarity } from "../../tooling/src/verify/gates/no-tailwind-dark-variant.ts";
import { verifyGateProofs } from "../../tooling/src/verify/ops/conformance.ts";
import { verifyPolicyProofs } from "../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../support/tool-fixtures.ts";

/** Three gate proofs over the real tree: measured 5.3s on a loaded box (2026-09-01 barrier), over vitest's 5s default. */
const PROOF_BUDGET_MS = 30_000;

// `no-tailwind-dark-variant` migrated to the final `defineGate` contract (#1917); its proofs run through
// `verifyPolicyProofs`, separately from the still-legacy shared static-class consumers below.
//
// `css-family-ownership` and `css-selector-has-a-writer` LEFT this suite on 2026-09-13 (#2181, #2182): both
// converted and SPLIT by authority into five final policies under the `css-hook-provenance` family, whose
// declared rows the conformance stage runs and whose arms a row cannot express live in
// tests/tooling/verify/gates/css-hook-provenance-family.test.ts. What remains here is the still-legacy half
// of the shared static-class substrate.
test(
  "no-tailwind-dark-variant retains every planted control under the final policy runtime",
  () => {
    expect(verifyPolicyProofs([polarity])).toEqual([]);
  },
  PROOF_BUDGET_MS,
);

test(
  "shared static class consumers retain every planted control",
  () => {
    expect(verifyGateProofs([variableResolution, lengthTokens])).toEqual([]);
  },
  PROOF_BUDGET_MS,
);
