// Real-corpus liveness arms (#2149) for the policies whose declared population is `@client` alone or `@ui`
// alone, each with its own `under`/`notUnder`/`named`/`ext` narrowing — the ones the exact-population chunks
// (`client-app.ts`, `frontend.ts`) left behind (0042's fifth chunk). DATA, collected by the one runner
// (`./runner.ts`), which loads each isolated structure corpus once
// and runs every arm against it (docs/work/0043).
//
// EACH ARM IS ITS POLICY'S OWN `mustFlag` ROW, TRANSPLANTED ONTO THE REAL TREE: a new file importing the real
// door (`@orb/ui/*`, `#state`, `#data`, `#components`, the installed Base UI and zustand types), the real home a
// tripwire watches rewritten or removed, and the real Base UI anatomy manifest left as it is on disk. Every
// add path and name is this arm's own, because the add arms share one overlaid pass.

import type { RealCorpusLivenessArm, RealCorpusOverlay } from "@orb/testkit/node/real-corpus-liveness.ts";
import { gate as baseuiAnatomyCompleteness } from "../../../../../tooling/src/verify/gates/baseui-anatomy-completeness.ts";
import { gate as baseuiPortalContainerSeam } from "../../../../../tooling/src/verify/gates/baseui-portal-container-seam.ts";
import { gate as boundFieldViaHook } from "../../../../../tooling/src/verify/gates/bound-field-via-hook.ts";
import { gate as busOnDataNoStoreWrite } from "../../../../../tooling/src/verify/gates/bus-on-data-no-store-write.ts";
import { gate as clientCacheSurgeryOnlyInData } from "../../../../../tooling/src/verify/gates/client-cache-surgery-only-in-data.ts";
import { gate as clientStructure } from "../../../../../tooling/src/verify/gates/client-structure.ts";
import { gate as emptyStateHasAction } from "../../../../../tooling/src/verify/gates/empty-state-has-action.ts";
import { gate as formFactoryForMultifield } from "../../../../../tooling/src/verify/gates/form-factory-for-multifield.ts";
import { gate as listRowAdoption } from "../../../../../tooling/src/verify/gates/list-row-adoption.ts";
import { gate as noEffectOnSharedSelection } from "../../../../../tooling/src/verify/gates/no-effect-on-shared-selection.ts";
import { gate as noFormResetInAutosaveHealth } from "../../../../../tooling/src/verify/gates/no-form-reset-in-autosave-health.ts";
import { gate as noInteractiveRoleInFeatures } from "../../../../../tooling/src/verify/gates/no-interactive-role-in-features.ts";
import { gate as noManualAutosaveFlush } from "../../../../../tooling/src/verify/gates/no-manual-autosave-flush.ts";
import { gate as noMultiplexedMutationError } from "../../../../../tooling/src/verify/gates/no-multiplexed-mutation-error.ts";
import { gate as registryAssemblyAtDoorOnly } from "../../../../../tooling/src/verify/gates/registry-assembly-at-door-only.ts";
import { gate as selectionStoreViaFactory } from "../../../../../tooling/src/verify/gates/selection-store-via-factory.ts";
import { gate as settingsSectionAnchored } from "../../../../../tooling/src/verify/gates/settings-section-anchored.ts";
import { gate as stateFiles } from "../../../../../tooling/src/verify/gates/state-files.ts";
import { gate as subFloorDisclosureHealth } from "../../../../../tooling/src/verify/gates/sub-floor-disclosure-health.ts";
import { gate as surfaceA11yFocus } from "../../../../../tooling/src/verify/gates/surface-a11y-focus.ts";
import { gate as surfaceInAContainer } from "../../../../../tooling/src/verify/gates/surface-in-a-container.ts";
import { gate as testidLivenessHealth } from "../../../../../tooling/src/verify/gates/testid-liveness-health.ts";
import { gate as uiAccnameSurvivesSpread } from "../../../../../tooling/src/verify/gates/ui-accname-survives-spread.ts";
import { gate as uiPrimitiveOverlayHealth } from "../../../../../tooling/src/verify/gates/ui-primitive-overlay-health.ts";
import { gate as uiPrimitiveStructure } from "../../../../../tooling/src/verify/gates/ui-primitive-structure.ts";
import { gate as uiVariantAxesStamped } from "../../../../../tooling/src/verify/gates/ui-variant-axes-stamped.ts";
import { gate as uiVariantAxesStampedHealth } from "../../../../../tooling/src/verify/gates/ui-variant-axes-stamped-health.ts";

const CHAT = "packages/client/src/features/chat";
const UI = "packages/ui/src/primitives";

function add(path: string, source: string): RealCorpusOverlay {
  return { kind: "add", path, source };
}

function neutralise(path: string, source: string): RealCorpusOverlay {
  return { kind: "neutralise", path, source };
}

export const CLIENT_UI_ARMS: readonly RealCorpusLivenessArm[] = [
  {
    policy: baseuiAnatomyCompleteness,
    // The real manifest rules every Select part `exposed`; with the Select seal gone, none is rendered.
    overlays: [{ kind: "remove", path: `${UI}/select/` }],
    messageIncludes: "no @orb/ui seal renders it",
  },

  {
    policy: baseuiPortalContainerSeam,
    overlays: [
      add(
        `${UI}/dialog/liveness-portal.tsx`,
        'import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nexport interface LivenessPopupProps {\n  className?: string;\n}\nexport const LivenessPortal = (_props: LivenessPopupProps) => (\n  <BaseDialog.Portal>\n    <BaseDialog.Popup />\n  </BaseDialog.Portal>\n);\n',
      ),
    ],
    messageIncludes: "accepts no `container` prop at all",
  },

  {
    policy: boundFieldViaHook,
    overlays: [
      add(
        "packages/client/src/forms/editor/bound-fields/liveness-field.tsx",
        'import { useFieldContext } from "../contexts.ts";\nexport const LivenessField = (): unknown => useFieldContext<string>();\n',
      ),
    ],
    messageIncludes: "useFieldContext",
  },
  {
    policy: busOnDataNoStoreWrite,
    overlays: [
      add("packages/client/src/data/bus/liveness-bus.ts", "export const livenessSub = {\n  onData: () => {\n    useX.setState({ a: 1 });\n  },\n};\n"),
    ],
    messageIncludes: "raw store write",
  },
  {
    policy: clientCacheSurgeryOnlyInData,
    overlays: [
      add(
        `${CHAT}/surfaces/liveness-cache-surface.tsx`,
        'import { useQueryClient } from "@tanstack/react-query";\nexport function LivenessCacheSurface(): void {\n  void useQueryClient().invalidateQueries();\n}\n',
      ),
    ],
    messageIncludes: "outside the client `data/` seam",
  },
  {
    policy: clientStructure,
    // The feature-slice layout is read as a resource tree: a stray module at a built feature's root.
    overlays: [{ kind: "resource", path: `${CHAT}/liveness-stray.ts`, source: "export const stray = 1;\n" }],
    messageIncludes: "stray file",
  },
  {
    policy: emptyStateHasAction,
    overlays: [
      add(
        `${CHAT}/components/liveness-empty.tsx`,
        'import { EmptyState } from "@orb/ui/empty-state";\nexport const LivenessEmpty = (): unknown => <EmptyState title="Nothing here" />;\n',
      ),
    ],
    messageIncludes: "no `action` CTA",
  },
  {
    policy: formFactoryForMultifield,
    overlays: [
      add(
        `${CHAT}/components/liveness-hand-rolled.tsx`,
        "export const LivenessForm = () => (\n  <div>\n    <input value={a} onChange={x} />\n    <input value={b} onChange={y} />\n    <input value={c} onChange={z} />\n  </div>\n);\n",
      ),
    ],
    messageIncludes: "controlled form inputs",
  },
  {
    policy: listRowAdoption,
    overlays: [
      add(
        `${CHAT}/surfaces/liveness-library-surface.tsx`,
        'import { LibrarySurfaceShell } from "#components";\nexport const LivenessLibrarySurface = () => (\n  <LibrarySurfaceShell>\n    {items.map((item) => <div key={item.id} onClick={() => select(item)}>{item.name}</div>)}\n  </LibrarySurfaceShell>\n);\n',
      ),
    ],
    messageIncludes: "outside ListRow/LibraryRow",
  },
  {
    policy: noEffectOnSharedSelection,
    overlays: [
      add(
        `${CHAT}/hooks/use-liveness-effect.ts`,
        'import { useEffect } from "react";\nimport { useActiveChatId } from "#state";\nexport function useLivenessEffect(): void {\n  const chatId = useActiveChatId();\n  useEffect(() => {}, [chatId]);\n}\n',
      ),
    ],
    messageIncludes: "shared-selection pointer",
  },
  {
    policy: noFormResetInAutosaveHealth,
    overlays: [
      neutralise("packages/client/src/forms/editor/autosave-contract.ts", "export interface AutosaveSession {\n  readonly form: { reset: () => void };\n}\n"),
    ],
    messageIncludes: "reset type-strip",
  },
  {
    policy: noInteractiveRoleInFeatures,
    overlays: [
      add(`${CHAT}/components/liveness-role.tsx`, 'import { Row } from "@orb/ui/layout";\nexport const LivenessRole = <Row role="button" tabIndex={0} />;\n'),
    ],
    messageIncludes: "hand-rolled interactive ARIA role",
  },
  {
    policy: noManualAutosaveFlush,
    overlays: [
      add(
        `${CHAT}/lib/liveness-flush.ts`,
        'import type { FormApi } from "@tanstack/form-core";\nexport function livenessAdd(form: FormApi): void {\n  form.pushFieldValue("items", 1);\n  void form.handleSubmit();\n}\n',
      ),
    ],
    messageIncludes: "pushFieldValue",
  },
  {
    policy: noMultiplexedMutationError,
    overlays: [
      add(
        `${CHAT}/components/liveness-errors.tsx`,
        'import type { EntityMutationResult } from "#data";\nexport const livenessError = (a: EntityMutationResult<unknown, unknown>, b: EntityMutationResult<unknown, unknown>): unknown => a.error ?? b.error;\n',
      ),
    ],
    messageIncludes: "multiplexed mutation errors",
  },
  {
    policy: registryAssemblyAtDoorOnly,
    overlays: [
      add(
        `${CHAT}/lib/liveness-registry.ts`,
        'import { createRegistry } from "#lib";\nexport const livenessRegistry = createRegistry("liveness", ["a"], { a: 1 });\n',
      ),
    ],
    messageIncludes: "createRegistry",
  },
  {
    policy: selectionStoreViaFactory,
    overlays: [
      add(
        "packages/client/src/state/liveness-selection-store.ts",
        'import { createGatedStore } from "./create-gated-store.ts";\nexport const useLivenessSelection = createGatedStore<{ id: string | null }>("liveness-selection", () => ({ id: null }));\n',
      ),
    ],
    messageIncludes: "createGatedStore",
  },
  {
    policy: settingsSectionAnchored,
    overlays: [
      add(
        "packages/client/src/features/credentials/components/liveness-keys-section.tsx",
        'import { configAnchorId } from "#state";\nexport const LivenessAnchored = <Section heading="Liveness anchored" id={configAnchorId("connections", "liveness")} />;\nexport const LivenessKeys = <Section heading="Liveness keys"><span>x</span></Section>;\n',
      ),
    ],
    messageIncludes: "heading-bearing <Section>",
  },
  {
    policy: stateFiles,
    overlays: [
      add(
        "packages/client/src/state/liveness-grab-bag.ts",
        "declare const create: (f: () => unknown) => unknown;\nexport const useLivenessA = create(() => ({}));\nexport const useLivenessB = create(() => ({}));\n",
      ),
    ],
    messageIncludes: "minted store handle is exported",
  },
  {
    policy: subFloorDisclosureHealth,
    overlays: [
      neutralise(
        `${UI}/collapsible/variants.ts`,
        "// the text and control size arms used to be spelled here\nexport const collapsibleVariants = { size: { big: {} } };\n",
      ),
    ],
    messageIncludes: "no longer declared",
  },
  {
    policy: surfaceA11yFocus,
    overlays: [add(`${CHAT}/surfaces/liveness-focus-surface.tsx`, "export const LivenessFocusSurface = () => <div>content</div>;\n")],
    messageIncludes: "missing A11y focus restoration",
  },
  {
    policy: surfaceInAContainer,
    // A feature that provides no container of its own: every existing feature's surfaces may be contained by
    // the feature, so the control is a surface in a new one.
    overlays: [
      add(
        "packages/client/src/features/livenessprobe/surfaces/liveness-probe-surface.tsx",
        "export const LivenessProbeSurface = () => <div><ul><li>row</li></ul></div>;\n",
      ),
    ],
    messageIncludes: "sits in no <Container>",
  },
  {
    policy: testidLivenessHealth,
    overlays: [neutralise("packages/client/src/lib/test-ids.ts", 'export const IDS = {\n  appShell: "app-shell",\n} as const;\n')],
    messageIncludes: "read ZERO rows",
  },
  {
    policy: uiAccnameSurvivesSpread,
    overlays: [
      add(
        `${UI}/liveness-accname/liveness-accname.tsx`,
        'export function LivenessStack({ className, items, ...rest }: { className?: string; items: string[]; \'aria-label\'?: string }) {\n  return <div {...rest} aria-label="N people" className={className} data-slot="x" role="group" />;\n}\n',
      ),
    ],
    messageIncludes: "AFTER the caller-props spread",
  },
  {
    policy: uiPrimitiveOverlayHealth,
    overlays: [neutralise(`${UI}/dialog/dialog.tsx`, "export const X = () => <D.Popup />;\n")],
    messageIncludes: ".Backdrop + .Popup",
  },
  {
    policy: uiPrimitiveStructure,
    overlays: [add(`${UI}/liveness-thing/index.ts`, 'export * from "./variants";\n')],
    messageIncludes: "re-exports private variants",
  },
  {
    policy: uiVariantAxesStampedHealth,
    overlays: [
      neutralise(
        "packages/ui/src/lib/variant-attrs.ts",
        'export const AXES = ["variant", "size"] as const;\nexport function variantProps(): string {\n  return "";\n}\n',
      ),
    ],
    messageIncludes: "Missing: the axis tuple",
  },
  {
    policy: uiVariantAxesStamped,
    overlays: [
      add(
        `${UI}/liveness-stamp/variants.ts`,
        'import { tv } from "tailwind-variants";\nexport const livenessVariants = tv({ base: "inline-flex", variants: { size: { sm: "h-control-sm", md: "h-control-md" } } });\n',
      ),
      add(
        `${UI}/liveness-stamp/liveness-stamp.tsx`,
        'import { livenessVariants } from "./variants.ts";\nexport const LivenessStamp = (): unknown => <div className={livenessVariants({ size: "sm" })} />;\n',
      ),
    ],
    messageIncludes: "A1 unstamped:",
  },
];
