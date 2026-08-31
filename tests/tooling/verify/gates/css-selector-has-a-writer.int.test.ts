import { gate } from "../../../../tooling/src/verify/gates/css-selector-has-a-writer.ts";
import { verifyGateProofs } from "../../../../tooling/src/verify/ops/conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("css selector writer polar controls hold", () => {
  expect(verifyGateProofs([gate])).toEqual([]);
});
