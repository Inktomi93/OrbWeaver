import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
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
  // is healthy: the modal consumer is withheld, the section consumer still accuses.
  //
  // WHICH PHASE withholds moved on 2026-09-11 (#1962) and the property did not. Both providers now SUCCEED —
  // a provider receipt states the sources it walked, never the census it found (§12.3) — and the modal
  // blindness is caught one phase later at `modal-registry-completeness`'s own
  // `members: view.definitions.length` receipt, the door every registry consumer already files. Same
  // withheld id, same silence, same untouched sibling.
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
    ["registry-definitions-modal", "success"],
    ["registry-definitions-section", "success"],
  ]);
  expect(result.toolErrors).toMatchObject([
    { policyId: "modal-registry-completeness", phase: "receipt", message: expect.stringContaining("resolved zero members") },
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

// ---------------------------------------------------------------------------------------------------
// §4.5 refusal pins for the two registry-family policies whose denominators were sound but UNPINNED
// (v-audit-wave2-2026-09-12.md D6). Both are INVENTED rows, so each carries a planted-break receipt in
// the landing commit: the module's receipt call was cut in a `cp`-backed copy and the pin went RED.
// ---------------------------------------------------------------------------------------------------

function passOf(policy: GatePolicy, files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
}

/** The config types plus one registered group/collection pair — everything except the content HOST. */
const CONFIG_GROUP_PRELUDE = {
  "packages/client/src/state/config-group-registry.ts": "export interface ConfigGroupDefinition { readonly id: string }\n",
  "packages/client/src/lib/collection-contracts.ts": "export interface CollectionContribution { readonly create: unknown }\n",
  "packages/client/src/features/base/lib/base-collection.tsx":
    'import type { CollectionContribution } from "../../../lib/collection-contracts.ts";\nexport const baseCollection: CollectionContribution = { create: { label: "New base", useRun: () => () => undefined } };\n',
  "packages/client/src/features/base/lib/base-group.tsx":
    'import type { ConfigGroupDefinition } from "../../../state/config-group-registry.ts";\nimport { baseCollection } from "./base-collection.tsx";\nexport const baseGroup: ConfigGroupDefinition = { id: "base", body: { collection: baseCollection } };\n',
} as const;
const CONFIG_HOST = "packages/client/src/features/config/surfaces/config-content-surface.tsx";
const HOST_IMPORTS_A_FEATURE = 'import { Panel } from "#features/persona";\nexport const ConfigContentSurface = (): unknown => Panel;\n';

test("a RENAMED config content host withholds the verdict instead of retiring its import arm", () => {
  // config-group-completeness declares THREE denominators, and the third exists for exactly this: the host
  // is keyed BY PATH, so a renamed surface would leave the import arm with no file to judge and every other
  // arm still green — a silently retired wall, which is the half-migration the doctrine bans. The byte-
  // identical host body sits at a renamed path here; only the path differs from the control below.
  const renamed = passOf(configGroupCompleteness, {
    ...CONFIG_GROUP_PRELUDE,
    "packages/client/src/features/config/surfaces/config-content-pane.tsx": HOST_IMPORTS_A_FEATURE,
  });

  expect(renamed.factErrors).toEqual([]);
  expect(renamed.toolErrors).toMatchObject([
    { policyId: "config-group-completeness", phase: "receipt", message: expect.stringContaining("config content host") },
  ]);
  expect(renamed.authority.withheldPolicyIds).toEqual(["config-group-completeness"]);
  expect(renamed.authority.effectiveFindings).toEqual([]);

  // THE CONTROL, proving the withholding is the RENAME and not the fixture: the same bytes at the real host
  // path render a verdict, and the accusation that vanished above is present here.
  const present = passOf(configGroupCompleteness, { ...CONFIG_GROUP_PRELUDE, [CONFIG_HOST]: HOST_IMPORTS_A_FEATURE });

  expect(present.toolErrors).toEqual([]);
  expect(present.authority.withheldPolicyIds).toEqual([]);
  expect(present.authority.effectiveFindings).toMatchObject([{ policyId: "config-group-completeness", token: "import" }]);
});

const SECTION_TYPE_HOME = "packages/client/src/state/section-registry.ts";
const DUPLICATE_COPY_PAIR = {
  "packages/client/src/features/a/lib/a-section.ts":
    'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport const aSection: SectionDefinition = { id: "a", placeholder: { title: "T", description: "D" } };\n',
  "packages/client/src/features/b/lib/b-section.ts":
    'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport const bSection: SectionDefinition = { id: "b", placeholder: { title: "T", description: "D" } };\n',
} as const;

test("a renamed SectionDefinition withholds the placeholder verdict instead of comparing an empty corpus", () => {
  // placeholder-copy-registry's whole subject is a CROSS-FILE distinctness comparison, so its denominator is
  // the definition corpus itself: renamed past the canonical type, the fact resolves no targets, the policy
  // compares nothing and would otherwise report a clean pass over zero sections — the §4.6 blindness shape.
  const renamed = passOf(placeholderCopyRegistry, {
    [SECTION_TYPE_HOME]: "export interface SectionContribution { readonly id: string }\n",
    ...DUPLICATE_COPY_PAIR,
  });

  expect(renamed.factErrors).toEqual([]);
  expect(renamed.toolErrors).toMatchObject([
    { policyId: "placeholder-copy-registry", phase: "receipt", message: expect.stringContaining("SectionDefinition") },
  ]);
  expect(renamed.authority.withheldPolicyIds).toEqual(["placeholder-copy-registry"]);
  expect(renamed.authority.effectiveFindings).toEqual([]);

  // THE CONTROL: the identical sections under the canonical type name are read, and the duplicate pair the
  // silence above would have hidden is accused.
  const present = passOf(placeholderCopyRegistry, {
    [SECTION_TYPE_HOME]: "export interface SectionDefinition { readonly id: string }\n",
    ...DUPLICATE_COPY_PAIR,
  });

  expect(present.toolErrors).toEqual([]);
  expect(present.authority.withheldPolicyIds).toEqual([]);
  expect(present.authority.effectiveFindings).toMatchObject([{ policyId: "placeholder-copy-registry", token: "bSection" }]);
});
