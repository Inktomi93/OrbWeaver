// Import the registered policy so the declared proof corpus exercises the production dispatcher.
import { gate } from "../../../../tooling/src/verify/gates/trpc-output-declarations.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("mounted output declarations distinguish parsed, literal, void and unreadable procedures", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});
