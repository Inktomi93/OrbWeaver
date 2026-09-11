import { Project } from "ts-morph";
import { gate as chromeRegistryCompleteness } from "../../../../tooling/src/verify/gates/chrome-registry-completeness.ts";
import { gate as configAnchorInRegistry } from "../../../../tooling/src/verify/gates/config-anchor-in-registry.ts";
import { gate as configGroupCompleteness } from "../../../../tooling/src/verify/gates/config-group-completeness.ts";
import { gate as messageKindPolicyCoverage } from "../../../../tooling/src/verify/gates/message-kind-policy-coverage.ts";
import { gate as modalBodyNotPlaceholder } from "../../../../tooling/src/verify/gates/modal-body-not-placeholder.ts";
import { gate as modalRegistryCompleteness } from "../../../../tooling/src/verify/gates/modal-registry-completeness.ts";
import { gate as placeholderCopyRegistry } from "../../../../tooling/src/verify/gates/placeholder-copy-registry.ts";
import { gate as routeImportsNoFeature } from "../../../../tooling/src/verify/gates/route-imports-no-feature.ts";
import { gate as sectionFactoryContributionBundle } from "../../../../tooling/src/verify/gates/section-factory-contribution-bundle.ts";
import { gate as sectionRegistryCompleteness } from "../../../../tooling/src/verify/gates/section-registry-completeness.ts";
import { gate as warningCodeCoverage } from "../../../../tooling/src/verify/gates/warning-code-coverage.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/registry-family";

test("registry definition policies keep their founding and nearest-legal fixtures", () => {
  expect(
    verifyPolicyProofs([
      chromeRegistryCompleteness,
      configAnchorInRegistry,
      configGroupCompleteness,
      messageKindPolicyCoverage,
      modalBodyNotPlaceholder,
      modalRegistryCompleteness,
      placeholderCopyRegistry,
      routeImportsNoFeature,
      sectionFactoryContributionBundle,
      sectionRegistryCompleteness,
      warningCodeCoverage,
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
  expect(result.authority.effectiveFindings).toMatchObject([{ policyId: "section-factory-contribution-bundle", token: "b" }]);
});

test("a factory that trips BOTH arms is separately waivable — one marker per excess parameter", () => {
  // #1954: both arms used to anchor on the factory DECLARATION, so the two findings shared a file, an
  // offset and a position token and differed only in `message`, which the waiver engine never reads. One
  // marker in that carrier matched two candidates, went over-broad and suppressed NEITHER — this ordinary
  // policy had no working door at all. Each arm now anchors on its own excess parameter, so two markers
  // bind one finding each. The negative arms (wrong-policy, stale, malformed, over-broad) stay the central
  // engine's proof in `ordinary-waiver.test.ts`; this is the POSITIVE identity arm for this policy.
  const result = factoryPassOf({
    "packages/client/src/state/section-registry.ts": SECTION_TYPE,
    "packages/client/src/lib/registry.ts": REGISTRY_TYPE,
    "packages/client/src/features/x/lib/x-section.tsx": [
      'import type { SectionDefinition } from "../../../state/section-registry.ts";',
      'import type { ContributorRegistry } from "../../../lib/registry.ts";',
      "export function makeXSection(",
      "  a: ContributorRegistry<string>,",
      "  // @orb-waive section-factory-contribution-bundle(b): the second registry is a staged migration seam",
      "  b: ContributorRegistry<number>,",
      "  p: (v: string) => null,",
      "  // @orb-waive section-factory-contribution-bundle(q): the second render prop lands with the seam above",
      "  q: (v: number) => null,",
      "): SectionDefinition {",
      "  void a;",
      "  void b;",
      "  void p;",
      "  void q;",
      '  return { id: "x" };',
      "}",
      "",
    ].join("\n"),
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.waivedFindings).toHaveLength(2);
  expect(result.authority.authorityAlarms).toEqual([]);
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

test("one kind's blind provider withholds only ITS consumers — the other kinds still render a verdict", () => {
  // THE #1953 PROPERTY, and the reason there is one provider per registry kind rather than one over all
  // seven: a fact is the runtime's atomic failure unit, so a summed receipt over every kind made ANY
  // population that legitimately declares only some of the types refuse for all of them — which is how 95
  // proof rows across eight policies went dark. Here `ModalDefinition` is absent while `SectionDefinition`
  // is healthy: the modal provider refuses and withholds its consumer, the section consumer still accuses.
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(`${ROOT}/packages/client/src/state/section-registry.ts`, SECTION_TYPE);
  project.createSourceFile(
    `${ROOT}/packages/client/src/features/x/lib/not-a-section-file.ts`,
    'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport const xSection: SectionDefinition = { id: "x", content: () => null };\n',
  );

  const result = runPolicyPass({
    knownPolicies: [modalRegistryCompleteness, sectionRegistryCompleteness],
    policies: [modalRegistryCompleteness, sectionRegistryCompleteness],
    root: ROOT,
    project,
    reviewedGrants: [],
    failOnWarnings: false,
  });

  expect(result.facts.map(({ id, status }) => [id, status])).toEqual([
    ["registry-definitions-modal", "incomplete"],
    ["registry-definitions-section", "success"],
  ]);
  expect(result.authority.withheldPolicyIds).toEqual(["modal-registry-completeness"]);
  expect(result.authority.effectiveFindings).toMatchObject([{ policyId: "section-registry-completeness", token: "xSection" }]);
});

const PROVIDER_HOME = "packages/server/src/infra/providers/contract/resolve.ts";
const PROVIDER_EMIT = "packages/server/src/infra/providers/resolve-chat.ts";
const CHAT_HOME = "packages/contracts/src/chat/bus.ts";
const CHAT_EMIT = "packages/server/src/domain/chat/x.ts";
const PROVIDER_TUPLE = 'export const WARNING_CODES = ["provider_ok"] as const;\n';
const PROVIDER_PUSH = 'declare const warnings: { code: string; message: string }[];\nwarnings.push({ code: "provider_ok", message: "visible" });\n';
const CHAT_TUPLE = 'export const CHAT_WARNING_CODES = ["chat_ok"] as const;\n';
const CHAT_PUSH = 'declare function emit(event: unknown): void;\nemit({ type: "warning", code: "chat_ok" });\n';

function warningPassOf(files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({
    knownPolicies: [warningCodeCoverage],
    policies: [warningCodeCoverage],
    root: ROOT,
    project,
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test.each([
  [
    "declared outside its home",
    {
      [PROVIDER_HOME]: PROVIDER_TUPLE,
      [PROVIDER_EMIT]: PROVIDER_PUSH,
      "packages/contracts/src/chat/relocated.ts": CHAT_TUPLE,
      [CHAT_EMIT]: CHAT_PUSH,
    },
  ],
  ["absent", { [PROVIDER_HOME]: PROVIDER_TUPLE, [PROVIDER_EMIT]: PROVIDER_PUSH, [CHAT_HOME]: "export const OTHER = 1;\n", [CHAT_EMIT]: CHAT_PUSH }],
  [
    "empty",
    {
      [PROVIDER_HOME]: PROVIDER_TUPLE,
      [PROVIDER_EMIT]: PROVIDER_PUSH,
      [CHAT_HOME]: "export const CHAT_WARNING_CODES = [] as const;\n",
      [CHAT_EMIT]: CHAT_PUSH,
    },
  ],
] as const)("a warning vocabulary %s withholds the coverage verdict instead of passing", (_label, files) => {
  const result = warningPassOf(files);

  // The channel is BOUND to its declaring module, so a same-named tuple elsewhere is a different
  // vocabulary and is never adopted; absent and empty are the same blindness. In all three the emit corpus
  // is intact and the provider channel is healthy — only the chat denominator collapses, and a policy
  // cannot render a clean coverage verdict over a vocabulary it could not read.
  expect(result.factErrors).toEqual([]);
  expect(result.toolErrors).toMatchObject([{ policyId: "warning-code-coverage", phase: "receipt", message: expect.stringContaining("CHAT_WARNING_CODES") }]);
  expect(result.authority.withheldPolicyIds).toEqual(["warning-code-coverage"]);
  expect(result.authority.effectiveFindings).toEqual([]);
});

test("a warning vocabulary at its own home is read, so the withholding above is the rebinding and not the fixture", () => {
  const result = warningPassOf({ [PROVIDER_HOME]: PROVIDER_TUPLE, [PROVIDER_EMIT]: PROVIDER_PUSH, [CHAT_HOME]: CHAT_TUPLE, [CHAT_EMIT]: CHAT_PUSH });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.policies[0]?.receipts).toEqual([
    { kind: "population", source: "CHAT_WARNING_CODES", members: 1, unresolved: 0 },
    { kind: "population", source: "WARNING_CODES", members: 1, unresolved: 0 },
  ]);
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
