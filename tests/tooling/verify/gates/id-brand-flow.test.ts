import { expect, test } from "vitest";
import { gate as brandInNamePosition } from "../../../../tooling/src/verify/gates/brand-in-name-position.ts";
import { gate as noFakeDisabledId } from "../../../../tooling/src/verify/gates/no-fake-disabled-id.ts";
import { gate as noLooseIdCast } from "../../../../tooling/src/verify/gates/no-loose-id-cast.ts";
import { gate as noMintViaCast } from "../../../../tooling/src/verify/gates/no-mint-via-cast.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

test("canonical id brands flow through signature positions and the central waiver plane", () => {
  expect(verifyPolicyProofs([brandInNamePosition, noFakeDisabledId, noLooseIdCast, noMintViaCast])).toEqual([]);
});
