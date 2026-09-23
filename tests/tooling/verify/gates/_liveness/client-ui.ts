// Real-corpus liveness arms (#2149) for the policies whose declared population is `@client` alone or `@ui`
// alone, each with its own `under`/`notUnder`/`named`/`ext` narrowing — the ones the exact-population chunks
// (`client-app.ts`, `frontend.ts`) left behind (0042's fifth chunk). DATA, collected by the one runner
// (`../real-corpus-liveness-family.suite.repo.int.test.ts`), which loads the structure run's own corpus once
// and runs every arm against it (docs/work/0043).
//
// EACH ARM IS ITS POLICY'S OWN `mustFlag` ROW, TRANSPLANTED ONTO THE REAL TREE: a new file importing the real
// door (`@orb/ui/*`, `#state`, `#data`, `#components`, the installed Base UI and zustand types), the real home a
// tripwire watches rewritten or removed, and the real Base UI anatomy manifest left as it is on disk. Every
// add path and name is this arm's own, because the add arms share one overlaid pass.
import { gate as baseuiAnatomyCompleteness } from "../../../../../tooling/src/verify/gates/baseui-anatomy-completeness.ts";
import { gate as baseuiDerivesNotRespells } from "../../../../../tooling/src/verify/gates/baseui-derives-not-respells.ts";
import { gate as baseuiDerivesNotRespellsHealth } from "../../../../../tooling/src/verify/gates/baseui-derives-not-respells-health.ts";
import { gate as baseuiPortalContainerSeam } from "../../../../../tooling/src/verify/gates/baseui-portal-container-seam.ts";
import { gate as baseuiStateDataAttributes } from "../../../../../tooling/src/verify/gates/baseui-state-data-attributes.ts";
import { gate as boundFieldViaHook } from "../../../../../tooling/src/verify/gates/bound-field-via-hook.ts";
import { gate as busOnDataNoStoreWrite } from "../../../../../tooling/src/verify/gates/bus-on-data-no-store-write.ts";
import { gate as clientCacheSurgeryOnlyInData } from "../../../../../tooling/src/verify/gates/client-cache-surgery-only-in-data.ts";
import { gate as clientStructure } from "../../../../../tooling/src/verify/gates/client-structure.ts";
import { gate as componentSize } from "../../../../../tooling/src/verify/gates/component-size.ts";
import { gate as componentSizeUi } from "../../../../../tooling/src/verify/gates/component-size-ui.ts";
import { gate as emptyStateHasAction } from "../../../../../tooling/src/verify/gates/empty-state-has-action.ts";
import { gate as fetchFnInFeatures } from "../../../../../tooling/src/verify/gates/fetch-fn-in-features.ts";
import { gate as formFactoryForMultifield } from "../../../../../tooling/src/verify/gates/form-factory-for-multifield.ts";
import { gate as listRowAdoption } from "../../../../../tooling/src/verify/gates/list-row-adoption.ts";
import { gate as noEffectOnSharedSelection } from "../../../../../tooling/src/verify/gates/no-effect-on-shared-selection.ts";
import { gate as noExternalMediaWithoutGate } from "../../../../../tooling/src/verify/gates/no-external-media-without-gate.ts";
import { gate as noFormResetInAutosaveHealth } from "../../../../../tooling/src/verify/gates/no-form-reset-in-autosave-health.ts";
import { gate as noInteractiveRoleInFeatures } from "../../../../../tooling/src/verify/gates/no-interactive-role-in-features.ts";
import { gate as noManualAutosaveFlush } from "../../../../../tooling/src/verify/gates/no-manual-autosave-flush.ts";
import { gate as noMultiplexedMutationError } from "../../../../../tooling/src/verify/gates/no-multiplexed-mutation-error.ts";
import { gate as noRawInteractiveIntrinsics } from "../../../../../tooling/src/verify/gates/no-raw-interactive-intrinsics.ts";
import { gate as noRawZustandPersist } from "../../../../../tooling/src/verify/gates/no-raw-zustand-persist.ts";
import { gate as persistPartializeAndTotalMigrate } from "../../../../../tooling/src/verify/gates/persist-partialize-and-total-migrate.ts";
import { gate as registryAssemblyAtDoorOnly } from "../../../../../tooling/src/verify/gates/registry-assembly-at-door-only.ts";
import { gate as selectionStoreViaFactory } from "../../../../../tooling/src/verify/gates/selection-store-via-factory.ts";
import { gate as settingsSectionAnchored } from "../../../../../tooling/src/verify/gates/settings-section-anchored.ts";
import { gate as skinFragmentTierHealth } from "../../../../../tooling/src/verify/gates/skin-fragment-tier-health.ts";
import { gate as skinFragmentTierPermission } from "../../../../../tooling/src/verify/gates/skin-fragment-tier-permission.ts";
import { gate as stateFiles } from "../../../../../tooling/src/verify/gates/state-files.ts";
import { gate as subFloorDisclosureHealth } from "../../../../../tooling/src/verify/gates/sub-floor-disclosure-health.ts";
import { gate as surfaceA11yFocus } from "../../../../../tooling/src/verify/gates/surface-a11y-focus.ts";
import { gate as surfaceInAContainer } from "../../../../../tooling/src/verify/gates/surface-in-a-container.ts";
import { gate as testidLivenessHealth } from "../../../../../tooling/src/verify/gates/testid-liveness-health.ts";
import { gate as uiAccnameSurvivesSpread } from "../../../../../tooling/src/verify/gates/ui-accname-survives-spread.ts";
import { gate as uiPrimitiveOverlayHealth } from "../../../../../tooling/src/verify/gates/ui-primitive-overlay-health.ts";
import { gate as uiPrimitiveStructure } from "../../../../../tooling/src/verify/gates/ui-primitive-structure.ts";
import { gate as uiSkinFragmentPurity } from "../../../../../tooling/src/verify/gates/ui-skin-fragment-purity.ts";
import { gate as uiVariantAxesStamped } from "../../../../../tooling/src/verify/gates/ui-variant-axes-stamped.ts";
import { gate as uiVariantAxesStampedHealth } from "../../../../../tooling/src/verify/gates/ui-variant-axes-stamped-health.ts";
import type { RealCorpusLivenessArm, RealCorpusOverlay } from "../../../../support/real-corpus-liveness.ts";

const CHAT = "packages/client/src/features/chat";
const UI = "packages/ui/src/primitives";
/** Ten lines past the hard 450-line cap both component-size policies enforce. */
const OVER_CAP = Array.from({ length: 460 }, (_, index) => `export const line${String(index)} = ${String(index)};`).join("\n");

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
    policy: baseuiDerivesNotRespellsHealth,
    // A seal re-typing Select.Root's two-argument `onValueChange` with one argument.
    overlays: [
      add(
        `${UI}/select/liveness-handler-seal.tsx`,
        'import { Select as BaseSelect } from "@base-ui/react/select";\nexport interface LivenessHandlerSealProps {\n  onValueChange?: (value: string) => void;\n}\nexport const LivenessHandlerSeal = (p: LivenessHandlerSealProps) => <BaseSelect.Root {...p} />;\n',
      ),
    ],
    messageIncludes: "DROPS 1 of its 2 arguments",
  },
  {
    policy: baseuiDerivesNotRespells,
    // A seal re-spelling a data prop Select.Root already declares.
    overlays: [
      add(
        `${UI}/select/liveness-prop-seal.tsx`,
        'import { Select as BaseSelect } from "@base-ui/react/select";\nexport interface LivenessPropSealProps {\n  disabled?: boolean;\n}\nexport const LivenessPropSeal = (p: LivenessPropSealProps) => <BaseSelect.Root {...p} />;\n',
      ),
    ],
    messageIncludes: "hand-writes a data prop",
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
    policy: baseuiStateDataAttributes,
    // A seal deriving a className from React state Base UI already publishes as `data-open`.
    overlays: [
      add(
        `${UI}/popover/liveness-state-seal.tsx`,
        'import { Popover as BasePopover } from "@base-ui/react/popover";\nimport { useState } from "react";\nexport function LivenessStateSeal() {\n  const [open] = useState(false);\n  return <BasePopover.Popup className={open ? "a" : "b"} />;\n}\n',
      ),
    ],
    messageIncludes: "already publishes as a `data-*` attribute",
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
    policy: componentSizeUi,
    overlays: [add(`${UI}/liveness-big/big.tsx`, OVER_CAP)],
    messageIncludes: "cap 450",
  },
  {
    policy: componentSize,
    overlays: [add(`${CHAT}/lib/liveness-big.ts`, OVER_CAP)],
    messageIncludes: "cap 450",
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
    policy: fetchFnInFeatures,
    overlays: [add(`${CHAT}/lib/liveness-load.ts`, 'export async function livenessLoad(): Promise<unknown> {\n  return await fetch("/api/liveness");\n}\n')],
    messageIncludes: "NEVER writes fetch",
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
    policy: noExternalMediaWithoutGate,
    overlays: [add(`${CHAT}/components/liveness-media.tsx`, 'export const LivenessMedia = <img src="bad" alt="" />;\n')],
    messageIncludes: "raw <img>",
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
    policy: noRawInteractiveIntrinsics,
    overlays: [add(`${CHAT}/components/liveness-button.tsx`, 'export const LivenessButton = (): unknown => <button type="button">Go</button>;\n')],
    messageIncludes: "raw interactive intrinsic",
  },
  {
    policy: noRawZustandPersist,
    overlays: [
      add(
        `${CHAT}/lib/liveness-store.ts`,
        'import { create } from "zustand";\nimport { persist } from "zustand/middleware";\nexport const useLivenessStore = create(persist(() => ({}), { name: "liveness" }));\n',
      ),
    ],
    messageIncludes: "raw zustand persistence",
  },
  {
    policy: persistPartializeAndTotalMigrate,
    // The mint factory's own persist() options, losing both irreversibility guards.
    overlays: [
      neutralise(
        "packages/client/src/state/create-persisted-store.ts",
        'import { persist } from "zustand/middleware";\nexport const s = persist(() => ({}), { version: 1 });\n',
      ),
    ],
    messageIncludes: "missing partialize, migrate",
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
    policy: skinFragmentTierHealth,
    overlays: [{ kind: "remove", path: "packages/ui/src/lib/" }],
    messageIncludes: "packages/ui/src/lib/",
  },
  {
    policy: skinFragmentTierPermission,
    // A REVIEWED-GRANT fold, as for the pointer and z-index tiers: the home's skin fragments fold into one
    // candidate the central grant licenses. The real home already spells fragments on many low lines, so the
    // planted fragment sits on line 77, past every real site: the fold's sorted site list can end in 77 only
    // if it read this file.
    overlays: [
      add(
        "packages/ui/src/lib/_liveness-skin.ts",
        `${"export const probe = 1;\n"}${"\n".repeat(75)}export const livenessSkin = "bg-backdrop focus-visible:ring-2";\n`,
      ),
    ],
    messageIncludes: ", 77.",
    granted: true,
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
    policy: uiSkinFragmentPurity,
    // The homed `OVERLAY_ARROW` fragment (packages/ui/src/lib/overlay-arrow.ts) re-spelled outside lib/.
    overlays: [add(`${UI}/liveness-arrow/variants.ts`, 'export const livenessOverlay = { arrow: "size-row rotate-45 border border-border bg-popover" };\n')],
    messageIncludes: "hand-spells a homed skin fragment",
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
