// `json-column-read-parsed` judges a read by its receiver and its parser: a select row's typed column is reported
// in every spelling (dotted, keyed, destructured, partial select) until a zod or codec parse takes it, while a verb
// input, a write-back and a presence test are not reads. The declared rows carry each plant; this runs them.
import { gate } from "../../../../tooling/src/verify/gates/json-column-read-parsed.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CONFORMANCE_TIMEOUT_MS = scaledBudget(120_000);

test(
  "every catch and pass row holds through the production dispatcher",
  () => {
    expect(verifyPolicyProofs([gate])).toEqual([]);
  },
  CONFORMANCE_TIMEOUT_MS,
);
