// CONVERSION-TIME EVIDENCE for the two `drizzle-schema`-family registry conversions of #1584 —
// `lifecycle-portability` and `domain-freshness-plane` — written to the
// `simple-visitors-wave-2.test.ts` recipe. It is NOT a standing regression gate: it freezes the legacy
// source at one commit and RETIRES once the differential is trusted (design guide §6.4 — "conversion
// evidence for the landing commit, not standing law"). Delete it with the legacy loader.
//
// What it proves, in three assertions:
//   1. the converted policy's own declared rows pass the production proof runtime;
//   2. on the ADAPTED legacy corpus (the original fixture bytes plus the `drizzle-orm/sqlite-core` import
//      the stronger reader requires), the final policy and the frozen legacy descriptor name the SAME
//      subjects — one classified difference, the ANCHOR, is asserted rather than waved at;
//   3. the STRENGTHENING is real: on the ORIGINAL bytes, where `sqliteTable` resolves to nothing, the
//      legacy regex still "reads" a schema and reports, while the final policy REFUSES on the shared fact's
//      `empty` status through its own fail-closed `recordReadySchemaFact` (the phase that owns this moved
//      from the provider receipt to the consumer in #1962). Identity, not spelling — and a refusal, never
//      a silent pass.
import { gate as domainFreshnessPlane } from "../../../../tooling/src/verify/gates/domain-freshness-plane.ts";
import { gate as lifecyclePortability } from "../../../../tooling/src/verify/gates/lifecycle-portability.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("the converted registry policies pass their production proof runtime", () => {
  expect(verifyPolicyProofs([lifecyclePortability, domainFreshnessPlane])).toEqual([]);
});
