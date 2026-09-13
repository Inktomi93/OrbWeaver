// THE SCAFFOLD IS A TEACHING SURFACE, and until 2026-09-12 it taught the RETIRED contract (#2102). Every
// gate minted by `pnpm gate:new` was born with an `ExemptionTable`, a `scanRoot` predicate and
// `visit`/`finalize` hooks — a private exemption table that §12.5 bans in a final policy outright — plus a
// ritual pointing at `GATE-AUTHORING.md` and a `check-gates.repo.int.test.ts` fixture. A generator that
// emits a banned shape does not merely fail once: it manufactures the violation, signed by the repo's own
// tool, for every gate anybody scaffolds.
//
// A string check alone would be a weak pin — "the word ExemptionTable is absent" says nothing about
// whether the emitted module is a VALID policy. So the load-bearing arm LOADS what the scaffold wrote,
// through the REAL `defineGate` (by absolute file URL, so the brand WeakSet is the production one — a
// copied contract would refuse every fixture as unbranded), and runs the emitted proof rows through the
// REAL conformance driver. Both directions: the legacy vocabulary is gone, AND what replaced it is a
// policy the contract accepts and whose own rows pass on arrival.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadPolicyCorpus } from "../../../../tooling/src/verify/lib/policy-loader.ts";
import { runNewGate } from "../../../../tooling/src/verify/ops/new-gate.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const GATES_REL = "tooling/src/verify/gates";
const NAME = "probe-scaffolded-gate";
/** Historical #2102 regression sentinels; the loader below owns complete contract validation. */
const RETIRED_VOCABULARY = ["ExemptionTable", "GateDescriptor", "scanRoot", "scopeSafety", "docRow", "finalize", "fileLoaded", "REAL_TREE_ANCHOR"] as const;

function scaffold(scratch: string): string {
  mkdirSync(join(scratch, GATES_REL), { recursive: true });
  expect(runNewGate(scratch, [NAME])).toBe(0);
  return readFileSync(join(scratch, GATES_REL, `${NAME}.ts`), "utf8");
}

test("the scaffold emits no retired-contract vocabulary", ({ scratch }) => {
  const emitted = scaffold(scratch);
  // RED-FIRST: the pre-2026-09-12 template contained every one of these.
  expect(RETIRED_VOCABULARY.filter((spelling) => emitted.includes(spelling))).toEqual([]);
  expect(emitted).toContain("defineGate");
  expect(emitted).toContain(`id: "${NAME}"`);
  // A positive control on the reader itself: the same filter over the legacy shape names it, so an empty
  // result above is a measurement and not a search that silently matched nothing.
  expect(
    RETIRED_VOCABULARY.filter((spelling) =>
      "const ALLOWLIST: ExemptionTable = {};\nconst gate: GateDescriptor = { scanRoot, scopeSafety, docRow, finalize, fileLoaded, REAL_TREE_ANCHOR };".includes(
        spelling,
      ),
    ),
  ).toEqual([...RETIRED_VOCABULARY]);
});

test("what the scaffold emits LOADS as a final policy and its own proof rows pass on arrival", async ({ repoRoot, scratch }) => {
  const emitted = scaffold(scratch);
  // The emitted module imports its contract relatively, which only resolves inside the real gates
  // directory; pointing that ONE specifier at the real file is what lets this run outside the corpus,
  // and it is the production module, so the brand is the production brand.
  const contract = pathToFileURL(join(repoRoot, "tooling/src/verify/contract/policy.ts")).href;
  const loadable = join(scratch, GATES_REL, `${NAME}.ts`);
  writeFileSync(loadable, emitted.replace('from "../contract/policy.ts"', `from ${JSON.stringify(contract)}`));

  const corpus = await loadPolicyCorpus(scratch);
  expect(corpus.files).toEqual([`${GATES_REL}/${NAME}.ts`]);
  expect(corpus.gates.map((gate) => gate.id)).toEqual([NAME]);
  // The scaffold is GREEN ON ARRIVAL: its placeholder predicate bites its own mustFlag fixture and leaves
  // its mustPass fixture alone, so `pnpm check:policy-conformance` stays a verdict about the author's work
  // rather than about the template's stub.
  expect(verifyPolicyProofs(corpus.gates)).toEqual([]);
});
