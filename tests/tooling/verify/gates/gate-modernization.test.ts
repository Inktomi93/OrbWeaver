// `gate-modernization`'s FAMILY TEST — the mirror of `tooling/src/verify/gates/gate-modernization.ts`,
// and the file any future arm's pins belong in.
//
// IT WAS NAMED `gate-modernization-arm-b.test.ts` AND THAT WAS A LIVE GATE VIOLATION (#2174). The
// `test-layout` policy reds "mirror miss — no source for …/gate-modernization-arm-b.ts", because the
// mirror rule is a MECHANICAL transformation from a source module to its tests and an arm is not a
// module. It moved the whole-tree count 51 → 52, and it stayed invisible for a day because the standing
// `check:structure` red hides a new one — it surfaced only from a per-policy diff between two named
// slots. The name is now the module's, so there is no arm-named suite left to copy: a second arm's pins
// go HERE rather than into a second file.
//
// ARM B of the META-gate accused the ORDINARY HALF OF A SPLIT FAMILY (#2093). When a family splits by
// AUTHORITY — an ordinary policy plus a hard `-health` sibling carrying the identical `family` — the
// exemption TABLE stays in the ordinary half and the LIVENESS arm moves to the sibling, which imports the
// very symbol. `hasStaleArm` is per-SOURCE-FILE, so the ordinary half read as one-sided and was accused of
// a promise its family keeps one file over.
//
// The real-corpus pin rejects one-sided exemption collections. Architectural role roots define an
// arm's subjects; they are not expiring debt rows. The vector policy's import roles are pinned in its
// own proofs, alongside the independent write and cosine restrictions.
//
// The door is the IMPORT, never the `family` string — a shared family name would excuse ANY table in the
// family, while an import of THIS collection by a stale-armed module is evidence about THIS collection.
// Both directions are pinned below, because a door that excuses too much is the same disease as the
// accusation it replaced.
//
// #2168 added the THIRD direction: the import alone did not require the sibling's stale arm to be ABOUT
// the collection it imports, so a module holding two tables and one unrelated diagnostic excused both.
// The row prescribed a join on the collection IDENTIFIER and the corpus REFUTES it — measured here on
// 2026-09-12, all three real excusers name their subject in PROSE ("stale SANCTIONED-HOME row") and none
// by identifier, so that join reports zero covered pairs and false-accuses every one of them. What all
// three do carry is the DECLARING MODULE's name, because a stale-arm diagnostic tells its reader which
// file holds the row. The corpus arm below is what catches that class: a fixture-only pin would have
// shipped the identifier join green.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { SourceFile } from "ts-morph";
import { Project } from "ts-morph";
import { exemptionCollections, gate, hasStaleArm } from "../../../../tooling/src/verify/gates/gate-modernization.ts";
import { projectCtx } from "../../../../tooling/src/verify/index.ts";
import { readGateModernizationModule } from "../../../../tooling/src/verify/lib/gate-modernization-fact.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { verifyMetaGateConversion } from "../../../support/meta-gate-differential.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const GATES_REL = "tooling/src/verify/gates";
const ORDINARY = `${GATES_REL}/probe-ordinary.ts`;
const HEALTH = `${GATES_REL}/probe-ordinary-health.ts`;
const STALE_ARM = 'const MSG = "ALLOWLIST row matching no live site (ratchet down) — delete the stale row";\n';
const LEGACY_BASE = "30333fd4e";
const LEGACY_PATH = "tooling/src/verify/gates/gate-modernization.ts";
const TABLE = 'export const ALLOWLIST = { "packages/x/src/a.ts": "sanctioned" };\n';

function corpusOf(modules: Readonly<Record<string, string>>): Map<string, SourceFile> {
  const project = new Project({ useInMemoryFileSystem: true });
  return new Map(Object.entries(modules).map(([rel, source]) => [rel, project.createSourceFile(`/${rel}`, source)] as const));
}

/** Arm B's verdict for one module, composed from the gate's own exported predicates. */
function accusedCollections(rel: string, corpus: ReadonlyMap<string, SourceFile>): readonly string[] {
  const sf = corpus.get(rel) as SourceFile;
  return hasStaleArm(readGateModernizationModule(sf)) ? [] : exemptionCollections(sf).map((collection) => collection.name);
}

test("arm B accuses a DECLARED one-sided collection, and a stale arm in the SAME module still acquits", () => {
  // #2219 INVERTED the #2093 carve: the split-family arrangement below used to be EXCUSED here and is now
  // a `mustFlag` row on the gate itself, because #2096 forbade it outright. So the sibling no longer
  // changes the verdict — only the accused module's own stale arm does, which is the two-sided rule arm B
  // has always had.
  const split = corpusOf({ [ORDINARY]: TABLE, [HEALTH]: `import { ALLOWLIST } from "./probe-ordinary.ts";\n${STALE_ARM}export const seen = ALLOWLIST;\n` });
  expect(accusedCollections(ORDINARY, split), "the retired carve must not still be excusing").toEqual(["ALLOWLIST"]);

  // The surviving two-sided door: the stale arm in the module's OWN text acquits its own table.
  const twoSided = corpusOf({ [ORDINARY]: `${STALE_ARM}${TABLE}` });
  expect(accusedCollections(ORDINARY, twoSided)).toEqual([]);

  // An UNEXPORTED table is still a table — reachability was the carve's concern, never the arm's.
  const unexported = corpusOf({ [ORDINARY]: 'const ALLOWLIST = { "packages/x/src/a.ts": "sanctioned" };\nexport const used = ALLOWLIST;\n' });
  expect(accusedCollections(ORDINARY, unexported)).toEqual(["ALLOWLIST"]);

  // Per COLLECTION, not per module: two declared tables are two findings.
  const two = corpusOf({ [ORDINARY]: `${TABLE}export const WAIVED = { "packages/x/src/b.ts": "also sanctioned" };\n` });
  expect(accusedCollections(ORDINARY, two)).toEqual(["ALLOWLIST", "WAIVED"]);
});

// A LOAD-HONEST BUDGET, and this suite earned the lesson TWICE on itself. BOTH tests below walk the whole
// corpus with ts-morph — the second reads all ~300 modules directly, the first re-runs every proof row
// through a policy pass — so the budget is shared. Each timed out at vitest's 5s default in turn: the
// corpus walk when it first ran beside three sibling files, the proof driver the moment one more row
// landed. A test that reds on LOAD rather than on a defect is the same lie as one that passes on a defect
// — it just points the other way. The base is ~4x the quiet measurement, scaled by the shared-host profile.
const CORPUS_WALK_BUDGET = scaledBudget(60_000);

// THE AFFORDANCE-LEVEL PROOF, and the one that is red-first against the unfixed gate: the three proof
// ROWS are data, so they compile against the old module, and the split-family mustPass row reds there.
// `gate-conformance.repo.int.test.ts` is the orchestrator's and is `--full`-only, which is exactly how
// this class stayed invisible; driving this gate's own rows here puts the verdict on a tier a lane runs.
test("the gate's OWN proof rows hold, including the split-family pair", { timeout: CORPUS_WALK_BUDGET }, () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

/** Does a DIFFERENT gate module import `name` from `rel`? That pairing is the retired #2093 arrangement
 *  and the shape #2096 forbids, so its absence from the corpus is what the real-corpus pin asserts. */
function importedBySibling(rel: string, name: string, corpus: ReadonlyMap<string, SourceFile>): boolean {
  const selfBase = rel.slice(`${GATES_REL}/`.length).replace(/\.ts$/u, "");
  return [...corpus].some(
    ([siblingRel, sibling]) =>
      siblingRel !== rel &&
      sibling
        .getImportDeclarations()
        .some(
          (d) => d.getModuleSpecifierValue().replace(/^\.\//u, "").replace(/\.ts$/u, "") === selfBase && d.getNamedImports().some((n) => n.getName() === name),
        ),
  );
}

test("the real corpus has no one-sided exemption collections or retired split-family tables", { timeout: CORPUS_WALK_BUDGET }, ({ repoRoot }) => {
  // Keep the split-family invariant and the complete arm-B verdict: a private one-sided table must
  // not disappear from this check merely because no sibling imports it.
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const dir = join(repoRoot, GATES_REL);
  const corpus = new Map(
    readdirSync(dir)
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".d.ts"))
      .map((name) => [`${GATES_REL}/${name}`, project.addSourceFileAtPath(join(dir, name))] as const),
  );
  // The anti-vacuum floor: a corpus that failed to load has zero collections and would pass vacuously.
  expect(corpus.size, "the gate corpus did not load — the reader, not the tree, is the finding").toBeGreaterThan(200);

  const accusations = [...corpus.keys()].flatMap((rel) => accusedCollections(rel, corpus).map((name) => `${rel}:${name}`));
  expect(accusations, "an exemption collection has no reverse-liveness arm").toEqual([]);

  const splitFamily = [...corpus.keys()].flatMap((rel) =>
    accusedCollections(rel, corpus)
      .filter((name) => importedBySibling(rel, name, corpus))
      .map((name) => `${rel}:${name}`),
  );
  expect(splitFamily, "a gate imports an exemption collection from another gate — the shape #2096 forbids and #2219 accuses").toEqual([]);
});

test("the final policy dispatch is clean on the real loader-shaped corpus", { timeout: CORPUS_WALK_BUDGET }, ({ repoRoot }) => {
  const result = runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root: repoRoot,
    project: projectCtx(repoRoot).project,
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.authority.effectiveFindings.filter((finding) => finding.policyId === gate.id)).toEqual([]);
});

test("all 28 flag and 20 pass rows preserve the frozen parent verdict through final dispatch", { timeout: scaledBudget(360_000) }, async ({ scratch }) => {
  expect(
    await verifyMetaGateConversion({
      scratch,
      base: LEGACY_BASE,
      legacyPath: LEGACY_PATH,
      policy: gate,
      expectedRows: { mustFlag: 28, mustPass: 20 },
    }),
  ).toBe(48);
});
