import { Project } from "ts-morph";
import { gate as chromeRegistryCompleteness } from "../../../../tooling/src/verify/gates/chrome-registry-completeness.ts";
import { gate as messageKindPolicyCoverage } from "../../../../tooling/src/verify/gates/message-kind-policy-coverage.ts";
import { gate as modalBodyNotPlaceholder } from "../../../../tooling/src/verify/gates/modal-body-not-placeholder.ts";
import { gate as modalRegistryCompleteness } from "../../../../tooling/src/verify/gates/modal-registry-completeness.ts";
import { gate as placeholderCopyRegistry } from "../../../../tooling/src/verify/gates/placeholder-copy-registry.ts";
import { gate as sectionFactoryContributionBundle } from "../../../../tooling/src/verify/gates/section-factory-contribution-bundle.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/registry-family";

test("registry definition policies keep their founding and nearest-legal fixtures", () => {
  expect(
    verifyPolicyProofs([
      chromeRegistryCompleteness,
      messageKindPolicyCoverage,
      modalBodyNotPlaceholder,
      modalRegistryCompleteness,
      placeholderCopyRegistry,
      sectionFactoryContributionBundle,
    ]),
  ).toEqual([]);
  // Six policies' founding + nearest-legal fixtures are ~80 isolated typed passes; the default per-test
  // budget is sized for a single pass, not for a family's whole conformance battery.
}, 120_000);

function factoryPassOf(files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({
    knownPolicies: [sectionFactoryContributionBundle],
    policies: [sectionFactoryContributionBundle],
    root: ROOT,
    project,
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

const SECTION_TYPE = "export interface SectionDefinition { readonly id: string }\n";
const REGISTRY_TYPE = "export interface ContributorRegistry<Def> {\n  readonly def: Def;\n}\n";
const TWO_SEAM_FACTORY =
  'import type { SectionDefinition } from "../../../state/section-registry.ts";\nimport type { ContributorRegistry } from "../../../lib/registry.ts";\nexport function makeXSection(a: ContributorRegistry<string>, b: ContributorRegistry<number>): SectionDefinition {\n  void a;\n  void b;\n  return { id: "x" };\n}\n';

test("an unrelated exported ContributorRegistry elsewhere does not disturb the module-bound identity", () => {
  const result = factoryPassOf({
    "packages/client/src/state/section-registry.ts": SECTION_TYPE,
    "packages/client/src/lib/registry.ts": REGISTRY_TYPE,
    "packages/client/src/features/x/lib/impostor.ts": "export interface ContributorRegistry<Def> {\n  readonly other: Def;\n}\n",
    "packages/client/src/features/x/lib/x-section.tsx": TWO_SEAM_FACTORY,
  });

  // The registry is bound to its DECLARING MODULE, so a same-named export in another feature file neither
  // withholds this policy nor is admitted as a seam: the real two-seam signature still reds, exactly once.
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([{ policyId: "section-factory-contribution-bundle", token: "makeXSection" }]);
});

test("a missing or ambiguous registry home refuses with an unresolved receipt — the rename tripwire", () => {
  const gone = factoryPassOf({
    "packages/client/src/state/section-registry.ts": SECTION_TYPE,
    "packages/client/src/lib/contributor-registry.ts": REGISTRY_TYPE,
    "packages/client/src/features/x/lib/x-section.tsx":
      'import type { SectionDefinition } from "../../../state/section-registry.ts";\nimport type { ContributorRegistry } from "../../../lib/contributor-registry.ts";\nexport function makeXSection(a: ContributorRegistry<string>, b: ContributorRegistry<number>): SectionDefinition {\n  void a;\n  void b;\n  return { id: "x" };\n}\n',
  });
  expect(gone.toolErrors).toMatchObject([
    { policyId: "section-factory-contribution-bundle", phase: "receipt", message: expect.stringContaining("ContributorRegistry") },
  ]);
  expect(gone.authority.withheldPolicyIds).toEqual(["section-factory-contribution-bundle"]);
  expect(gone.authority.effectiveFindings).toEqual([]);

  // Declaration MERGING is the one way the home can export two `ContributorRegistry` declarations at once.
  const ambiguous = factoryPassOf({
    "packages/client/src/state/section-registry.ts": SECTION_TYPE,
    "packages/client/src/lib/registry.ts": `${REGISTRY_TYPE}export interface ContributorRegistry<Def> {\n  readonly extra: Def;\n}\n`,
    "packages/client/src/features/x/lib/x-section.tsx": TWO_SEAM_FACTORY,
  });
  expect(ambiguous.authority.withheldPolicyIds).toEqual(["section-factory-contribution-bundle"]);
  expect(ambiguous.authority.effectiveFindings).toEqual([]);
});

test("a zone vocabulary that stops resolving withholds the chrome verdict instead of passing", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(`${ROOT}/packages/client/src/state/section-registry.ts`, 'export const RAIL_ZONES = ["rail.nav"] as const;\n');
  project.createSourceFile(
    `${ROOT}/packages/client/src/state/chrome-registry.ts`,
    'import { RAIL_ZONES } from "./section-registry.ts";\nexport interface ChromeEntry { readonly id: string }\nexport const SHELL_ZONES = [...RAIL_ZONES] as const;\n',
  );
  project.createSourceFile(
    `${ROOT}/packages/client/src/features/x/lib/x-chrome.tsx`,
    'import type { ChromeEntry } from "../../../state/chrome-registry.ts";\nexport const xChrome: ChromeEntry = { id: "x", zone: "rail.nav", mobile: "sheet" };\n',
  );

  const result = runPolicyPass({
    knownPolicies: [chromeRegistryCompleteness],
    policies: [chromeRegistryCompleteness],
    root: ROOT,
    project,
    reviewedGrants: [],
    failOnWarnings: false,
  });

  // The §4.6 blindness rule, expressed as the runtime's own refusal: CHROME_ZONES was renamed, so the zone
  // arm has silently retired and the policy's second denominator is zero. It must not render a clean pass.
  expect(result.toolErrors).toMatchObject([{ policyId: "chrome-registry-completeness", phase: "receipt", message: expect.stringContaining("CHROME_ZONES") }]);
  expect(result.authority.withheldPolicyIds).toEqual(["chrome-registry-completeness"]);
  expect(result.authority.effectiveFindings).toEqual([]);
});
