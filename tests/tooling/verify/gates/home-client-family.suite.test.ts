// Conformance entry for CLIENT-side policies whose exceptions are sanctioned HOMES. Every
// proof runs through the production dispatcher on an isolated population; the pins below cover what a proof
// cannot express — a receipt REFUSAL (a tool error, not a finding).

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as noEffectOnSharedSelection } from "../../../../tooling/src/verify/gates/no-effect-on-shared-selection.ts";
import { gate as renderErrorViaBattery } from "../../../../tooling/src/verify/gates/render-error-via-battery.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { isolatedTypeFacts, verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

const FAMILY: readonly GatePolicy[] = [noEffectOnSharedSelection, renderErrorViaBattery];

test("the sanctioned-home client policies keep their founding, permission, respelling and counterfactual fixtures", () => {
  expect(verifyPolicyProofs(FAMILY)).toEqual([]);
}, 240_000);

const ROOT = "/home-client-family";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function passOf(policy: GatePolicy, files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  const project = projectOf(files);
  return runPolicyPass({
    knownPolicies: [policy],
    policies: [policy],
    root: ROOT,
    project,
    nativeTypeFacts: () => isolatedTypeFacts(project),
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

/** Every relative specifier a single proof row authored, paired with whether it reached a file. */
function unresolvedSpecifiers(proof: { readonly files: Readonly<Record<string, string>> }): {
  readonly checked: number;
  readonly unresolved: readonly string[];
} {
  const project = projectOf(proof.files);
  const unresolved: string[] = [];
  let checked = 0;
  for (const sourceFile of project.getSourceFiles()) {
    for (const declaration of sourceFile.getImportDeclarations()) {
      const specifier = declaration.getModuleSpecifierValue();
      if (!specifier.startsWith(".")) {
        continue;
      }
      checked += 1;
      if (declaration.getModuleSpecifierSourceFile() === undefined) {
        unresolved.push(`${sourceFile.getFilePath()} -> ${specifier}`);
      }
    }
  }
  return { checked, unresolved };
}

// ---------------------------------------------------------------------------------------------------
// THE FIXTURE-SPECIFIER RESOLUTION CONTROL. A proof row's relative import that resolves to NOTHING makes
// every identity row pass by FAIL-CLOSURE while conformance still reports green — the lying-proof shape the
// wave-3 lanes paid for. Every relative specifier in every row of this family must reach a file in the
// row's own map.
// ---------------------------------------------------------------------------------------------------
test("every relative import in every proof of this family resolves inside the proof's own file map", () => {
  const unresolved: string[] = [];
  let checked = 0;
  for (const policy of FAMILY) {
    for (const arm of ["mustFlag", "mustPass"] as const) {
      for (const [index, proof] of policy[arm].entries()) {
        const measured = unresolvedSpecifiers(proof);
        checked += measured.checked;
        unresolved.push(...measured.unresolved.map((detail) => `${policy.id} ${arm}[${index}] ${detail}`));
      }
    }
  }
  expect(unresolved).toEqual([]);
  // A bare zero would mean the sweep measured nothing; these families are import-heavy by construction.
  expect(checked).toBeGreaterThan(20);
}, 120_000);

// ---------------------------------------------------------------------------------------------------
// RECEIPT REFUSALS. Each of these policies locates a HOME and refuses when it is gone — the final form of
// the legacy rename tripwires and the §4.6 blindness arm, which conformance cannot express because a
// refusal is a TOOL ERROR rather than a finding.
// ---------------------------------------------------------------------------------------------------
test("render-error-via-battery REFUSES when either the boundary or the battery home is gone", () => {
  const gone = passOf(renderErrorViaBattery, {
    "packages/client/src/components/query-boundary.tsx": "export declare function QueryBoundary(props: { renderError?: unknown }): unknown;\n",
    "packages/client/src/features/a/x.tsx":
      'import { QueryBoundary } from "../../components/query-boundary.tsx";\nexport const G = () => <QueryBoundary renderError={() => null} />;\n',
  });

  expect(gone.toolErrors).toMatchObject([{ policyId: "render-error-via-battery", phase: "receipt" }]);
  expect(gone.authority.withheldPolicyIds).toEqual(["render-error-via-battery"]);
});

test("no-effect-on-shared-selection REFUSES when a pointer in its vocabulary no longer exists", () => {
  const renamed = passOf(noEffectOnSharedSelection, {
    "packages/client/src/state/index.ts": "export declare function useActiveChatId(): string | null;\n",
    "packages/client/src/features/chat/x.ts": "export const c = null;\n",
  });

  // Six of the seven pointers are missing from this barrel: the receipt carries them as UNRESOLVED, which
  // refuses exactly as a zero would. The legacy regex simply stopped matching them.
  expect(renamed.toolErrors).toMatchObject([{ policyId: "no-effect-on-shared-selection", phase: "receipt" }]);
  expect(renamed.policies[0]?.receipts).toMatchObject([{ kind: "population", source: "shared-selection pointers", members: 1, unresolved: 6 }]);
});
