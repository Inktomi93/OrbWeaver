// Windowed-query occurrence and hard blindness checks retain their proof, authority and refusal cases.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { SourceFile } from "ts-morph";
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as windowedInfiniteQuery } from "../../../../tooling/src/verify/gates/windowed-infinite-query.ts";
import { gate as windowedInfiniteQueryHealth } from "../../../../tooling/src/verify/gates/windowed-infinite-query-health.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { policyProofRows } from "../../../../tooling/src/verify/lib/policy-proof-rows.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

const ROOT = "/client-query-pair-conversion";
const CONFORMANCE_TIMEOUT_MS = scaledBudget(300_000);

const POLICIES: readonly GatePolicy[] = [windowedInfiniteQuery, windowedInfiniteQueryHealth];

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { jsx: 4 } });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function passOf(policy: GatePolicy, files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project: projectOf(files), reviewedGrants: [], failOnWarnings: false });
}

test(
  "the windowed-query policies keep their founding, near-miss, fence and identity fixtures",
  () => {
    expect(verifyPolicyProofs(POLICIES)).toEqual([]);
  },
  CONFORMANCE_TIMEOUT_MS,
);

// ---------------------------------------------------------------------------------------------------
// THE FIXTURE-SPECIFIER RESOLUTION CONTROL (§4.8). A proof row's relative import that resolves to NOTHING
// makes every identity row pass by FAIL-CLOSURE while conformance still reports green. `windowed-infinite-
// query` has a row whose whole claim is that an options const is read THROUGH an import door, so a dangling
// specifier there would silently retire the conversion's one deliberate catch widening.
// ---------------------------------------------------------------------------------------------------
function danglingSpecifiers(files: readonly SourceFile[]): readonly string[] {
  return files
    .flatMap((sourceFile) => sourceFile.getImportDeclarations())
    .filter((declaration) => declaration.getModuleSpecifierValue().startsWith(".") && declaration.getModuleSpecifierSourceFile() === undefined)
    .map((declaration) => `${declaration.getSourceFile().getFilePath()} -> ${declaration.getModuleSpecifierValue()}`);
}

test(
  "every relative import in every proof of this wave resolves inside the proof's own file map",
  () => {
    const shared = new Project({ useInMemoryFileSystem: true, compilerOptions: { jsx: 4 } });
    const dangling: string[] = [];
    let sequence = 0;
    for (const policy of POLICIES) {
      for (const { proof } of policyProofRows(policy)) {
        sequence += 1;
        const root = `${ROOT}-proof-${sequence}`;
        const files = Object.entries(proof.files).map(([path, source]) => shared.createSourceFile(`${root}/${path}`, source));
        dangling.push(...danglingSpecifiers(files).map((row) => `${policy.id}: ${row}`));
        for (const file of files) {
          shared.removeSourceFile(file);
        }
      }
    }
    expect(dangling).toEqual([]);
  },
  CONFORMANCE_TIMEOUT_MS,
);

// ---------------------------------------------------------------------------------------------------
// §4.2 ORDINARY MARKER IDENTITY — one POSITIVE arm per ordinary policy, all three assertions. Two of the
// three are invisible to the module's own `mustPass` twin, which is why they live here.
// ---------------------------------------------------------------------------------------------------
test("a waiver at `maxPages` binds the windowed-infinite-query finding — and ONE marker is enough because the arms were merged", () => {
  // The legacy descriptor reported this cap TWICE (one finding per arm) on the same carrier with tokens no
  // authored text matches. Under the central grammar both would derive `maxPages`, every marker would be
  // `over-broad`, and the site would be unwaivable. This arm is the proof that the merge fixed that: ONE
  // marker, ONE consumption, zero alarms, on a fixture where BOTH arms bite.
  const waived = passOf(windowedInfiniteQuery, {
    "packages/client/src/features/chat/hooks/both.ts":
      "const rows = items.filter((r) => r.starred);\n" +
      "export const q = (trpc) =>\n" +
      "  trpc.chat.list.infiniteQueryOptions(\n" +
      "    { limit: 50 },\n" +
      "    // @orb-waive windowed-infinite-query(maxPages): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
      "    { maxPages: 5, getNextPageParam: (p) => p.nextCursor },\n" +
      "  );\n",
  });

  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

// A dead waiver position must alarm rather than make the positive authority case pass vacuously.
test("a windowed-query waiver naming a dead position suppresses nothing and alarms", () => {
  const mismatched = passOf(windowedInfiniteQuery, {
    "packages/client/src/features/chat/hooks/waived.ts":
      "// @orb-waive windowed-infinite-query(unusedCap): names a position this carrier does not bind.\n" +
      "export const q = (trpc) => trpc.chat.list.infiniteQueryOptions({}, { maxPages: 5 });\n",
  });
  expect(mismatched.authority.effectiveFindings).toHaveLength(1);
  expect(mismatched.authority.authorityAlarms).toMatchObject([{ kind: "ordinary-waiver", policyId: "windowed-infinite-query" }]);
});

// ---------------------------------------------------------------------------------------------------
// §4.5 DERIVED-POPULATION REFUSAL — the tripwire's verdict is about a tree it may not have been given.
// ---------------------------------------------------------------------------------------------------
test("windowed-infinite-query-health REFUSES when the client population is empty", () => {
  const empty = passOf(windowedInfiniteQueryHealth, { "packages/server/src/domain/x/verbs/x.ts": "export const x = 1;\n" });

  expect(empty.toolErrors).toMatchObject([{ policyId: "windowed-infinite-query-health", phase: "population" }]);
  expect(empty.toolErrors[0]?.message).toMatch(/admitted zero paths/u);
  expect(empty.authority.effectiveFindings).toEqual([]);
});
