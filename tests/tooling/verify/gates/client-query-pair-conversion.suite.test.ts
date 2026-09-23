// Conformance entry for the CLIENT QUERY/STORE PAIR of #1584: two legacy `GateDescriptor` modules
// (`zustand-selector-derived`, `windowed-infinite-query`) converted into THREE final policies. They are
// grouped by CONVERSION WAVE and nothing else — §7 item 4 of docs/law/gate-runtime-standardization.md is
// explicit that a theme is not a family. Two families are represented:
//
//   zustand-selector-derived   — a declared SINGLETON. Its subject is the callee's TEXT; its converted
//                                sibling `zustand-selector-stability` resolves the callee's TYPE. Neither
//                                subject reader subsumes the other and they share no `lib/` computation.
//   windowed-infinite-query    — windowed-infinite-query + windowed-infinite-query-health, split at
//                                conversion because the blindness tripwire is `hard` + `entire-population`
//                                while the occurrence arms are `ordinary` + `selected-files`.
//
// WHAT THIS FILE CARRIES, AND WHY IT IS NOT A SECOND CONFORMANCE RUNNER. Every declared
// `mustFlag`/`mustPass` row already executes on the static bar (`structure:policy-conformance`). What a row
// structurally CANNOT assert — and what therefore lives here — is the §4.2 triple (`effectiveFindings []`,
// `waivedFindings 1`, `authorityAlarms []`), the §4.5 refusal pin for the `-health` policy's derived
// population, and the §4.6 fixture-level differential against the frozen legacy descriptors.
//
// §4.3 (reviewed grants) does not apply: all three declare `facts: []` / `resources: []` and none is
// `authority: "reviewed-grant"`.
import type { SourceFile } from "ts-morph";
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as windowedInfiniteQuery } from "../../../../tooling/src/verify/gates/windowed-infinite-query.ts";
import { gate as windowedInfiniteQueryHealth } from "../../../../tooling/src/verify/gates/windowed-infinite-query-health.ts";
import { gate as zustandSelectorDerived } from "../../../../tooling/src/verify/gates/zustand-selector-derived.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { policyProofRows } from "../../../../tooling/src/verify/lib/policy-proof-rows.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const ROOT = "/client-query-pair-conversion";
const CONFORMANCE_TIMEOUT_MS = scaledBudget(300_000);

const WAVE: readonly GatePolicy[] = [windowedInfiniteQuery, windowedInfiniteQueryHealth, zustandSelectorDerived];

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
  "the wave's three policies keep their founding, near-miss, fence and identity fixtures",
  () => {
    expect(verifyPolicyProofs(WAVE)).toEqual([]);
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
    for (const policy of WAVE) {
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
test("a waiver at the STORE HOOK NAME binds the zustand-selector-derived finding", () => {
  const waived = passOf(zustandSelectorDerived, {
    "packages/client/src/state/waived.ts":
      "declare const useXStore: (sel: (s: { a: number; b: number }) => unknown) => unknown;\n" +
      "// @orb-waive zustand-selector-derived(useXStore): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
      "export const v = useXStore((s) => ({ a: s.a, b: s.b }));\n",
  });

  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

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

// The DISCRIMINATION control, run ONCE for the wave (§4.2). A marker naming a position the policy does not
// report must suppress NOTHING and must ALARM — otherwise both arms above are green for the wrong reason.
test("THE DISCRIMINATION CONTROL: a waiver naming a dead position suppresses nothing and alarms", () => {
  const mismatched = passOf(zustandSelectorDerived, {
    "packages/client/src/state/waived.ts":
      "declare const useXStore: (sel: (s: { a: number; b: number }) => unknown) => unknown;\n" +
      "// @orb-waive zustand-selector-derived(useYStore): names a position this carrier does not bind.\n" +
      "export const v = useXStore((s) => ({ a: s.a, b: s.b }));\n",
  });

  expect(mismatched.authority.effectiveFindings).toHaveLength(1);
  expect(mismatched.authority.authorityAlarms).toMatchObject([{ kind: "ordinary-waiver", policyId: "zustand-selector-derived" }]);
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
