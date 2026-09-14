// Final gate-ignore residue policy: dispatcher-owned historical grammar and the complete frozen Phase-F differential.
import { Project } from "ts-morph";
import { gate as gateIgnoreInventory } from "../../../../tooling/src/verify/gates/gate-ignore-inventory.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyGateProofs } from "../../../../tooling/src/verify/ops/conformance.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import type { TmpdirScenario } from "../../../support/legacy-differential.ts";
import { createTmpdirDifferential, frozenFilesystemLegacyGate, label, legacyScenarios } from "../../../support/legacy-differential.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/gate-ignore-inventory-family";
const LEGACY_BASE = "d0d67c8ca";
const LEGACY_PATH = "tooling/src/verify/gates/gate-ignore-inventory.ts";
const FALLBACK = "tooling/src/verify/gates/__fallback.ts";
const FINAL_IGNORE_HEAD = "a retired `@orb-gate-ignore` marker remains in";

function legacyIgnore(file: string, line: number, token: string, message: string): string {
  return `legacy | ${file}:${String(line)} | ${token} | ${message}`;
}

function finalIgnore(file: string, line: number, token: string): string {
  return `gate-ignore-inventory | ${file}:${String(line)} | ${token} | ${FINAL_IGNORE_HEAD}`;
}

const IGNORE_SCENARIOS: readonly TmpdirScenario[] = [
  {
    why: "mustFlag[0] marker naming an unregistered gate",
    classification: "split",
    legacy: [legacyIgnore("packages/ui/src/x/x.ts", 1, "no-such-gate", "`// @orb-gate-ignore <name>` names a gate that")],
    legacyPopulation: 2,
    legacySubjects: [],
    final: [finalIgnore("packages/ui/src/x/x.ts", 1, "no-such-gate")],
    finalPopulation: 2,
    finalSubjects: [],
    successor: "packages/ui/src/x/x.ts:1 | no-such-gate",
  },
  {
    why: "mustFlag[1] marker with unusual whitespace and an unregistered gate",
    classification: "split",
    legacy: [legacyIgnore("packages/server/src/domain/x/x.ts", 1, "no-such-gate-2", "`// @orb-gate-ignore <name>` names a gate that")],
    legacyPopulation: 2,
    legacySubjects: [],
    final: [finalIgnore("packages/server/src/domain/x/x.ts", 1, "no-such-gate-2")],
    finalPopulation: 2,
    finalSubjects: [],
    successor: "packages/server/src/domain/x/x.ts:1 | no-such-gate-2",
  },
  {
    why: "mustFlag[2] bare marker",
    classification: "split",
    legacy: [legacyIgnore("packages/ui/src/x/x.ts", 1, "real-gate", "MALFORMED `@orb-gate-ignore` marker — no `: <r")],
    legacyPopulation: 2,
    legacySubjects: [],
    final: [finalIgnore("packages/ui/src/x/x.ts", 1, "real-gate")],
    finalPopulation: 2,
    finalSubjects: [],
    successor: "packages/ui/src/x/x.ts:1 | real-gate",
  },
  {
    why: "mustFlag[3] empty marker position",
    classification: "split",
    legacy: [legacyIgnore("packages/ui/src/x/x.ts", 1, "real-gate", "MALFORMED `@orb-gate-ignore` marker — no `: <r")],
    legacyPopulation: 2,
    legacySubjects: [],
    final: [finalIgnore("packages/ui/src/x/x.ts", 1, "real-gate")],
    finalPopulation: 2,
    finalSubjects: [],
    successor: "packages/ui/src/x/x.ts:1 | real-gate",
  },
  {
    why: "mustFlag[4] unconsumed registered marker",
    classification: "split",
    legacy: [legacyIgnore("packages/ui/src/x/x.ts", 1, "real-gate", "STALE `@orb-gate-ignore` marker — it suppresse")],
    legacyPopulation: 3,
    legacySubjects: [],
    final: [finalIgnore("packages/ui/src/x/x.ts", 1, "real-gate")],
    finalPopulation: 3,
    finalSubjects: [],
    successor: "packages/ui/src/x/x.ts:1 | real-gate",
  },
  {
    why: "mustFlag[5] legacy registered-gate discovery blindness",
    classification: "retired-arm",
    legacy: [legacyIgnore("tooling/src/verify/gates/gate-ignore-inventory.ts", 0, "-", "blindness tripwire: no gate names could be der")],
    legacyPopulation: 2,
    legacySubjects: [],
    final: [],
    finalPopulation: 2,
    finalSubjects: [],
    successor: null,
    retiredWhy: "the final residue policy does not discover gate names or consume per-gate suppressions; every real legacy marker is forbidden",
  },
  {
    why: "mustFlag[6] marker naming a dormant gate",
    classification: "split",
    legacy: [legacyIgnore("packages/ui/src/x/x.ts", 1, "dormant-gate", "STALE `@orb-gate-ignore` marker — it suppresse")],
    legacyPopulation: 3,
    legacySubjects: [],
    final: [finalIgnore("packages/ui/src/x/x.ts", 1, "dormant-gate")],
    finalPopulation: 3,
    finalSubjects: [],
    successor: "packages/ui/src/x/x.ts:1 | dormant-gate",
  },
  {
    why: "mustFlag[7] bare marker in the gate corpus",
    classification: "split",
    legacy: [legacyIgnore("tooling/src/verify/gates/real-gate.ts", 1, "real-gate", "MALFORMED `@orb-gate-ignore` marker — no `: <r")],
    legacyPopulation: 2,
    legacySubjects: [],
    final: [finalIgnore("tooling/src/verify/gates/real-gate.ts", 1, "real-gate")],
    finalPopulation: 2,
    finalSubjects: [],
    successor: "tooling/src/verify/gates/real-gate.ts:1 | real-gate",
  },
  {
    why: "mustFlag[8] trailing marker",
    classification: "split",
    legacy: [legacyIgnore("packages/ui/src/x/x.ts", 1, "real-gate", "STALE `@orb-gate-ignore` marker — it suppresse")],
    legacyPopulation: 3,
    legacySubjects: [],
    final: [finalIgnore("packages/ui/src/x/x.ts", 1, "real-gate")],
    finalPopulation: 3,
    finalSubjects: [],
    successor: "packages/ui/src/x/x.ts:1 | real-gate",
  },
  {
    why: "mustFlag[9] marker under the wider tooling tree",
    classification: "split",
    legacy: [legacyIgnore("tooling/src/stack/lib/spawn-lock.ts", 1, "real-gate", "STALE `@orb-gate-ignore` marker — it suppresse")],
    legacyPopulation: 3,
    legacySubjects: [],
    final: [finalIgnore("tooling/src/stack/lib/spawn-lock.ts", 1, "real-gate")],
    finalPopulation: 3,
    finalSubjects: [],
    successor: "tooling/src/stack/lib/spawn-lock.ts:1 | real-gate",
  },
  {
    why: "mustPass[0] formerly valid unpositioned marker is now forbidden residue",
    classification: "stronger-reader",
    legacy: [],
    legacyPopulation: 2,
    legacySubjects: [],
    final: [finalIgnore("packages/ui/src/x/x.ts", 1, "real-gate")],
    finalPopulation: 2,
    finalSubjects: [],
    successor: "packages/ui/src/x/x.ts:1 | real-gate",
  },
  {
    why: "mustPass[1] formerly valid positioned marker is now forbidden residue",
    classification: "stronger-reader",
    legacy: [],
    legacyPopulation: 2,
    legacySubjects: [],
    final: [finalIgnore("packages/ui/src/x/x.ts", 1, "real-gate")],
    finalPopulation: 2,
    finalSubjects: [],
    successor: "packages/ui/src/x/x.ts:1 | real-gate",
  },
  {
    why: "mustPass[2] marker naming a gate with a decoy name literal is now forbidden residue",
    classification: "stronger-reader",
    legacy: [],
    legacyPopulation: 2,
    legacySubjects: [],
    final: [finalIgnore("packages/ui/src/x/x.ts", 1, "parallel-map-gate")],
    finalPopulation: 2,
    finalSubjects: [],
    successor: "packages/ui/src/x/x.ts:1 | parallel-map-gate",
  },
  {
    why: "mustPass[3] marker spelling inside a string literal",
    classification: "vacuous-both-zero",
    legacy: [],
    legacyPopulation: 2,
    legacySubjects: [],
    final: [],
    finalPopulation: 2,
    finalSubjects: [],
    successor: null,
  },
  {
    why: "mustPass[4] synthetic unconsumed marker is now forbidden residue",
    classification: "stronger-reader",
    legacy: [],
    legacyPopulation: 2,
    legacySubjects: [],
    final: [finalIgnore("packages/ui/src/x/x.ts", 1, "real-gate")],
    finalPopulation: 2,
    finalSubjects: [],
    successor: "packages/ui/src/x/x.ts:1 | real-gate",
  },
  {
    why: "mustPass[5] inline quoted grammar mention",
    classification: "vacuous-both-zero",
    legacy: [],
    legacyPopulation: 3,
    legacySubjects: [],
    final: [],
    finalPopulation: 3,
    finalSubjects: [],
    successor: null,
  },
  {
    why: "mustPass[6] block-comment quoted grammar mention",
    classification: "vacuous-both-zero",
    legacy: [],
    legacyPopulation: 3,
    legacySubjects: [],
    final: [],
    finalPopulation: 3,
    finalSubjects: [],
    successor: null,
  },
];

function passOf(files: Readonly<Record<string, string>>, requestedPaths?: readonly string[]): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({
    knownPolicies: [gateIgnoreInventory],
    policies: [gateIgnoreInventory],
    root: ROOT,
    project,
    reviewedGrants: [],
    failOnWarnings: false,
    ...(requestedPaths === undefined ? {} : { requestedPaths }),
  });
}

test("every final gate-ignore proof row holds through production dispatch", () => {
  expect(verifyPolicyProofs([gateIgnoreInventory])).toEqual([]);
});

test("a narrowed request defers the entire-population residue owner", () => {
  const result = passOf(
    {
      "packages/ui/src/x/marker.ts": "// @orb-gate-ignore old-gate: retired residue\nexport const marker = 1;\n",
      "packages/ui/src/x/clean.ts": "export const clean = true;\n",
    },
    ["packages/ui/src/x/clean.ts"],
  );
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.policies.map(({ owner }) => owner)).toMatchObject([{ status: "not-applicable", population: "complete" }]);
});

test("the showcase workspace remains inside the retired-marker population", () => {
  const path = "packages/showcase-plugins/src/index.ts";
  const result = passOf({ [path]: "// @orb-gate-ignore old-gate: showcase residue\nexport const plugin = true;\n" });
  expect(result.policies[0]?.population.effectiveSourcePaths).toEqual([path]);
  expect(result.authority.effectiveFindings).toMatchObject([
    {
      file: path,
      line: 1,
      column: 1,
      token: "old-gate",
      message: gateIgnoreInventory.message,
      fix: gateIgnoreInventory.fix,
      policyId: gateIgnoreInventory.id,
    },
  ]);
});

test("the frozen gate-ignore corpus has a classified final successor for every row", async ({ scratch }) => {
  const differential = createTmpdirDifferential((owner, phase, message) => {
    throw new Error(`${owner}/${phase}: ${message}`);
  });
  const legacy = await frozenFilesystemLegacyGate(scratch, LEGACY_BASE, LEGACY_PATH);
  expect(verifyGateProofs([legacy])).toEqual([]);
  expect(differential.runScenarios(legacy, [gateIgnoreInventory], FALLBACK, IGNORE_SCENARIOS)).toBe(17);
});

test("all frozen rows pin complete old/final finding identity and actual source membership", async ({ scratch }) => {
  const differential = createTmpdirDifferential((owner, phase, message) => {
    throw new Error(`${owner}/${phase}: ${message}`);
  });
  const legacy = await frozenFilesystemLegacyGate(scratch, LEGACY_BASE, LEGACY_PATH);
  if (legacy.scanRoot === undefined) {
    throw new Error("the frozen gate-ignore descriptor has no scanRoot");
  }
  const scanRoot = legacy.scanRoot;
  const snapshots = legacyScenarios(legacy, FALLBACK).map((files) => {
    const membership = Object.keys(files)
      .filter((path) => scanRoot(path))
      .toSorted();
    const old = differential.legacyReplay(legacy, files, label);
    const final = differential.finalReplay([gateIgnoreInventory], files, label);
    expect(old.sourcePaths).toEqual(membership);
    expect(final.sourcePaths).toEqual(membership);
    return {
      membership,
      legacy: { findings: old.details, toolErrors: old.toolErrors },
      final: {
        findings: final.details,
        toolErrors: final.toolErrors,
      },
    };
  });
  expect(snapshots).toMatchSnapshot();
});
