// #2181: run the original and liveness proofs through the legacy dispatcher on real temporary files.
// The descriptor remains legacy; this suite does not authorize its held authority conversion.
import { gate } from "../../../../tooling/src/verify/gates/css-length-tokens.ts";
import { verifyGateProofs } from "../../../../tooling/src/verify/ops/conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

test(
  "all original length examples and each guarded declaration/class liveness control hold on disk",
  () => {
    expect(verifyGateProofs([gate])).toEqual([]);
  },
  scaledBudget(30_000),
);
