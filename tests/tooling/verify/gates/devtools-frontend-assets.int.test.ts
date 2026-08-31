import { gate } from "../../../../tooling/src/verify/gates/devtools-frontend-assets.ts";
import { verifyGateProofs } from "../../../../tooling/src/verify/ops/conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("the DevTools frontend asset contract has red and green filesystem controls", () => {
  expect(verifyGateProofs([gate])).toEqual([]);
});
