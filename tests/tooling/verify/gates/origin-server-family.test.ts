// The canonical-origin server/contract/test-side family (#1584): fourteen legacy gates whose only missing
// primitive was canonical symbol/member origin. Every policy's founding shape, its identity matrix (alias ·
// namespace · re-export · destructure · computed · shadow) and its declared limits run through the SAME
// dispatcher the real command uses.
import { gate as boundedListLimit } from "../../../../tooling/src/verify/gates/bounded-list-limit.ts";
import { gate as byteCheckCast } from "../../../../tooling/src/verify/gates/byte-check-cast.ts";
import { gate as discoveryNoStatsRollups } from "../../../../tooling/src/verify/gates/discovery-no-stats-rollups.ts";
import { gate as membershipEnforcer } from "../../../../tooling/src/verify/gates/membership-enforcer.ts";
import { gate as noAwaitDbInLoop } from "../../../../tooling/src/verify/gates/no-await-db-in-loop.ts";
import { gate as noDirectReportsWrite } from "../../../../tooling/src/verify/gates/no-direct-reports-write.ts";
import { gate as noHandwrittenWireJsonSchema } from "../../../../tooling/src/verify/gates/no-handwritten-wire-json-schema.ts";
import { gate as noHardcodedSideGenSampling } from "../../../../tooling/src/verify/gates/no-hardcoded-side-gen-sampling.ts";
import { gate as persistenceNoInMemoryState } from "../../../../tooling/src/verify/gates/persistence-no-in-memory-state.ts";
import { gate as providersRunnerSeal } from "../../../../tooling/src/verify/gates/providers-runner-seal.ts";
import { gate as testFixtureImports } from "../../../../tooling/src/verify/gates/test-fixture-imports.ts";
import { gate as testMockDoctrine } from "../../../../tooling/src/verify/gates/test-mock-doctrine.ts";
import { gate as turnIdentity } from "../../../../tooling/src/verify/gates/turn-identity.ts";
import { gate as vectorScopeDerived } from "../../../../tooling/src/verify/gates/vector-scope-derived.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const FAMILY_TIMEOUT_MS = 300_000;

test(
  "every canonical-origin policy judges declaration homes, member identity and static values rather than written names",
  () => {
    expect(
      verifyPolicyProofs([
        boundedListLimit,
        byteCheckCast,
        discoveryNoStatsRollups,
        membershipEnforcer,
        noAwaitDbInLoop,
        noDirectReportsWrite,
        noHandwrittenWireJsonSchema,
        noHardcodedSideGenSampling,
        persistenceNoInMemoryState,
        providersRunnerSeal,
        testFixtureImports,
        testMockDoctrine,
        turnIdentity,
        vectorScopeDerived,
      ]),
    ).toEqual([]);
  },
  FAMILY_TIMEOUT_MS,
);
