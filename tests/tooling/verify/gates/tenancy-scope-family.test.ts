import { gate as ownerScopedReads } from "../../../../tooling/src/verify/gates/owner-scoped-reads.ts";
import { gate as ownerScopedUpserts } from "../../../../tooling/src/verify/gates/owner-scoped-upserts.ts";
import { gate as ownerScopedWrites } from "../../../../tooling/src/verify/gates/owner-scoped-writes.ts";
import { gate as tableScopingClass } from "../../../../tooling/src/verify/gates/table-scoping-class.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("the tenancy-scope family (the schema classification plus its three by-id tenancy checks) self-proves", () => {
  expect(verifyPolicyProofs([tableScopingClass, ownerScopedReads, ownerScopedWrites, ownerScopedUpserts])).toEqual([]);
});
