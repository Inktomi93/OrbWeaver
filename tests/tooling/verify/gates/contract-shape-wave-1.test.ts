import { gate as contractDerivesNotRespells } from "../../../../tooling/src/verify/gates/contract-derives-not-respells.ts";
import { gate as contractDerivesNotRespellsHealth } from "../../../../tooling/src/verify/gates/contract-derives-not-respells-health.ts";
import { gate as injectedOpCallerParam } from "../../../../tooling/src/verify/gates/injected-op-caller-param.ts";
import { gate as injectedOpCallerParamHealth } from "../../../../tooling/src/verify/gates/injected-op-caller-param-health.ts";
import { gate as serdeCoreSeal } from "../../../../tooling/src/verify/gates/serde-core-seal.ts";
import { gate as serdeCoreSealHealth } from "../../../../tooling/src/verify/gates/serde-core-seal-health.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

// The first defineGate-only wave of the "bus/contract-shape family" (#1584 gate-runtime-standardization):
// three legacy modules, each split into an ordinary occurrence policy plus a hard, entire-population
// stale-exemption health policy sharing its family. None of the three shared a reader with each other or
// with any sibling gate at conversion time — each is its own two-member family, not a merge candidate.
const FAMILY_TIMEOUT_MS = scaledBudget(120_000);

test(
  "the contract-derives-not-respells family proves ARM A/B occurrence and ALLOWLIST staleness",
  () => {
    expect(verifyPolicyProofs([contractDerivesNotRespells, contractDerivesNotRespellsHealth])).toEqual([]);
  },
  FAMILY_TIMEOUT_MS,
);

test(
  "the serde-core-seal family proves the importer seal and the sanctioned-domain staleness ratchet",
  () => {
    expect(verifyPolicyProofs([serdeCoreSeal, serdeCoreSealHealth])).toEqual([]);
  },
  FAMILY_TIMEOUT_MS,
);

test(
  "the injected-op-caller-param family proves the caller-param occurrence check, CALLER_FREE_OPS staleness, and the entity-id blindness tripwire",
  () => {
    expect(verifyPolicyProofs([injectedOpCallerParam, injectedOpCallerParamHealth])).toEqual([]);
  },
  FAMILY_TIMEOUT_MS,
);
