import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as chromeRegistryCompleteness } from "../../../../tooling/src/verify/gates/chrome-registry-completeness.ts";
import { gate as configAnchorInRegistry } from "../../../../tooling/src/verify/gates/config-anchor-in-registry.ts";
import { gate as configGroupCompleteness } from "../../../../tooling/src/verify/gates/config-group-completeness.ts";
import { gate as homeTileRegistryCompleteness } from "../../../../tooling/src/verify/gates/home-tile-registry-completeness.ts";
import { gate as messageKindPolicyCoverage } from "../../../../tooling/src/verify/gates/message-kind-policy-coverage.ts";
import { gate as modalBodyNotPlaceholder } from "../../../../tooling/src/verify/gates/modal-body-not-placeholder.ts";
import { gate as modalRegistryCompleteness } from "../../../../tooling/src/verify/gates/modal-registry-completeness.ts";
import { gate as noParallelSectionMap } from "../../../../tooling/src/verify/gates/no-parallel-section-map.ts";
import { gate as placeholderCopyRegistry } from "../../../../tooling/src/verify/gates/placeholder-copy-registry.ts";
import { gate as registryAssemblyAtDoorOnly } from "../../../../tooling/src/verify/gates/registry-assembly-at-door-only.ts";
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
      homeTileRegistryCompleteness,
      messageKindPolicyCoverage,
      modalBodyNotPlaceholder,
      modalRegistryCompleteness,
      noParallelSectionMap,
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

// ---------------------------------------------------------------------------------------------------
// THE SUCCESSOR PROOF for `home-tile-registry-completeness`'s RETIRED anti-god-map arm (guide §8.3 MERGE).
// The legacy gate flagged a `createContributorRegistry("home-tiles", …)` outside the door by CALLEE
// SPELLING, justifying the overlap in its header as catching "the shape G8's file allowlist would miss".
// That sentence described the LEGACY `registry-assembly-at-door-only` and became false at its conversion:
// the door is now population algebra, the callee is judged by resolved origin, and the subject is every
// registry mint. Retiring an arm owes a proof that its successor still bites the retired fixture — the
// EXACT bytes and the EXACT path the retired `mustFlag` row used — plus the door control beside it,
// because the successor's door is a DIRECTORY fence (`packages/client/src/**/compose/**`) and the retired
// fixture's file merely BEGINS with "compose".
// ---------------------------------------------------------------------------------------------------

const REGISTRY_FACTORY_HOME =
  "export declare function createRegistry(name: string, ids: readonly string[], definitions: Record<string, unknown>): unknown;\nexport declare function createContributorRegistry(name: string, contributions: readonly unknown[]): unknown;\n";
const HOME_TILES_ASSEMBLY =
  'import { createContributorRegistry } from "../../../lib/registry.ts";\nexport const tiles = createContributorRegistry("home-tiles", []);\n';

test("the retired home-tile anti-god-map fixture is still red, under its successor", () => {
  const stray = passOf(registryAssemblyAtDoorOnly, {
    "packages/client/src/lib/registry.ts": REGISTRY_FACTORY_HOME,
    "packages/client/src/features/home/lib/compose-tiles.ts": HOME_TILES_ASSEMBLY,
  });

  expect(stray.toolErrors).toEqual([]);
  expect(stray.authority.withheldPolicyIds).toEqual([]);
  expect(stray.authority.effectiveFindings).toMatchObject([{ policyId: "registry-assembly-at-door-only", token: "createContributorRegistry" }]);

  // THE DOOR CONTROL, proving the red above is the SITE and not the shape: the same assembly at the
  // composition root passes, which is the half of the retired arm that was an allowance rather than a ban.
  const door = passOf(registryAssemblyAtDoorOnly, {
    "packages/client/src/lib/registry.ts": REGISTRY_FACTORY_HOME,
    "packages/client/src/main.tsx":
      'import { createContributorRegistry } from "./lib/registry.ts";\nexport const tiles = createContributorRegistry("home-tiles", []);\n',
  });

  expect(door.toolErrors).toEqual([]);
  expect(door.authority.effectiveFindings).toEqual([]);
});

// ---------------------------------------------------------------------------------------------------
// §4.5 for `no-parallel-section-map`'s FOUR denominators. Legacy skipped a vocabulary whose tuple read
// empty (`if (vocab.ids.size === 0) continue`), so a renamed or moved tuple silently retired that arm
// while the other four stayed green over the same tree — the half-migration §4.6 bans, and the shape a
// proof row structurally cannot express (a withheld policy reports nothing, so no `mustFlag` sees it and
// no `mustPass` distinguishes it from a clean run). These are INVENTED rows and carry their planted-break
// receipt in the landing commit: the module's `tupleVocabularyReceipt` call was cut in a `cp`-backed copy
// and the pin went red.
// ---------------------------------------------------------------------------------------------------

/** The four live vocabularies plus a parallel ConfigGroupId map — everything except the tuple under test. */
const PARALLEL_MAP_PRELUDE = {
  "packages/client/src/state/section-ids.ts": 'export const SECTION_IDS = ["chats", "characters", "corpus"] as const;\n',
  "packages/client/src/state/modal-slot-ids.ts": 'export const MODAL_SLOT_IDS = ["theme", "settings", "account"] as const;\n',
  "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
  "packages/client/src/state/chrome-registry.ts":
    'import { RAIL_ZONES } from "./section-registry.ts";\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
  "packages/client/src/features/x/lib/config-labels.ts": "export const LABELS = {\n  personas: { label: 1 },\n  appearance: { label: 2 },\n};\n",
} as const;
const CONFIG_GROUP_TUPLE = 'export const CONFIG_GROUP_IDS = ["personas", "appearance", "tags"] as const;\n';

test.each([
  ["renamed past its declared name", { "packages/client/src/state/config-group-ids.ts": 'export const GROUP_IDS = ["personas", "appearance"] as const;\n' }],
  ["absent", { "packages/client/src/state/config-group-ids.ts": "export const OTHER = 1;\n" }],
  ["empty", { "packages/client/src/state/config-group-ids.ts": "export const CONFIG_GROUP_IDS = [] as const;\n" }],
] as const)("a %s config-group vocabulary withholds the parallel-map verdict instead of retiring its arm", (_label, tuple) => {
  const result = passOf(noParallelSectionMap, { ...PARALLEL_MAP_PRELUDE, ...tuple });

  // The tuple is read BY SYMBOL, so a rename is the same blindness as an absence and as an empty tuple:
  // the denominator collapses, the ConfigGroupId arm can judge nothing, and the policy must not render a
  // clean verdict over the other three while the parallel map below it goes unaccused.
  expect(result.factErrors).toEqual([]);
  expect(result.toolErrors).toMatchObject([{ policyId: "no-parallel-section-map", phase: "receipt", message: expect.stringContaining("CONFIG_GROUP_IDS") }]);
  expect(result.authority.withheldPolicyIds).toEqual(["no-parallel-section-map"]);
  expect(result.authority.effectiveFindings).toEqual([]);
});

test("the same corpus with every vocabulary resolving accuses the parallel map — the control", () => {
  const result = passOf(noParallelSectionMap, { ...PARALLEL_MAP_PRELUDE, "packages/client/src/state/config-group-ids.ts": CONFIG_GROUP_TUPLE });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([{ policyId: "no-parallel-section-map", token: "personas" }]);
});

test("the CHROME_ZONES spread resolves to all four zones, so the rail arm is not judging one zone", () => {
  // THE #942 PROPERTY, measured rather than asserted in prose: `CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"]`
  // must deliver `rail.brand` — a zone that reaches the vocabulary ONLY through the imported spread — or a
  // hand rail list over `rail.nav`/`rail.brand` escapes while every other row stays green.
  const result = passOf(noParallelSectionMap, {
    ...PARALLEL_MAP_PRELUDE,
    "packages/client/src/state/config-group-ids.ts": CONFIG_GROUP_TUPLE,
    "packages/client/src/features/x/lib/hand-rail.ts": 'export const HAND = [\n  { id: "a", zone: "rail.brand" },\n  { id: "b", zone: "rail.end" },\n];\n',
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.policies[0]?.receipts).toContainEqual({ kind: "population", source: "CHROME_ZONES", members: 4, unresolved: 0 });
  expect(result.authority.effectiveFindings).toMatchObject([
    { policyId: "no-parallel-section-map", token: "personas" },
    { policyId: "no-parallel-section-map", token: '"rail.brand"' },
  ]);
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

function passOf(
  policy: GatePolicy,
  files: Readonly<Record<string, string>>,
  grants: Parameters<typeof runPolicyPass>[0]["reviewedGrants"] = [],
): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project, reviewedGrants: grants, failOnWarnings: false });
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

// ---------------------------------------------------------------------------------------------------
// §4.3 GRANT IDENTITY for `config-anchor-in-registry` (cb-v-unaudited-finals L4). Its authority IS the
// central reviewed-grant table and it carries TWO live rows — the config JUMP and the scroll SPY, both
// readers of anchors rather than painters of one. Nothing proved those rows behave: `verifyPolicyProofs`
// runs with `reviewedGrants: []`, so a module row structurally cannot key a grant at all, and the string
// `config-anchor-stamp` occurred in exactly two files on the tree (the gate and the grant table) and in no
// test. The four verdicts that make a row honest are pinned here, on the real policy.
// ---------------------------------------------------------------------------------------------------
const ANCHOR_REGISTRY_HOME = "packages/client/src/state/config-section-registry.ts";
const ANCHOR_PRELUDE = {
  [ANCHOR_REGISTRY_HOME]:
    "export interface ConfigSectionContribution { readonly id: string }\nexport function configAnchorId(group: string, sub: string): string {\n  return `${group}-${sub}`;\n}\n",
  "packages/client/src/features/a/lib/a-section.tsx":
    'import type { ConfigSectionContribution } from "../../../state/config-section-registry.ts";\nimport { ASection } from "../components/a-section.tsx";\nexport const aSection: ConfigSectionContribution = { id: "a", body: () => <ASection /> };\n',
  "packages/client/src/features/a/components/a-section.tsx":
    'import { configAnchorId } from "../../../state/config-section-registry.ts";\nexport const ASection = (): unknown => configAnchorId("a", "one");\n',
} as const;

const ANCHOR_READER = "packages/client/src/features/config/lib/config-jump.ts";
const ANCHOR_GRANT = {
  id: "config-anchor-in-registry:proof",
  policyId: "config-anchor-in-registry",
  subject: ANCHOR_READER,
  operation: "config-anchor-stamp",
  why: "the proof's stand-in for the live config-jump row — a READER of anchors, which owns no config row",
  endsWhen: "the pin stops re-deriving an anchor id",
};
/** Two anchor reads in ONE reader file: the live `config-jump.ts` has exactly this shape. */
const TWO_READS =
  'import { configAnchorId } from "../../../state/config-section-registry.ts";\nexport const jump = (g: string): unknown => [configAnchorId(g, "one"), configAnchorId(g, "two")];\n';

test("the config-anchor grant licenses its exact subject/operation and is consumed EXACTLY ONCE, even with two anchor reads", () => {
  const granted = passOf(configAnchorInRegistry, { ...ANCHOR_PRELUDE, [ANCHOR_READER]: TWO_READS }, [ANCHOR_GRANT]);

  expect(granted.toolErrors).toEqual([]);
  expect(granted.authority.effectiveFindings).toEqual([]);
  expect(granted.authority.grantedFindings).toHaveLength(1);
  // ONE consumption for two reads. The policy keeps the FIRST stamp per path, so a file is one licensed
  // act however many times it re-derives an anchor — two consumptions under one row would be OVER-BROAD,
  // and an over-broad row licenses NOTHING.
  expect(granted.authority.reviewedGrantConsumption).toEqual([{ id: ANCHOR_GRANT.id, count: 1 }]);
  expect(granted.authority.authorityAlarms).toEqual([]);
});

test("a config-anchor grant keyed on the WRONG operation licenses nothing", () => {
  const mismatched = passOf(configAnchorInRegistry, { ...ANCHOR_PRELUDE, [ANCHOR_READER]: TWO_READS }, [{ ...ANCHOR_GRANT, operation: "config-anchor-read" }]);

  expect(mismatched.authority.effectiveFindings).toHaveLength(1);
  expect(mismatched.authority.authorityAlarms).toMatchObject([{ kind: "stale-reviewed-grant", grantId: ANCHOR_GRANT.id }]);
});

test("a config-anchor grant keyed on a subject that no longer stamps is STALE", () => {
  // The reader was registered as a real contribution, so it paints a row instead of merely reading one and
  // its permission is spent. That is exactly the rot the row's `endsWhen` promises to catch.
  const stale = passOf(
    configAnchorInRegistry,
    {
      ...ANCHOR_PRELUDE,
      [ANCHOR_READER]:
        'import type { ConfigSectionContribution } from "../../../state/config-section-registry.ts";\nimport { configAnchorId } from "../../../state/config-section-registry.ts";\nexport const jumpSection: ConfigSectionContribution = { id: "j", body: () => configAnchorId("j", "one") };\n',
    },
    [ANCHOR_GRANT],
  );

  expect(stale.authority.effectiveFindings).toEqual([]);
  expect(stale.authority.authorityAlarms).toMatchObject([{ kind: "stale-reviewed-grant", grantId: ANCHOR_GRANT.id }]);
});

test("the grant's operation is a CONSTANT, so an ALIASED mint in the granted subject consumes the same row", () => {
  // `mustFlag[1]` proves the alias is the same stamp; this proves the LICENCE follows it. Keyed on the
  // local spelling the row would miss, the finding would stand and the permission would alarm stale.
  const aliased = passOf(
    configAnchorInRegistry,
    {
      ...ANCHOR_PRELUDE,
      [ANCHOR_READER]:
        'import { configAnchorId as anchor } from "../../../state/config-section-registry.ts";\nexport const jump = (g: string): unknown => anchor(g, "one");\n',
    },
    [ANCHOR_GRANT],
  );

  expect(aliased.authority.effectiveFindings).toEqual([]);
  expect(aliased.authority.reviewedGrantConsumption).toEqual([{ id: ANCHOR_GRANT.id, count: 1 }]);
  expect(aliased.authority.authorityAlarms).toEqual([]);
});
