import { gate as familyOwnership } from "../../tooling/src/verify/gates/css-family-ownership.ts";
import { gate as lengthTokens } from "../../tooling/src/verify/gates/css-length-tokens.ts";
import { gate as selectorWriter } from "../../tooling/src/verify/gates/css-selector-has-a-writer.ts";
import { gate as variableResolution } from "../../tooling/src/verify/gates/css-var-defined.ts";
import { gate as polarity } from "../../tooling/src/verify/gates/no-tailwind-dark-variant.ts";
import { verifyGateProofs } from "../../tooling/src/verify/ops/conformance.ts";
import { expect, test } from "../support/tool-fixtures.ts";

/** Three gate proofs over the real tree: measured 5.3s on a loaded box (2026-09-01 barrier), over vitest's 5s default. */
const PROOF_BUDGET_MS = 30_000;

test(
  "shared static class consumers retain every planted control",
  () => {
    expect(verifyGateProofs([familyOwnership, variableResolution, polarity, lengthTokens, selectorWriter])).toEqual([]);
  },
  PROOF_BUDGET_MS,
);
