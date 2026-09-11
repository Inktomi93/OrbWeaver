import { gate as familyOwnership } from "../../tooling/src/verify/gates/css-family-ownership.ts";
import { gate as lengthTokens } from "../../tooling/src/verify/gates/css-length-tokens.ts";
import { gate as selectorWriter } from "../../tooling/src/verify/gates/css-selector-has-a-writer.ts";
import { gate as variableResolution } from "../../tooling/src/verify/gates/css-var-defined.ts";
import { gate as polarity } from "../../tooling/src/verify/gates/no-tailwind-dark-variant.ts";
import { verifyGateProofs } from "../../tooling/src/verify/ops/conformance.ts";
import { verifyPolicyProofs } from "../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../support/tool-fixtures.ts";

/** Three gate proofs over the real tree: measured 5.3s on a loaded box (2026-09-01 barrier), over vitest's 5s default. */
const PROOF_BUDGET_MS = 30_000;

// `no-tailwind-dark-variant` migrated to the final `defineGate` contract (#1917); its proofs run through
// `verifyPolicyProofs`, separately from the still-legacy shared static-class consumers below.
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
    expect(verifyGateProofs([familyOwnership, variableResolution, lengthTokens, selectorWriter])).toEqual([]);
  },
  PROOF_BUDGET_MS,
);
