// Real-corpus liveness arms (#2149) for the policies whose declared population is exactly `@client` — the
// largest set that shares one population (0042's first chunk). DATA, collected by the one runner
// (`../real-corpus-liveness-family.suite.repo.int.test.ts`), which loads the structure run's own corpus once
// and runs every arm against it (docs/work/0043).
//
// EACH ARM IS ITS POLICY'S OWN `mustFlag` ROW, TRANSPLANTED ONTO THE REAL TREE. The row's fixture stubs its
// neighbours (a one-line `SectionDefinition`, a declared `QueryBoundary`); here the neighbours are the real
// ones, so an overlay spells its imports the way real client code does (`#state`, `#lib`, `#components`,
// `@orb/kit/ids`) and the policy must reach the violation through the corpus verify actually loads. Every
// ADD path is new and sits where the policy's population admits it; the verdict substring is the row's own
// `messageIncludes` where it has one and the policy's message otherwise.
import { gate as chromeRegistryCompleteness } from "../../../../../tooling/src/verify/gates/chrome-registry-completeness.ts";
import { gate as configAnchorInRegistry } from "../../../../../tooling/src/verify/gates/config-anchor-in-registry.ts";
import { gate as configGroupCompleteness } from "../../../../../tooling/src/verify/gates/config-group-completeness.ts";
import { gate as contextDefinitionShape } from "../../../../../tooling/src/verify/gates/context-definition-shape.ts";
import { gate as contextDefinitionShapeHealth } from "../../../../../tooling/src/verify/gates/context-definition-shape-health.ts";
import { gate as dialogViaComposite } from "../../../../../tooling/src/verify/gates/dialog-via-composite.ts";
import { gate as homeTileRegistryCompleteness } from "../../../../../tooling/src/verify/gates/home-tile-registry-completeness.ts";
import { gate as modalBodyNotPlaceholder } from "../../../../../tooling/src/verify/gates/modal-body-not-placeholder.ts";
import { gate as modalRegistryCompleteness } from "../../../../../tooling/src/verify/gates/modal-registry-completeness.ts";
import { gate as noArrayLiteralQuerykey } from "../../../../../tooling/src/verify/gates/no-array-literal-querykey.ts";
import { gate as noFakeDisabledId } from "../../../../../tooling/src/verify/gates/no-fake-disabled-id.ts";
import { gate as noFormResetInAutosave } from "../../../../../tooling/src/verify/gates/no-form-reset-in-autosave.ts";
import { gate as noInlineInvalidateOutsideSeam } from "../../../../../tooling/src/verify/gates/no-inline-invalidate-outside-seam.ts";
import { gate as noMutatingRegisterApi } from "../../../../../tooling/src/verify/gates/no-mutating-register-api.ts";
import { gate as noParallelSectionMap } from "../../../../../tooling/src/verify/gates/no-parallel-section-map.ts";
import { gate as noPointerVariantsInFeatures } from "../../../../../tooling/src/verify/gates/no-pointer-variants-in-features.ts";
import { gate as persistedStoreRegistry } from "../../../../../tooling/src/verify/gates/persisted-store-registry.ts";
import { gate as persistenceBoundary } from "../../../../../tooling/src/verify/gates/persistence-boundary.ts";
import { gate as placeholderCopyRegistry } from "../../../../../tooling/src/verify/gates/placeholder-copy-registry.ts";
import { gate as pointerCapabilityTierHealth } from "../../../../../tooling/src/verify/gates/pointer-capability-tier-health.ts";
import { gate as pointerCapabilityTierPermission } from "../../../../../tooling/src/verify/gates/pointer-capability-tier-permission.ts";
import { gate as queryBoundaryReservation } from "../../../../../tooling/src/verify/gates/query-boundary-reservation.ts";
import { gate as queryBoundaryReservationHealth } from "../../../../../tooling/src/verify/gates/query-boundary-reservation-health.ts";
import { gate as queryFreshnessCoverage } from "../../../../../tooling/src/verify/gates/query-freshness-coverage.ts";
import { gate as queryFreshnessCoverageDebt } from "../../../../../tooling/src/verify/gates/query-freshness-coverage-debt.ts";
import { gate as queryFreshnessCoverageHealth } from "../../../../../tooling/src/verify/gates/query-freshness-coverage-health.ts";
import { gate as registryContextViaMint } from "../../../../../tooling/src/verify/gates/registry-context-via-mint.ts";
import { gate as renderErrorViaBattery } from "../../../../../tooling/src/verify/gates/render-error-via-battery.ts";
import { gate as routeImportsNoFeature } from "../../../../../tooling/src/verify/gates/route-imports-no-feature.ts";
import { gate as sectionFactoryContributionBundle } from "../../../../../tooling/src/verify/gates/section-factory-contribution-bundle.ts";
import { gate as sectionRegistryCompleteness } from "../../../../../tooling/src/verify/gates/section-registry-completeness.ts";
import { gate as sessionChannelBoundary } from "../../../../../tooling/src/verify/gates/session-channel-boundary.ts";
import { gate as sessionChannelBoundaryHealth } from "../../../../../tooling/src/verify/gates/session-channel-boundary-health.ts";
import { gate as staleDraftCommit } from "../../../../../tooling/src/verify/gates/stale-draft-commit.ts";
import { gate as testidTypedOnly } from "../../../../../tooling/src/verify/gates/testid-typed-only.ts";
import { gate as windowedInfiniteQuery } from "../../../../../tooling/src/verify/gates/windowed-infinite-query.ts";
import { gate as zustandSelectorDerived } from "../../../../../tooling/src/verify/gates/zustand-selector-derived.ts";
import type { RealCorpusLivenessArm, RealCorpusOverlay } from "../../../../support/real-corpus-liveness.ts";

const CHAT_LIB = "packages/client/src/features/chat/lib";
const CHAT_COMPONENTS = "packages/client/src/features/chat/components";

function add(path: string, source: string): RealCorpusOverlay {
  return { kind: "add", path, source };
}

/** A QueryBoundary mount carrying `reserveKey`, as the workloads sections spell theirs. */
function reservedBoundary(name: string): string {
  return `import { QueryBoundary } from "#components";\nexport const ${name} = () => <QueryBoundary fallback={null} reserveKey="liveness.dup">{"b"}</QueryBoundary>;\n`;
}

export const CLIENT_APP_ARMS: readonly RealCorpusLivenessArm[] = [
  {
    policy: chromeRegistryCompleteness,
    // A real `ChromeEntry` declared outside a `*-chrome` file — the co-location arm.
    overlays: [
      add(
        `${CHAT_LIB}/liveness-not-a-chrome-file.ts`,
        'import type { ChromeEntry } from "#state";\nexport const livenessChrome: ChromeEntry = { id: "liveness", label: "Liveness", zone: "topbar.trail", behavior: { kind: "modal", modalId: "settings" } };\n',
      ),
    ],
    messageIncludes: "Not co-located",
  },
  {
    policy: configAnchorInRegistry,
    // A component stamps a config anchor that no ConfigSectionContribution renders.
    overlays: [
      add(
        `${CHAT_COMPONENTS}/liveness-orphan-section.tsx`,
        'import { configAnchorId } from "#state";\nexport const LivenessOrphanSection = (): unknown => configAnchorId("chats", "liveness");\n',
      ),
    ],
    messageIncludes: "features/chat/components/liveness-orphan-section.tsx",
  },
  {
    policy: configGroupCompleteness,
    // A real `ConfigGroupDefinition` declared outside a `*-group` file.
    overlays: [
      add(
        `${CHAT_LIB}/liveness-not-a-group-file.ts`,
        'import type { ConfigGroupDefinition } from "#state";\nexport const livenessGroup: ConfigGroupDefinition = { id: "liveness" };\n',
      ),
    ],
    messageIncludes: "Not co-located",
  },
  {
    policy: contextDefinitionShapeHealth,
    // The real tree mints no `defineContextRegion` at all, so two claimants at once is the SECOND call site —
    // and with a count verdict both are reported.
    overlays: [
      add(
        "packages/client/src/features/rpg/lib/liveness-a-hud-region.tsx",
        'import { defineContextRegion } from "#lib";\nexport const a = defineContextRegion({ id: "a", claims: () => true, band: () => null });\n',
      ),
      add(
        "packages/client/src/features/crew/lib/liveness-b-hud-region.tsx",
        'import { defineContextRegion } from "#lib";\nexport const b = defineContextRegion({ id: "b", claims: () => true, band: () => null });\n',
      ),
    ],
    messageIncludes: "SECOND `defineContextRegion(` call site",
  },
  {
    policy: contextDefinitionShape,
    // A hand-rolled tabs renderer outside the mint.
    overlays: [add(`${CHAT_LIB}/liveness-context-section.tsx`, 'export const badgeMint = { kind: "tabs", useResolved: () => null };\n')],
    messageIncludes: "useResolved",
  },
  {
    policy: dialogViaComposite,
    overlays: [
      add(
        `${CHAT_COMPONENTS}/liveness-dialog.tsx`,
        'import { Dialog, DialogPopup } from "@orb/ui/dialog";\nexport const X = () => <Dialog><DialogPopup /></Dialog>;\n',
      ),
    ],
    messageIncludes: "raw `Dialog` root",
  },
  {
    policy: homeTileRegistryCompleteness,
    overlays: [
      add(
        `${CHAT_LIB}/liveness-not-a-tile-file.ts`,
        'import type { HomeTileContribution } from "#state";\nexport const livenessTile: HomeTileContribution = { id: "liveness", body: () => null };\n',
      ),
    ],
    messageIncludes: "Not co-located",
  },
  {
    policy: modalBodyNotPlaceholder,
    // A co-located modal whose function body renders the placeholder — the DECLARED-PLANNED arm is the only
    // legal unbuilt modal.
    overlays: [
      add(
        `${CHAT_LIB}/liveness-modal.tsx`,
        'import type { ModalDefinition } from "#state";\nimport { SectionPlaceholder } from "../../app-shell/components/section-placeholder.tsx";\nexport const livenessModal: ModalDefinition = { id: "liveness", body: () => <SectionPlaceholder /> };\n',
      ),
    ],
    messageIncludes: "Placeholder body",
  },
  {
    policy: modalRegistryCompleteness,
    overlays: [
      add(
        `${CHAT_LIB}/liveness-not-a-modal-file.ts`,
        'import type { ModalDefinition } from "#state";\nexport const livenessModal: ModalDefinition = { id: "liveness", body: { planned: "liveness" } };\n',
      ),
    ],
    messageIncludes: "Not co-located",
  },
  {
    policy: noArrayLiteralQuerykey,
    overlays: [add(`${CHAT_LIB}/liveness-query-key.ts`, 'export const q = { queryKey: ["liveness", 1] };\n')],
    messageIncludes: "inline array-literal queryKey",
  },
  {
    policy: noFakeDisabledId,
    // The empty-string branded id, minted through the real kit door the client already uses.
    overlays: [add(`${CHAT_LIB}/liveness-fake-id.ts`, 'import { castId } from "@orb/kit/ids";\nexport const disabled = castId("");\n')],
    messageIncludes: "empty-string branded id",
  },
  {
    policy: noFormResetInAutosave,
    overlays: [
      add(
        "packages/client/src/features/persona/liveness-autosave.ts",
        'import { createAutosaveEntityForm } from "#forms/editor";\nexport function f(personaForm: { reset: (v?: unknown) => void }): void {\n  void createAutosaveEntityForm;\n  personaForm.reset();\n}\n',
      ),
    ],
    messageIncludes: "isDirty-never-clears",
  },
  {
    policy: noInlineInvalidateOutsideSeam,
    overlays: [
      add(
        `${CHAT_LIB}/liveness-invalidate.ts`,
        'import { useQueryClient } from "@tanstack/react-query";\nexport function run(): void {\n  void useQueryClient().invalidateQueries();\n}\n',
      ),
    ],
    messageIncludes: "inline `invalidateQueries` call outside the central seam",
  },
  {
    policy: noMutatingRegisterApi,
    overlays: [add("packages/client/src/lib/liveness-register.ts", "export const registry = {\n  register(id: string): void {\n    void id;\n  },\n};\n")],
    messageIncludes: "mutating `register()`-named",
  },
  {
    policy: noParallelSectionMap,
    // Two real SectionIds keyed in a hand-written literal — the parallel map the registry replaces.
    overlays: [add(`${CHAT_LIB}/liveness-panel-defaults.ts`, "export const M = {\n  chats: { list: 1 },\n  characters: { list: 2 },\n};\n")],
    messageIncludes: "per-id object literal re-declares",
  },
  {
    policy: noPointerVariantsInFeatures,
    overlays: [add(`${CHAT_COMPONENTS}/liveness-pointer.tsx`, 'export const x = <div className="pointer-coarse:hidden" />;\n')],
    messageIncludes: "pointer/hover capability variant",
  },
  {
    policy: persistedStoreRegistry,
    overlays: [
      add(
        "packages/client/src/state/liveness-store.ts",
        'import { createPersistedStore } from "./create-persisted-store.ts";\nexport const s = createPersistedStore("liveness-unregistered", () => ({}), { version: 1 });\n',
      ),
    ],
    messageIncludes: "liveness-unregistered",
  },
  {
    policy: persistenceBoundary,
    overlays: [add(`${CHAT_LIB}/liveness-storage.ts`, 'export const read = (): string | null => localStorage.getItem("k");\n')],
    messageIncludes: "outside the persistence doors",
  },
  {
    policy: placeholderCopyRegistry,
    // A co-located section repeating the real `chats` section's placeholder copy word for word.
    overlays: [
      add(
        `${CHAT_LIB}/liveness-section.tsx`,
        'import type { SectionDefinition } from "#state";\nexport const livenessSection: SectionDefinition = { id: "liveness", placeholder: { title: "Chats", description: "Your conversations live here — pick a thread from your chats, or start a new one." } };\n',
      ),
    ],
    messageIncludes: "Duplicate copy",
  },
  {
    policy: pointerCapabilityTierHealth,
    // The subject is PRESENCE: the reviewed shell home exists while feature files do. Overwriting its files
    // would leave them present, so the whole home leaves the corpus.
    overlays: [{ kind: "remove", path: "packages/client/src/features/app-shell/" }],
    messageIncludes: "missing reviewed pointer-capability home",
  },
  {
    policy: pointerCapabilityTierPermission,
    // A REVIEWED-GRANT policy: it folds every capability site in the shell home into ONE candidate the central
    // grant licenses, so on the real tree it speaks only as a granted finding. The fold anchors on the home's
    // first file; this path sorts before every real one, so the licensed report lands where the arm looks, and
    // its site list (`line(s): …`) names line 3 only if the fold read this file's two capability variants —
    // line 1 is the file anchor itself (the policy's zero-hit candidate), so a fold that saw no variant says
    // `line(s): 1.`.
    overlays: [
      add(
        "packages/client/src/features/app-shell/_liveness-pointer.tsx",
        'export const probe = 1;\n\nexport const x = <><div className="pointer-coarse:hidden" /><div className="pointer-fine:block" /></>;\n',
      ),
    ],
    messageIncludes: "line(s): 1, 3.",
    granted: true,
  },
  {
    policy: queryBoundaryReservationHealth,
    overlays: [add(`${CHAT_COMPONENTS}/liveness-dup-1.tsx`, reservedBoundary("G")), add(`${CHAT_COMPONENTS}/liveness-dup-2.tsx`, reservedBoundary("H"))],
    messageIncludes: "duplicate reserveKey",
  },
  {
    policy: queryBoundaryReservation,
    overlays: [
      add(
        `${CHAT_COMPONENTS}/liveness-unkeyed.tsx`,
        'import { QueryBoundary } from "#components";\nimport { SkeletonRows } from "#data";\nexport const G = () => <QueryBoundary fallback={<SkeletonRows count={3} shape="line" />}>{"b"}</QueryBoundary>;\n',
      ),
    ],
    messageIncludes: "STATIC count and no `reserveKey`",
  },
  {
    policy: queryFreshnessCoverageDebt,
    // A second consumer of the one debt key the policy tracks. The debt reports ONCE, at the key's first
    // consumer, so this path sorts before the real `room-activity-log.tsx`. The read is spelled as real client
    // code spells it: `trpc` bound from `useTRPC()`, then the chain.
    overlays: [
      add(
        "packages/client/src/features/automation/components/activity-liveness.tsx",
        'import { useTRPC } from "#data";\nexport function useActivity() {\n  const trpc = useTRPC();\n  return trpc.automation.listChatActivity.queryOptions({ chatId: "c", limit: 1 });\n}\n',
      ),
    ],
    messageIncludes: "automation.listChatActivity lacks",
  },
  {
    policy: queryFreshnessCoverageHealth,
    // The anchor interface stays; the factory the coverage side reads is gone.
    overlays: [
      {
        kind: "neutralise",
        path: "packages/client/src/data/invalidation.ts",
        source: "export interface Invalidation {\n  readonly invalidate: () => void;\n}\n",
      },
    ],
    messageIncludes: "createInvalidation is absent",
  },
  {
    policy: queryFreshnessCoverage,
    overlays: [
      add(
        `${CHAT_COMPONENTS}/liveness-frozen.tsx`,
        'import { useTRPC } from "#data";\nexport function useFrozen() {\n  const trpc = useTRPC();\n  return trpc.liveness.frozenRead.queryOptions({});\n}\n',
      ),
    ],
    messageIncludes: "zero reachable invalidation rows",
  },
  {
    policy: registryContextViaMint,
    overlays: [
      add(
        "packages/client/src/state/liveness-registry-context.ts",
        'import { createContext } from "react";\nimport type { Registry } from "#lib";\nexport const C = createContext<Registry<string, number> | null>(null);\n',
      ),
    ],
    messageIncludes: "createRegistryContext",
  },
  {
    policy: renderErrorViaBattery,
    overlays: [
      add(
        `${CHAT_COMPONENTS}/liveness-render-error.tsx`,
        'import { QueryBoundary } from "#components";\nexport const G = () => <QueryBoundary renderError={() => <span>failed</span>}>{"b"}</QueryBoundary>;\n',
      ),
    ],
    messageIncludes: "hand-rolled `renderError`",
  },
  {
    policy: routeImportsNoFeature,
    overlays: [add("packages/client/src/routes/liveness-route.tsx", 'import { ChatListSurface } from "#features/chat";\nexport const G = ChatListSurface;\n')],
    messageIncludes: "#features/chat",
  },
  {
    policy: sectionFactoryContributionBundle,
    // A section factory with TWO positional contributor registries — the real `makeChatsSection` takes one
    // named-field bundle.
    overlays: [
      add(
        `${CHAT_LIB}/liveness-factory-section.tsx`,
        'import type { ContributorRegistry } from "#lib";\nimport type { SectionDefinition } from "#state";\nexport function makeLivenessSection(contextTabs: ContributorRegistry<{ readonly id: string }>, regions: ContributorRegistry<{ readonly id: string }>): SectionDefinition {\n  void contextTabs;\n  void regions;\n  return { id: "liveness", placeholder: { title: "Liveness", description: "A liveness probe." } };\n}\n',
      ),
    ],
    messageIncludes: "ContributorRegistry parameters",
  },
  {
    policy: sectionRegistryCompleteness,
    overlays: [
      add(
        `${CHAT_LIB}/liveness-not-a-section-file.ts`,
        'import type { SectionDefinition } from "#state";\nexport const livenessSection: SectionDefinition = { id: "liveness", placeholder: { title: "Liveness", description: "A liveness probe." } };\n',
      ),
    ],
    messageIncludes: "Not co-located",
  },
  {
    policy: sessionChannelBoundaryHealth,
    overlays: [{ kind: "neutralise", path: "packages/client/src/lib/session-channel.ts", source: "export function postSessionMessage(): void {}\n" }],
    messageIncludes: "constructs no BroadcastChannel",
  },
  {
    policy: sessionChannelBoundary,
    overlays: [add(`${CHAT_LIB}/liveness-sync.ts`, 'export const rogue = new BroadcastChannel("liveness:sync");\n')],
    messageIncludes: "ONE typed home",
  },
  {
    policy: staleDraftCommit,
    overlays: [
      add(
        `${CHAT_COMPONENTS}/liveness-cell.tsx`,
        'import { useState } from "react";\nexport function Cell({ source, onEdit }: { source: string; onEdit: (v: string) => void }) {\n  const [draft, setDraft] = useState(source);\n  const commit = () => {\n    if (draft !== source) {\n      onEdit(draft);\n    }\n  };\n  return draft.length + (setDraft ? 0 : 1) + (commit ? 0 : 1);\n}\n',
      ),
    ],
    messageIncludes: "once-seeded draft",
  },
  {
    policy: testidTypedOnly,
    overlays: [add("packages/client/src/components/liveness-testid.tsx", "export const A = () => <div data-testid='liveness' />;\n")],
    messageIncludes: "freeform data-testid",
  },
  {
    policy: windowedInfiniteQuery,
    overlays: [
      add(
        `${CHAT_LIB}/liveness-windowed.ts`,
        'import { useTRPC } from "#data";\nexport const useWindowed = () =>\n  useTRPC().chat.list.infiniteQueryOptions(\n    { limit: 30 },\n    { maxPages: 5, getNextPageParam: (p) => p.nextCursor, getPreviousPageParam: () => undefined },\n  );\n',
      ),
    ],
    messageIncludes: "ARMS: no-rewind.",
  },
  {
    policy: zustandSelectorDerived,
    overlays: [
      add(
        "packages/client/src/state/liveness-selector.ts",
        "declare const useXStore: (sel: (s: { a: number; b: number }) => unknown) => unknown;\nexport const v = useXStore((s) => ({ a: s.a, b: s.b }));\n",
      ),
    ],
    messageIncludes: "DERIVATION: object literal.",
  },
];
