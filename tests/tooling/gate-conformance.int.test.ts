// The standing conformance net (TSMORPH-SINGLE-PASS-AUDIT.md §1.6): every contract-form gate's
// mustFlag/mustPass examples are run through the SAME dispatcher over in-memory example projects. A
// gate whose predicate rots (a refactor that makes it match nothing) goes RED here the same day — the
// break-RED-restore ritual made permanent and always-run. A conformance failure means the CHECKER is
// wrong, so `verifyGateProofs` returning any failure fails this test loudly.
//
// During the migration this covers only the ported gates (currently `no-off-token-radius-shadow`); each
// future port adds its proofs to its descriptor and this net verifies them with no per-gate test file.
import { join } from "node:path";
import { verifyGateProofs } from "../../scripts/check/conformance.ts";
import { loadGates } from "../../scripts/check/loader.ts";
import { expect, test } from "../support/fixtures.ts";

const ROOT = join(import.meta.dirname, "..", "..");

test("the loader discovers at least the ported worked-example gate", async () => {
  const gates = await loadGates(ROOT);
  const names = gates.map((g) => g.name);
  expect(names).toContain("no-off-token-radius-shadow");
});

test("every contract-form gate's mustFlag/mustPass proofs hold (standing bite-proof)", async () => {
  const gates = await loadGates(ROOT);
  const failures = verifyGateProofs(gates);
  // A non-empty failure list is the checker telling you a gate stopped biting (or started over-biting).
  expect(failures).toEqual([]);
});
