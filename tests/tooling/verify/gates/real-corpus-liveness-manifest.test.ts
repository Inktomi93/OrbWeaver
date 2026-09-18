// Family test for `real-corpus-liveness-manifest` — the §6.3 liveness-pin enforcement manifest (#2149).
// A declared SINGLETON: its subject is the cross-reference between the gate roster and the
// RealCorpusLivenessArm vocabulary in family tests, which no existing shared reader serves.
//
// WHAT ONLY THIS FILE CAN PROVE. `verifyPolicyProofs` runs the module's declared rows, which the static
// conformance stage already does. This file carries the production-dispatched lane-scoped door onto the
// same runner, and the self-test: the policy is INSIDE its own population, so it MUST see itself in the
// roster — if its own recognizer fails to recognise itself, the roster is silently short.
import { gate } from "../../../../tooling/src/verify/gates/real-corpus-liveness-manifest.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("the policy's own declared proofs hold through the production dispatcher", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("the descriptor shape is the thing under test: hard, warning, entire-population, singleton family", () => {
  expect([gate.id, gate.family, gate.authority, gate.severity, gate.execution]).toEqual([
    "real-corpus-liveness-manifest",
    "real-corpus-liveness-manifest",
    "hard",
    "warning",
    "entire-population",
  ]);
});

test("workItem is a positive number tracking the liveness coverage debt", () => {
  expect(gate.workItem).toBeGreaterThan(0);
});
