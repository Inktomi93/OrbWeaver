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
import { Project } from "ts-morph";
import { gate as policySoundness } from "../../../../tooling/src/verify/gates/policy-soundness.ts";
import { loadMixedGateCorpus } from "../../../../tooling/src/verify/lib/loader.ts";
import { loadPolicyCorpus } from "../../../../tooling/src/verify/lib/policy-loader.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { runNewGate } from "../../../../tooling/src/verify/ops/new-gate.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

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
  expect(emitted).toContain("module + declaration");
  expect(emitted).toContain("// POPULATION:");
  expect(emitted).toContain("// RETIRED MARKERS:");
  expect(emitted).not.toContain("Header budget is 5 lines");
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

test("the final-only loader rejects an actual legacy descriptor accepted by the mixed loader", async ({ scratch }) => {
  mkdirSync(join(scratch, GATES_REL), { recursive: true });
  writeFileSync(
    join(scratch, GATES_REL, `${NAME}.ts`),
    `export const gate = { name: "${NAME}", docRow: "legacy", status: "active", scopeSafety: "incremental-safe", message: "legacy", run: () => undefined, mustFlag: [{ files: {}, why: "legacy catch" }], mustPass: [{ files: {}, why: "legacy pass" }] };`,
  );
  const mixed = await loadMixedGateCorpus(scratch);
  expect(mixed.roster).toEqual([{ path: `${GATES_REL}/${NAME}.ts`, contract: "legacy", id: NAME }]);
  await expect(loadPolicyCorpus(scratch)).rejects.toThrow("must export exactly one `gate` created by defineGate");
});

test("the emitted final module passes production policy-soundness and its planted legacy-field control fails", ({ repoRoot, scratch }) => {
  const emitted = scaffold(scratch);
  const project = new Project({ useInMemoryFileSystem: true });
  const contractPath = "tooling/src/verify/contract/policy.ts";
  const contract = project.createSourceFile(join(scratch, contractPath), readFileSync(join(repoRoot, contractPath), "utf8"));
  const source = project.createSourceFile(join(scratch, GATES_REL, `${NAME}.ts`), emitted);
  expect(source.getImportDeclarationOrThrow("../contract/policy.ts").getModuleSpecifierSourceFile()).toBe(contract);
  const drive = (): ReturnType<typeof runPolicyPass> => {
    const result = runPolicyPass({
      knownPolicies: [policySoundness],
      policies: [policySoundness],
      root: scratch,
      project,
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    expect(result.authority.toolErrors).toEqual([]);
    expect(result.authority.authorityAlarms).toEqual([]);
    expect(result.policies.map(({ owner }) => owner)).toEqual([{ status: "success", population: "complete" }]);
    return result;
  };
  expect(drive().authority.effectiveFindings).toEqual([]);
  source.replaceWithText(emitted.replace("create: (ctx)", "run: () => undefined,\n  create: (ctx)"));
  const broken = drive();
  expect(broken.authority.effectiveFindings).toHaveLength(1);
  expect(broken.authority.effectiveFindings[0]?.message).toContain("run");
});

test("scaffold output and CLI help route to the final policy guide", { timeout: scaledBudget(30_000) }, async ({ scratch, runCli }) => {
  mkdirSync(join(scratch, GATES_REL), { recursive: true });
  const created = await runCli("verify", ["new-gate", NAME], { cwd: scratch });
  const help = await runCli("verify", ["new-gate", "--help"]);
  await expect(created).toExitWith(0);
  await expect(help).toExitWith(0);
  expect(created.stdout).toContain("GATE-AUTHORING.md` is the final policy guide");
  expect(created.stdout).toContain("gate-authoring-legacy-2026-09-13.md");
  expect(created.stdout).not.toContain("bump the");
  expect(help.stdout).toContain("final defineGate policy");
});
