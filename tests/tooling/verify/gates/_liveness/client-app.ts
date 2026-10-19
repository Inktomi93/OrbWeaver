// Real-corpus liveness arms (#2149) for the policies whose declared population is exactly `@client` — the
// largest set that shares one population (0042's first chunk). DATA, collected by the one runner
// (`./runner.ts`), which loads each isolated structure corpus once
// and runs every arm against it (docs/work/0043).
//
// EACH ARM IS ITS POLICY'S OWN `mustFlag` ROW, TRANSPLANTED ONTO THE REAL TREE. The row's fixture stubs its
// neighbours (a one-line `SectionDefinition`, a declared `QueryBoundary`); here the neighbours are the real
// ones, so an overlay spells its imports the way real client code does (`#state`, `#lib`, `#components`,
// `@orb/kit/ids`) and the policy must reach the violation through the corpus verify actually loads. Every
// ADD path is new and sits where the policy's population admits it; the verdict substring is the row's own
// `messageIncludes` where it has one and the policy's message otherwise.

import type { RealCorpusLivenessArm, RealCorpusOverlay } from "@orb/testkit/node/real-corpus-liveness.ts";
import { gate as contextDefinitionShape } from "../../../../../tooling/src/verify/gates/context-definition-shape.ts";
import { gate as contextDefinitionShapeHealth } from "../../../../../tooling/src/verify/gates/context-definition-shape-health.ts";
import { gate as noFormResetInAutosave } from "../../../../../tooling/src/verify/gates/no-form-reset-in-autosave.ts";

import { gate as persistenceBoundary } from "../../../../../tooling/src/verify/gates/persistence-boundary.ts";
import { gate as queryBoundaryReservation } from "../../../../../tooling/src/verify/gates/query-boundary-reservation.ts";
import { gate as queryBoundaryReservationHealth } from "../../../../../tooling/src/verify/gates/query-boundary-reservation-health.ts";
import { gate as queryFreshnessCoverage } from "../../../../../tooling/src/verify/gates/query-freshness-coverage.ts";
import { gate as renderErrorViaBattery } from "../../../../../tooling/src/verify/gates/render-error-via-battery.ts";
import { gate as sectionFactoryContributionBundle } from "../../../../../tooling/src/verify/gates/section-factory-contribution-bundle.ts";
import { gate as sessionChannelBoundary } from "../../../../../tooling/src/verify/gates/session-channel-boundary.ts";
import { gate as staleDraftCommit } from "../../../../../tooling/src/verify/gates/stale-draft-commit.ts";
import { gate as windowedInfiniteQuery } from "../../../../../tooling/src/verify/gates/windowed-infinite-query.ts";

const CHAT_LIB = "packages/client/src/features/chat/lib";
const CHAT_COMPONENTS = "packages/client/src/features/chat/components";

/** Every add arm here shares ONE overlaid pass with the others, so each definition carries its OWN id and
 *  copy: two arms minting the same id would make each other's registry policies report a duplicate, and
 *  the runner's entanglement detector would send both to a solo pass. */
function add(path: string, source: string): RealCorpusOverlay {
  return { kind: "add", path, source };
}

/** A QueryBoundary mount carrying `reserveKey`, as the workloads sections spell theirs. */
function reservedBoundary(name: string): string {
  return `import { QueryBoundary } from "#components";\nexport const ${name} = () => <QueryBoundary fallback={null} reserveKey="liveness.dup">{"b"}</QueryBoundary>;\n`;
}

export const CLIENT_APP_ARMS: readonly RealCorpusLivenessArm[] = [
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
    // A loose projection bypasses the canonical published context state.
    overlays: [
      add(
        `${CHAT_LIB}/liveness-context-section.tsx`,
        'import { defineContextTabs } from "#lib";\nexport const context = defineContextTabs<any>({ tabs: [tab] });\n',
      ),
    ],
    messageIncludes: "O5 strict",
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
    policy: persistenceBoundary,
    overlays: [add(`${CHAT_LIB}/liveness-storage.ts`, 'export const read = (): string | null => localStorage.getItem("k");\n')],
    messageIncludes: "outside the persistence doors",
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
        'import { QueryBoundary } from "#components";\nimport { SkeletonRows } from "#data";\nconst ROWS = 3;\nexport const G = () => <QueryBoundary fallback={<SkeletonRows count={ROWS} shape="line" />}>{"b"}</QueryBoundary>;\n',
      ),
    ],
    messageIncludes: "STATIC count and no `reserveKey`",
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
    policy: sectionFactoryContributionBundle,
    // A section factory with TWO positional contributor registries — the real `makeChatsSection` takes one
    // named-field bundle.
    overlays: [
      add(
        `${CHAT_LIB}/liveness-factory-section.tsx`,
        'import type { ContributorRegistry } from "#lib";\nimport type { SectionDefinition } from "#state";\nexport function makeLivenessSection(contextTabs: ContributorRegistry<{ readonly id: string }>, regions: ContributorRegistry<{ readonly id: string }>): SectionDefinition {\n  void contextTabs;\n  void regions;\n  return { id: "liveness-factory", placeholder: { title: "Liveness factory", description: "A factory liveness probe." } };\n}\n',
      ),
    ],
    messageIncludes: "ContributorRegistry parameters",
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
    policy: windowedInfiniteQuery,
    overlays: [
      add(
        `${CHAT_LIB}/liveness-windowed.ts`,
        'import { useTRPC } from "#data";\nexport const useWindowed = () =>\n  useTRPC().chat.list.infiniteQueryOptions(\n    { limit: 30 },\n    { maxPages: 5, getNextPageParam: (p) => p.nextCursor, getPreviousPageParam: () => undefined },\n  );\n',
      ),
    ],
    messageIncludes: "ARMS: no-rewind.",
  },
];
