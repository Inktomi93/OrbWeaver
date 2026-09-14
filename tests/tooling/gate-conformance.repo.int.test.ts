// The standing conformance net (TSMORPH-SINGLE-PASS-AUDIT.md §1.6): every contract-form gate's
// mustFlag/mustPass examples are run through the SAME dispatcher over in-memory example projects. A
// gate whose predicate rots (a refactor that makes it match nothing) goes RED here the same day — the
// break-RED-restore ritual made permanent and always-run. A conformance failure means the CHECKER is
// wrong, so `verifyGateProofs` returning any failure fails this test loudly.
//
// THE DIRECTION INVERTED, AND THE OLD HEADER HERE POINTED THE WRONG WAY (#1974, 2026-09-11). This file
// used to say it "covers only the ported gates (currently `no-off-token-radius-shadow`)" — written when
// `GateDescriptor` contract-form was the NEW thing gates were ported INTO and `loadGates` was the whole
// world. Today `loadGates` returns the LEGACY remnant ALONE (`lib/loader.ts:190` — "the legacy descriptor
// list alone"), 167 modules have converted OUT of it to `defineGate`, and the roster only SHRINKS. Whose
// proofs run where: a FINAL policy's rows run on the static bar via `structure:policy-conformance`
// (`ops/policy-conformance.ts`); this net is the legacy half and covers exactly what is left.
//
// SO NOTHING HERE MAY NAME A GATE: `no-off-token-radius-shadow` converted in `7993f264c` and the liveness
// test below — which named it — had been RED since, unrun because `tests/tooling/**` is `--full`-only
// (#1842). A carrier here is LEGACY BY REQUIREMENT and therefore perishable; the liveness floor is
// re-expressed against the roster's own emptiness instead, which is the one property that does not rot.
// At the #1584 atomic cutover the legacy roster empties, this file's subject ceases to exist, and the
// suite RETIRES with `verifyGateProofs` rather than being re-pointed again.
import { join } from "node:path";
import type { GateDescriptor } from "../../tooling/src/verify/contract/gate.ts";
import { loadGates, verifyGateProofs } from "../../tooling/src/verify/index.ts";
import { expect, test } from "../support/tool-fixtures.ts";
import { scaledBudget } from "./_load-budget.ts";

const ROOT = join(import.meta.dirname, "..", "..");

// LOAD-HONEST BUDGET (#606). `verifyGateProofs` runs the WHOLE gate corpus's mustFlag/mustPass examples
// in-process (~21s solo) — pure CPU, no child process to hang a legible timeout on, so the honest lever here
// is a budget that SCALES with contention rather than a fixed 30s that false-times-out under multi-lane load
// (it timed out twice this way). Solo (factor 1) → 45s, above the ~21s measured runtime, so solo is
// unchanged; a saturated box scales it up so the run finishes instead of dying as an opaque timeout that
// reads like a real conformance red.
const CONFORMANCE_BUDGET = scaledBudget(45_000, 4);

// THE ANTI-VACUUM FLOOR for the bite-proof below, which asserts an EMPTY failure list and therefore passes
// trivially over an empty corpus. It is deliberately expressed as "the legacy roster is not empty", never
// as a named gate (perishable — that is what broke it) and never as a count floor (a countdown wearing a
// gate's clothes — `compared > 1000` in ops/conformance.int.test.ts, #1969). Zero is the ONE terminal
// value, and it must go RED: an empty legacy roster means the cutover landed and this whole file retires.
test("the legacy loader discovers a non-empty descriptor corpus — the bite-proof is otherwise vacuous", async () => {
  const gates = await loadGates(ROOT);
  expect(
    gates.length,
    "`loadGates` returned NO legacy descriptors. Either the loader is broken, or the #1584 atomic cutover landed — in which case `verifyGateProofs` has no subject left and this whole suite retires with it (final policies' proofs run on the static bar via `structure:policy-conformance`).",
  ).toBeGreaterThan(0);
  // Each entry is a real descriptor carrying both proof arms — the bite-proof reads exactly these.
  expect(gates.filter((g) => !(Array.isArray(g.mustFlag) && Array.isArray(g.mustPass))).map((g) => g.name)).toEqual([]);
});

test(
  "every contract-form gate's mustFlag/mustPass proofs hold (standing bite-proof)",
  async () => {
    const gates = await loadGates(ROOT);
    const failures = verifyGateProofs(gates);
    // A non-empty failure list is the checker telling you a gate stopped biting (or started over-biting).
    expect(failures).toEqual([]);
  },
  CONFORMANCE_BUDGET,
);

test("a crashing mustPass proof is a conformance failure, never a clean proof", () => {
  const crashingGate: GateDescriptor = {
    name: "crashing-proof",
    docRow: "test fixture",
    status: "active",
    scopeSafety: "whole-project",
    message: "test fixture",
    run: () => {
      throw new Error("planted checker crash");
    },
    mustFlag: [],
    mustPass: [{ files: "export const legal = true;", why: "a crash cannot prove this legal example" }],
  };

  expect(verifyGateProofs([crashingGate])).toEqual([
    expect.objectContaining({
      gate: "crashing-proof",
      arm: "mustPass",
      detail: expect.stringContaining("planted checker crash"),
    }),
  ]);
});

// The three `evaluate-no-scope-capture` fail-loud pins that lived here MOVED with its #1584 conversion:
// `passFor` drives the LEGACY dispatcher, which cannot run a `defineGate` policy at all. They are now
// `runPolicyPass` pins in `tests/tooling/verify/gates/callback-provenance-family.test.ts` — same three
// claims (an unresolved runtime identifier refuses, the built-in `undefined` does not, a self-contained
// callback is a clean resolved control), asserted against `phase: "evaluate"` rather than `"finalize"`,
// because the final contract has no `finalize` hook.
