// Preserve the entire legacy corpus while its source reader is prepared for final dispatcher adoption.
import { gate } from "../../../../tooling/src/verify/gates/ui-primitive-structure.ts";
import { verifyGateProofs } from "../../../../tooling/src/verify/ops/conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

test(
  "every UI primitive structure example still holds through production legacy dispatch",
  () => {
    expect(verifyGateProofs([gate])).toEqual([]);
  },
  scaledBudget(30_000),
);
