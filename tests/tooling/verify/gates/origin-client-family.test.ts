// Conformance entry for the twelve client-side policies whose only missing primitive was canonical
// symbol/member origin. Every proof runs through the production dispatcher on an isolated population.
import { gate as fetchFnInFeatures } from "../../../../tooling/src/verify/gates/fetch-fn-in-features.ts";
import { gate as noContextProvider } from "../../../../tooling/src/verify/gates/no-context-provider.ts";
import { gate as noContextReturntype } from "../../../../tooling/src/verify/gates/no-context-returntype.ts";
import { gate as noForwardRef } from "../../../../tooling/src/verify/gates/no-forward-ref.ts";
import { gate as noManualTokenEstimate } from "../../../../tooling/src/verify/gates/no-manual-token-estimate.ts";
import { gate as noUseContext } from "../../../../tooling/src/verify/gates/no-use-context.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("the canonical-origin client policies keep their founding, respelling and nearest-legal fixtures", () => {
  expect(verifyPolicyProofs([fetchFnInFeatures, noContextProvider, noContextReturntype, noForwardRef, noManualTokenEstimate, noUseContext])).toEqual([]);
}, 180_000);
