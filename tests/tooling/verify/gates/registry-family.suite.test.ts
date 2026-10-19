import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as messageKindPolicyCoverage } from "../../../../tooling/src/verify/gates/message-kind-policy-coverage.ts";
import { gate as modalBodyNotPlaceholder } from "../../../../tooling/src/verify/gates/modal-body-not-placeholder.ts";
import { gate as modalRegistryCompleteness } from "../../../../tooling/src/verify/gates/modal-registry-completeness.ts";
import { gate as placeholderCopyRegistry } from "../../../../tooling/src/verify/gates/placeholder-copy-registry.ts";
import { gate as sectionFactoryContributionBundle } from "../../../../tooling/src/verify/gates/section-factory-contribution-bundle.ts";
import { gate as warningCodeCoverage } from "../../../../tooling/src/verify/gates/warning-code-coverage.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { isolatedTypeFacts, verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

const ROOT = "/registry-family";

test("registry definition policies keep their founding and nearest-legal fixtures", () => {
  expect(
    verifyPolicyProofs([
      messageKindPolicyCoverage,
      modalBodyNotPlaceholder,
      modalRegistryCompleteness,
      placeholderCopyRegistry,
      sectionFactoryContributionBundle,
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
    nativeTypeFacts: () => isolatedTypeFacts(project),
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
  for (const [path, source] of Object.entries(DUPLICATE_COPY_PAIR)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }

  const result = runPolicyPass({
    knownPolicies: [modalRegistryCompleteness, placeholderCopyRegistry],
    policies: [modalRegistryCompleteness, placeholderCopyRegistry],
    root: ROOT,
    project,
    nativeTypeFacts: () => isolatedTypeFacts(project),
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
  expect(result.authority.effectiveFindings).toMatchObject([{ policyId: "placeholder-copy-registry", token: "bSection" }]);
});

// RE-POINTED 2026-09-20 (#2497): the provider warning channel's home and emit scope left
// `packages/server/src/infra/providers/` for the `@orb/inference` package at 77bf95dc18. A fixture under
// the OLD directory admits zero paths, so `WARNING_CODES` resolved zero members and this policy's own
// receipt refused on every pass here — which also silently emptied the three withholding cases below
// (their `stringContaining("CHAT_WARNING_CODES")` still matched a refusal naming BOTH channels).
const PROVIDER_HOME = "packages/inference/src/contract/resolve.ts";
const PROVIDER_EMIT = "packages/inference/src/resolve-chat.ts";
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
    nativeTypeFacts: () => isolatedTypeFacts(project),
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

// ---------------------------------------------------------------------------------------------------
// §4.5 refusal pin for the registry-family policy whose denominator was sound but UNPINNED
// (gate-runtime audit wave 2 D6). It is an INVENTED row, so it carries a planted-break receipt in
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
  return runPolicyPass({
    knownPolicies: [policy],
    policies: [policy],
    root: ROOT,
    project,
    nativeTypeFacts: () => isolatedTypeFacts(project),
    reviewedGrants: grants,
    failOnWarnings: false,
  });
}

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
// THE §4.5 REFUSAL PINS for the registry consumer that had none (#2327, the
// `policy-refusal-coverage` warning debt): `modal-body-not-placeholder`. It derives its whole denominator
// from a per-kind `registryDefinitionFacts` provider, and until now nothing drove it through the dispatcher — the
// family's existing pins cover `section-factory-contribution-bundle`, `modal-registry-completeness` and
// `placeholder-copy-registry`, and a pin binds to the module it DRIVES.
//
// WHERE THE REFUSAL LIVES, and it is not where the resource consumers' is. A registry fact publishes no
// status union: since #1962 the provider receipts the sources it WALKED and always succeeds, so the
// blindness door is the CONSUMER's own `members: view.definitions.length` receipt — a receipt-phase tool
// error ("resolved zero members"), the owner withheld, no finding. That is one status with TWO causes,
// and this pair pins both because the policy cannot tell them apart and must not try: the registry TYPE
// renamed out from under the reader, and a corpus that honestly authors no definition. A verdict over
// zero definitions would be a clean pass over an empty denominator either way.
// ---------------------------------------------------------------------------------------------------

const MODAL_TYPE_HOME = "packages/client/src/state/modal-registry.ts";
const MODAL_TYPE = "export interface ModalDefinition { readonly id: string }\n";
const MODAL_PLACEHOLDER = {
  "packages/client/src/features/app-shell/components/section-placeholder.tsx": "export function SectionPlaceholder(): null {\n  return null;\n}\n",
} as const;
const REAL_MODAL = {
  "packages/client/src/features/settings/lib/theme-modal.tsx":
    'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nexport const themeModal: ModalDefinition = { id: "theme", body: () => null };\n',
} as const;

test("modal-body-not-placeholder: a RENAMED ModalDefinition withholds instead of finding no placeholder bodies", () => {
  const renamed = passOf(modalBodyNotPlaceholder, {
    [MODAL_TYPE_HOME]: "export interface ModalContribution { readonly id: string }\n",
    ...MODAL_PLACEHOLDER,
    ...REAL_MODAL,
  });

  expect(renamed.factErrors).toEqual([]);
  expect(renamed.toolErrors).toMatchObject([
    { policyId: "modal-body-not-placeholder", phase: "receipt", message: expect.stringContaining("resolved zero members") },
  ]);
  expect(renamed.authority.withheldPolicyIds).toEqual(["modal-body-not-placeholder"]);
  expect(renamed.authority.effectiveFindings).toEqual([]);
});

test("modal-body-not-placeholder: a corpus that registers NO modal refuses on the same door", () => {
  const none = passOf(modalBodyNotPlaceholder, { [MODAL_TYPE_HOME]: MODAL_TYPE, ...MODAL_PLACEHOLDER });

  expect(none.toolErrors).toMatchObject([{ policyId: "modal-body-not-placeholder", phase: "receipt" }]);
  expect(none.authority.withheldPolicyIds).toEqual(["modal-body-not-placeholder"]);
  expect(none.authority.effectiveFindings).toEqual([]);
});

test("modal-body-not-placeholder: the healthy twin reaches a verdict and receipts the census it judged", () => {
  const present = passOf(modalBodyNotPlaceholder, { [MODAL_TYPE_HOME]: MODAL_TYPE, ...MODAL_PLACEHOLDER, ...REAL_MODAL });

  expect(present.toolErrors).toEqual([]);
  expect(present.authority.withheldPolicyIds).toEqual([]);
  expect(present.authority.effectiveFindings).toEqual([]);
  expect(present.policies.map(({ receipts }) => receipts)).toEqual([[{ kind: "population", source: "ModalDefinition", members: 1, unresolved: 0 }]]);
});

test("modal-body-not-placeholder: the twin's silence is a READ — the same modal rendering the placeholder accuses", () => {
  const placeholder = passOf(modalBodyNotPlaceholder, {
    [MODAL_TYPE_HOME]: MODAL_TYPE,
    ...MODAL_PLACEHOLDER,
    "packages/client/src/features/settings/lib/theme-modal.tsx":
      'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nimport { SectionPlaceholder } from "../../app-shell/components/section-placeholder.tsx";\nexport const themeModal: ModalDefinition = { id: "theme", body: () => <SectionPlaceholder /> };\n',
  });

  expect(placeholder.toolErrors).toEqual([]);
  expect(placeholder.authority.effectiveFindings).toMatchObject([{ policyId: "modal-body-not-placeholder", token: "themeModal" }]);
});

test("a mutable alias does not prove that a warning reached the warnings accumulator", () => {
  const result = warningPassOf({
    [PROVIDER_HOME]: PROVIDER_TUPLE,
    [CHAT_HOME]: CHAT_TUPLE,
    [CHAT_EMIT]: CHAT_PUSH,
    [PROVIDER_EMIT]: 'declare const warnings: unknown[]; let sink = warnings; sink = []; sink.push({ code: "provider_ok", message: "elsewhere" });',
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([{ policyId: "warning-code-coverage", token: '"provider_ok"' }]);
});

test("a member named warnings is not the local warnings accumulator through an alias", () => {
  const result = warningPassOf({
    [PROVIDER_HOME]: PROVIDER_TUPLE,
    [CHAT_HOME]: CHAT_TUPLE,
    [CHAT_EMIT]: CHAT_PUSH,
    [PROVIDER_EMIT]: 'declare const bag: { warnings: unknown[] }; const sink = bag.warnings; sink.push({ code: "provider_ok", message: "elsewhere" });',
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([{ policyId: "warning-code-coverage", token: '"provider_ok"' }]);
});

test("a local warnings binding keeps its identity when its initializer is runtime data", () => {
  const result = warningPassOf({
    [PROVIDER_HOME]: PROVIDER_TUPLE,
    [CHAT_HOME]: CHAT_TUPLE,
    [CHAT_EMIT]: CHAT_PUSH,
    [PROVIDER_EMIT]:
      'declare function acquire(): unknown[]; const warnings = acquire(); const sink = warnings; sink.push({ code: "provider_ok", message: "emitted" });',
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
});

test("an imported export-name alias does not invent a local warnings accumulator", () => {
  const result = warningPassOf({
    [PROVIDER_HOME]: PROVIDER_TUPLE,
    [CHAT_HOME]: CHAT_TUPLE,
    [CHAT_EMIT]: CHAT_PUSH,
    "packages/inference/src/foreign.ts": "export const warnings: unknown[] = [];",
    [PROVIDER_EMIT]: 'import { warnings as sink } from "./foreign.ts"; sink.push({ code: "provider_ok", message: "elsewhere" });',
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([{ policyId: "warning-code-coverage", token: '"provider_ok"' }]);
});

test("an unrenamed warnings import does not invent a local warnings accumulator", () => {
  const result = warningPassOf({
    [PROVIDER_HOME]: PROVIDER_TUPLE,
    [CHAT_HOME]: CHAT_TUPLE,
    [CHAT_EMIT]: CHAT_PUSH,
    "packages/inference/src/foreign.ts": "export const warnings: unknown[] = [];",
    [PROVIDER_EMIT]: 'import { warnings } from "./foreign.ts"; warnings.push({ code: "provider_ok", message: "elsewhere" });',
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([{ policyId: "warning-code-coverage", token: '"provider_ok"' }]);
});
