// ARM B of the META-gate accused the ORDINARY HALF OF A SPLIT FAMILY (#2093). When a family splits by
// AUTHORITY — an ordinary policy plus a hard `-health` sibling carrying the identical `family` — the
// exemption TABLE stays in the ordinary half and the LIVENESS arm moves to the sibling, which imports the
// very symbol. `hasStaleArm` is per-SOURCE-FILE, so the ordinary half read as one-sided and was accused of
// a promise its family keeps one file over.
//
// Measured over all 300 corpus modules on 2026-09-12, before the fix: arm B accused FOUR, and three were
// exactly this shape — their `-health` siblings import the collection AND carry the stale arm. The fourth
// (`vector-scope-derived`'s `IMPORT_SANCTIONED`) is NOT exported, so nothing can reach it and it is a REAL
// finding this door deliberately leaves standing. Those names are the measurement and live in this comment
// only: a count or a name list in an assertion is a perishable ledger, which is the failure this program
// has already paid for twice.
//
// The door is the IMPORT, never the `family` string — a shared family name would excuse ANY table in the
// family, while an import of THIS collection by a stale-armed module is evidence about THIS collection.
// Both directions are pinned below, because a door that excuses too much is the same disease as the
// accusation it replaced.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { SourceFile } from "ts-morph";
import { Project } from "ts-morph";
import { coveringSibling, exemptionCollections, gate, hasStaleArm } from "../../../../tooling/src/verify/gates/gate-modernization.ts";
import { verifyGateProofs } from "../../../../tooling/src/verify/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const GATES_REL = "tooling/src/verify/gates";
const ORDINARY = `${GATES_REL}/probe-ordinary.ts`;
const HEALTH = `${GATES_REL}/probe-ordinary-health.ts`;
const STALE_ARM = 'const MSG = "ALLOWLIST row matching no live site (ratchet down) — delete the stale row";\n';
const TABLE = 'export const ALLOWLIST = { "packages/x/src/a.ts": "sanctioned" };\n';

function corpusOf(modules: Readonly<Record<string, string>>): Map<string, SourceFile> {
  const project = new Project({ useInMemoryFileSystem: true });
  return new Map(Object.entries(modules).map(([rel, source]) => [rel, project.createSourceFile(`/${rel}`, source)] as const));
}

/** Arm B's verdict for one module, composed from the gate's own exported predicates. */
function accusedCollections(rel: string, corpus: ReadonlyMap<string, SourceFile>): readonly string[] {
  const sf = corpus.get(rel) as SourceFile;
  return hasStaleArm(sf)
    ? []
    : exemptionCollections(sf)
        .filter((collection) => coveringSibling(collection, rel, corpus) === undefined)
        .map((collection) => collection.name);
}

test("a collection whose stale arm lives in an IMPORTING sibling is two-sided as a family, and every near-miss still reds", () => {
  // RED-FIRST: pre-fix this returned ["ALLOWLIST"] — the ordinary half accused of the family's promise.
  const split = corpusOf({ [ORDINARY]: TABLE, [HEALTH]: `import { ALLOWLIST } from "./probe-ordinary.ts";\n${STALE_ARM}export const seen = ALLOWLIST;\n` });
  expect(accusedCollections(ORDINARY, split)).toEqual([]);

  // A stale-armed sibling that imports something ELSE from the same module covers nothing.
  const wrongSymbol = corpusOf({
    [ORDINARY]: `${TABLE}export const OTHER = 1;\n`,
    [HEALTH]: `import { OTHER } from "./probe-ordinary.ts";\n${STALE_ARM}export const seen = OTHER;\n`,
  });
  expect(accusedCollections(ORDINARY, wrongSymbol)).toEqual(["ALLOWLIST"]);

  // A sibling that imports the collection but carries NO stale arm covers nothing — the import is the
  // reach, the stale arm is the promise, and the door needs both.
  const noArm = corpusOf({ [ORDINARY]: TABLE, [HEALTH]: 'import { ALLOWLIST } from "./probe-ordinary.ts";\nexport const seen = ALLOWLIST;\n' });
  expect(accusedCollections(ORDINARY, noArm)).toEqual(["ALLOWLIST"]);

  // An UNEXPORTED table can be reached by nobody, so no sibling can ever excuse it.
  const unexported = corpusOf({
    [ORDINARY]: 'const ALLOWLIST = { "packages/x/src/a.ts": "sanctioned" };\nexport const used = ALLOWLIST;\n',
    [HEALTH]: `import { used } from "./probe-ordinary.ts";\n${STALE_ARM}export const seen = used;\n`,
  });
  expect(accusedCollections(ORDINARY, unexported)).toEqual(["ALLOWLIST"]);

  // Per COLLECTION, not per module: a covered table beside an uncovered one still reds for the uncovered.
  const mixed = corpusOf({
    [ORDINARY]: `${TABLE}export const WAIVED = { "packages/x/src/b.ts": "also sanctioned" };\n`,
    [HEALTH]: `import { ALLOWLIST } from "./probe-ordinary.ts";\n${STALE_ARM}export const seen = ALLOWLIST;\n`,
  });
  expect(accusedCollections(ORDINARY, mixed)).toEqual(["WAIVED"]);
});

// THE AFFORDANCE-LEVEL PROOF, and the one that is red-first against the unfixed gate: the two new proof
// ROWS are data, so they compile against the old module, and the split-family mustPass row reds there.
// `gate-conformance.repo.int.test.ts` is the orchestrator's and is `--full`-only, which is exactly how
// this class stayed invisible; driving this gate's own rows here puts the verdict on a tier a lane runs.
test("the gate's OWN proof rows hold, including the split-family pair", () => {
  expect(verifyGateProofs([gate])).toEqual([]);
});

// A LOAD-HONEST BUDGET, and this suite earned the lesson on itself: it parses all ~300 corpus modules with
// ts-morph, took 5.8s alone and TIMED OUT at vitest's 5s default the first time it ran beside three sibling
// files. A test that reds on LOAD rather than on a defect is the same lie as one that passes on a defect —
// it just points the other way. The base is ~4x the quiet measurement, scaled by the shared-host profile.
const CORPUS_WALK_BUDGET = scaledBudget(60_000);

test("the split-family door is ENGAGED on the real corpus, not just on fixtures", { timeout: CORPUS_WALK_BUDGET }, ({ repoRoot }) => {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const dir = join(repoRoot, GATES_REL);
  const corpus = new Map(
    readdirSync(dir)
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".d.ts"))
      .map((name) => [`${GATES_REL}/${name}`, project.addSourceFileAtPath(join(dir, name))] as const),
  );
  // The anti-vacuum floor: a corpus that failed to load has zero collections, and every claim below would
  // then be vacuously true. 300 modules on the measuring day; the floor sits far under it so a real
  // conversion wave cannot trip it.
  expect(corpus.size, "the gate corpus did not load — the reader, not the tree, is the finding").toBeGreaterThan(200);

  const covered = [...corpus].flatMap(([rel, sf]) =>
    hasStaleArm(sf)
      ? []
      : exemptionCollections(sf)
          .filter((c) => coveringSibling(c, rel, corpus) !== undefined)
          .map((c) => `${rel}:${c.name}`),
  );
  // Pre-fix this was ZERO by construction — there was no door. A real family whose liveness arm sits in an
  // importing `-health` sibling must exist here, or the door is dead code that a fixture keeps alive.
  expect(covered.length, "no real split family exercises the door — it is fixture-only").toBeGreaterThan(0);
  const accused = new Set([...corpus.keys()].flatMap((rel) => accusedCollections(rel, corpus).map((name) => `${rel}:${name}`)));
  expect(covered.filter((entry) => accused.has(entry))).toEqual([]);
});
