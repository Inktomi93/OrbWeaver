// THE AFFECTED-INSTRUMENT SELECTION, pinned (#1967) — driven as a PURE function of a changed set, so
// every arm is asserted against the real checkout without a synthetic git repository.
//
// WHAT EACH ARM DEFENDS, because a selection that quietly selects nothing is the exact defect this stage
// was minted from:
//   · THE GATE-ID REACH is the arm that closes the measured failures. `registry-family.test.ts` sat red
//     for five days from a commit that changed a gate module and never touched a family test; the mirror
//     alone cannot find that file, because a family test lives under its WAVE's name.
//   · THE MIRROR is the other half, for an instrument that is not a gate at all.
//   · AN UNCOMPUTABLE branch answer must NOT read as "nothing changed" — the caller runs the whole
//     battery, and this pin asserts the flag that makes it do so.
//   · A PRODUCT-ONLY change selects nothing, which is what keeps the stage cheap enough to sit below
//     `--full` at all.
import { selectAffectedInstrumentTests } from "../../../../tooling/src/verify/ops/instrument-affected.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname.replace(/\/$/u, "");

test("a changed GATE MODULE reaches the family test that names it, wherever that file lives", () => {
  // `integer-line-boxes`'s proofs live in `integer-line-boxes.int.test.ts` — a name the mirror CAN reach —
  // so this row also proves the two reaches agree rather than fighting.
  const selection = selectAffectedInstrumentTests(ROOT, ["tooling/src/verify/gates/integer-line-boxes.ts"]);
  expect(selection.unknown).toBe(false);
  expect(selection.sources).toEqual(["tooling/src/verify/gates/integer-line-boxes.ts"]);
  expect(selection.specs).toContain("tests/tooling/verify/gates/integer-line-boxes.int.test.ts");
});

// THE ARM THE MIRROR CANNOT DO, and the reason the ID search exists. `freeze-provenance-write-pairing`'s
// proofs live in `freeze-provenance-conversion.suite.test.ts`: prefix-swapping the gate's own path yields
// `tests/tooling/verify/gates/freeze-provenance-write-pairing*.ts`, which does not exist.
test("a gate whose family test is named after its WAVE is still reached — the mirror alone misses it", () => {
  const selection = selectAffectedInstrumentTests(ROOT, ["tooling/src/verify/gates/freeze-provenance-write-pairing.ts"]);
  expect(selection.specs).toContain("tests/tooling/verify/gates/freeze-provenance-conversion.suite.test.ts");
  expect(
    selection.specs.some((spec) => spec.includes("freeze-provenance-write-pairing")),
    "the mirror really does find no file of its own name",
  ).toBe(false);
});

test("a non-gate instrument is reached through the shared test mirror", () => {
  const selection = selectAffectedInstrumentTests(ROOT, ["tooling/src/verify/lib/symbol-reference.ts"]);
  expect(selection.specs).toEqual(["tests/tooling/verify/lib/symbol-reference.test.ts"]);
});

test("a PRODUCT-ONLY change selects nothing — the stage stays cheap enough to sit below --full", () => {
  const selection = selectAffectedInstrumentTests(ROOT, ["packages/client/src/lib/message-bubble-class.ts", "docs/law/integer-line-boxes.md"]);
  expect({ sources: selection.sources, specs: selection.specs, unknown: selection.unknown }).toEqual({ sources: [], specs: [], unknown: false });
});

// THE BARE-ZERO ARM. `branchChangedPaths` answers `null` when there is no usable merge base or git failed,
// and `null` must never collapse into the empty set: an uncomputable precondition that reads as "nothing
// changed" is a silent false clean, which is the same class of defect as the gap this stage closes.
test("an UNCOMPUTABLE branch answer is flagged, never read as an empty changed set", () => {
  const selection = selectAffectedInstrumentTests(ROOT, null);
  expect(selection.unknown).toBe(true);
  expect(selection.specs).toEqual([]);
});

test("a DELETED instrument source is dropped — a path that is not there is not a runnable claim", () => {
  const selection = selectAffectedInstrumentTests(ROOT, ["tooling/src/verify/gates/this-policy-was-deleted.ts"]);
  expect(selection.sources).toEqual([]);
});

test("a gates/_proof helper is not a policy, so it takes the mirror reach and not the ID reach", () => {
  const selection = selectAffectedInstrumentTests(ROOT, ["tooling/src/verify/gates/_proof/client-vendors.ts"]);
  // Whatever it reaches, it must not have been read as a policy whose ID is `_proof/client-vendors`.
  expect(selection.specs.every((spec) => !spec.includes("_proof/client-vendors.test"))).toBe(true);
});
