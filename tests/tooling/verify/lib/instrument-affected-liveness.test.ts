// The affected liveness-roster protocol: absence preserves the complete suite, while a proved policy list
// selects only matching arms. These are the old-source red controls for the performance repair: without
// the selector the unrelated arm remains in the expensive shared pass, and without the absent-value arm
// direct/full runs accidentally inherit the optimization.
import {
  decodeInstrumentAffectedPolicyIds,
  encodeInstrumentAffectedPolicyIds,
  includeInstrumentAffectedControlPolicies,
  instrumentAffectedIncludes,
  selectedInstrumentAffectedPolicyIds,
  selectInstrumentAffectedArms,
} from "../../../../tooling/src/verify/lib/instrument-affected-liveness.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ARMS = [{ policy: { id: "affected" } }, { policy: { id: "unrelated" } }] as const;

test("a proved affected policy executes while an unrelated policy is omitted", () => {
  const encoded = encodeInstrumentAffectedPolicyIds(["affected"]);
  expect(selectInstrumentAffectedArms(ARMS, decodeInstrumentAffectedPolicyIds(encoded))).toEqual([ARMS[0]]);
});

test("an absent affected-stage protocol keeps the complete roster", () => {
  expect(selectInstrumentAffectedArms(ARMS, decodeInstrumentAffectedPolicyIds(undefined))).toEqual(ARMS);
});

test("a narrowed runner control executes for its selected policy and skips for an unrelated policy", () => {
  const selected = decodeInstrumentAffectedPolicyIds(encodeInstrumentAffectedPolicyIds(["zod-output-twin-parity"]));
  expect(instrumentAffectedIncludes(selected, ["zod-output-twin-parity"])).toBe(true);
  expect(instrumentAffectedIncludes(selected, ["css-var-defined-health"])).toBe(false);
  expect(instrumentAffectedIncludes(undefined, ["css-var-defined-health"]), "full runs retain every runner control").toBe(true);
});

test("a grouped closeout control executes only its selected member", () => {
  const selected = decodeInstrumentAffectedPolicyIds(encodeInstrumentAffectedPolicyIds(["css-var-defined-health"]));
  expect(
    selectedInstrumentAffectedPolicyIds(selected, ["css-var-defined-health", "open-json-column-key-parity-health", "no-manual-memo-compiler-health"]),
  ).toEqual(["css-var-defined-health"]);
});

test("a coupled control adds only the selected policy's companion group", () => {
  const selected = decodeInstrumentAffectedPolicyIds(encodeInstrumentAffectedPolicyIds(["query-boundary-reservation-health"]));
  const expanded = includeInstrumentAffectedControlPolicies(selected, [
    ["query-boundary-reservation-health", "query-boundary-reservation"],
    ["chrome-registry-completeness", "testid-typed-only"],
  ]);
  expect(expanded === undefined ? [] : [...expanded].toSorted()).toEqual(["query-boundary-reservation", "query-boundary-reservation-health"]);
});

test.for(["[]", "{}", '[""]', '["affected", 1]'])("malformed or empty policy scope refuses: %s", (value) => {
  expect(() => decodeInstrumentAffectedPolicyIds(value)).toThrow("must be a non-empty JSON array of policy IDs");
});
