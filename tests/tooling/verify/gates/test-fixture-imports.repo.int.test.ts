// THE REAL-TREE FINDING DIFFERENTIAL for `test-fixture-imports` (#1584 §4.6), kept as a standing test
// rather than as a one-time prose claim, because this conversion is the only one in the origin-server
// family whose recorded differential ran legacy NON-ZERO → final ZERO (6 → 0,
// docs/reviews/gate-runtime/origin-server-family-1584.md:100) — the literal shape of a LOST CATCH.
//
// WHAT THE 6 WERE, each accounted for individually. Replaying the frozen legacy descriptor over the
// pre-conversion tree (`e3c80bbbc^`) reports exactly six, and they are THREE specs × the TWO named
// import specifiers each (the legacy detector is keyed on `ImportSpecifier`, not on the import
// declaration): `tests/tooling/verify/gates/{id-brand-flow,ledger-banned-shapes,schema-fact-wave-1}`
// `.test.ts`, each `import { expect, test } from "vitest"`. `e3c80bbbc` re-doors all three to
// `support/tool-fixtures.ts` in the same commit, which is why the final pass read zero. The six were
// FIXED, not waived, and the claim is now a measurement.
//
// WHAT THIS TEST PINS FORWARD. `e3c80bbbc` also REPAIRED the policy — the fail-closed member arm that
// produced 89 false positives (`pattern.test(value)`) was narrowed to declared import doors — and a
// repair that removes 89 false positives is exactly the change that can also remove a true one. So the
// durable assertion is not a count but SET EQUALITY: the frozen legacy detector and the final policy,
// over the SAME real workspace, must report the same sites. A count would rot as specs land; an
// equality reds only when the two engines actually disagree, which is the thing worth knowing.
//
// This file replays the LEGACY `GateDescriptor` dispatcher, so it retires with the legacy runtime at the
// atomic cutover (gate-runtime-standardization.md §1) — not per carrier, the whole file.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { getWorkspace } from "../../../../tooling/src/_shared/ts-workspace.ts";
import type { GateDescriptor } from "../../../../tooling/src/verify/contract/gate.ts";
import { gate as testFixtureImports } from "../../../../tooling/src/verify/gates/test-fixture-imports.ts";
import { repoRel, runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

/** The commit this family was based at — the last tree where `test-fixture-imports` was still a legacy
 *  `GateDescriptor`. Its conversion landed one commit later in `e3c80bbbc`. */
const LEGACY_SHA = "519242add7050c206631a9b25727d803be41e4db";
const LEGACY_PATH = "tooling/src/verify/gates/test-fixture-imports.ts";

/** The legacy `scanRoot` admitted 2,627 paths on the pre-conversion tree. A differential whose legacy
 *  side reports zero because its population admitted NOTHING is vacuous, so the admitted count is
 *  asserted before the verdicts are compared — a floor well under the live number, not a ratchet. */
const MIN_ADMITTED = 2000;

/** Quiet-box ceiling for two full passes over a ~7,400-source typed workspace (measured 37 s). Derived
 *  through the ONE load policy rather than written as a fixed clock — a CPU-bound sweep takes the tighter
 *  4× cap (`_shared/load-budget.ts`; docs/design/1208-instrument-substrate.md §7.1). */
const DIFFERENTIAL_BASE_MS = 120_000;

interface Site {
  readonly file: string;
  readonly line: number | undefined;
  readonly name: string;
}

/** The legacy token is `"<name> from <module>"`; the final token is the bare name. Both engines are asked
 *  for the same thing — WHICH BINDING at WHICH POSITION — so the comparison normalises to that. */
function siteOf(finding: { readonly file: string; readonly line?: number; readonly token?: string }): Site {
  return { file: finding.file, line: finding.line, name: (finding.token ?? "").split(" from ")[0] ?? "" };
}

function sorted(sites: readonly Site[]): readonly Site[] {
  return sites.toSorted((left, right) => left.file.localeCompare(right.file) || (left.line ?? 0) - (right.line ?? 0) || left.name.localeCompare(right.name));
}

/** Extract the frozen descriptor into scratch and shim its ONE relative import so it loads outside the
 *  gates directory. Same recipe as `simple-visitors-wave-2.test.ts`. */
async function frozenLegacyGate(scratch: string): Promise<GateDescriptor> {
  const source = execFileSync("git", ["show", `${LEGACY_SHA}:${LEGACY_PATH}`], { cwd: process.cwd(), encoding: "utf8" });
  const contractHref = JSON.stringify(pathToFileURL(join(process.cwd(), "tooling/src/verify/contract/gate.ts")).href);
  const target = join(scratch, "legacy-test-fixture-imports.ts");
  writeFileSync(target, source.replace('from "../contract/gate.ts"', `from ${contractHref}`));
  return ((await import(`${pathToFileURL(target).href}?frozen=test-fixture-imports`)) as { readonly gate: GateDescriptor }).gate;
}

test("the frozen legacy detector and the final policy report the SAME fixture-door sites on the real tree", {
  timeout: scaledBudget(DIFFERENTIAL_BASE_MS, 4),
}, async ({ scratch }) => {
  const root = process.cwd();
  const legacy = await frozenLegacyGate(scratch);
  // ONE workspace, both engines. Measuring two predicates over the same byte set is what makes the
  // difference attributable to the RULE rather than to the corpus.
  const project = getWorkspace({ root, types: true });
  const files = project.getSourceFiles();

  const admitted = files.map((file) => repoRel(root, file.getFilePath())).filter((path) => legacy.scanRoot?.(path) ?? true);
  expect(admitted.length, "vacuity control: the frozen scanRoot must still admit the test corpus").toBeGreaterThan(MIN_ADMITTED);

  const legacyPass = runPass([legacy], { root, project, scope: { kind: "project" }, files, checker: () => project.getTypeChecker() });
  expect(legacyPass.toolErrors).toEqual([]);
  const legacySites = sorted((legacyPass.gates[0]?.findings ?? []).map(siteOf));

  const finalPass = runPolicyPass({
    knownPolicies: [testFixtureImports],
    policies: [testFixtureImports],
    root,
    project,
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(finalPass.toolErrors).toEqual([]);
  expect(finalPass.factErrors).toEqual([]);
  const owner = finalPass.policies.find((policy) => policy.id === testFixtureImports.id);
  expect(owner?.owner.status).toBe("success");
  // RAW, not effective: a future positioned waiver suppresses on the final side only (the legacy
  // `@orb-gate-ignore` grammar is retired), and that is a waiver-plane fact, not an engine disagreement.
  const finalSites = sorted((owner?.findings ?? []).map(siteOf));

  expect(finalSites).toEqual(legacySites);
});
