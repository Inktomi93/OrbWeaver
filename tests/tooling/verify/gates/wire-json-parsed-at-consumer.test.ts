// `wire-json-parsed-at-consumer` reports every cast spelling of a response body read (`.json()`, a `.then` callback
// returning it, `JSON.parse` over `.text()`) and passes the parsed and `unknown` forms. The declared rows carry each
// plant; this runs them.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { gate } from "../../../../tooling/src/verify/gates/wire-json-parsed-at-consumer.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CONFORMANCE_TIMEOUT_MS = scaledBudget(120_000);

test(
  "every catch and pass row holds through the production dispatcher",
  () => {
    expect(verifyPolicyProofs([gate])).toEqual([]);
  },
  CONFORMANCE_TIMEOUT_MS,
);
