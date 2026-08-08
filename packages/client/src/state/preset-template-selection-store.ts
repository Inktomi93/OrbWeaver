// The preset ACTIONS view's TEMPLATE selection (preset-surface-redesign §6.1 / §16 row 23). Which action
// template the Actions readout echoes — the SELECT half of the one-list-grammar the rack rows already speak:
// the row body SELECTS (this store; the readout resolves that template), the trailing chevron DRILLS into the
// editor. The two acts were conflated in the Actions list only because the readout had no echo half to select
// toward; D8's resolved preview IS that half, so they diverge here exactly as §6.1 specifies.
//
// Its own store rather than a third field on `preset-selection-store.ts`: that store's secondary slot is the
// rack SECTION id, a different axis on a different view (a template id landing in it would silently un-select
// the Prompt readout's highlighted row on every view switch). Minted through the sanctioned
// `createDrillSelectionStore` door, which G27 (`selection-store-via-factory`) requires of any
// `state/*-selection-store.ts` — primary-only, since a template has no sub-drill.
//
// The id is a plain string (a `TemplateDefId` from the contracts registry): state sits BELOW features in the
// cake, so the vocabulary stays in `features/preset/lib/template-rows.ts` exactly as the rack section id's
// does. Device-transient, never persisted.

import { createDrillSelectionStore } from "./create-drill-selection-store.ts";

const templateSelection = createDrillSelectionStore<string>("preset-template-selection");

/** SELECT an action template (the row body click) — the Actions readout echoes it. */
export const selectPresetTemplate = templateSelection.select;
/** Clear the template selection — the readout falls back to naming no template. */
export const __resetPresetTemplate = templateSelection.clear;
/** Reactive: the selected action-template id (`null` = none picked this session). A primitive selector. */
export const useSelectedPresetTemplateId = templateSelection.usePrimaryId;

// The DRILL axis (the Actions-tab IA §2.6) — which template's EDITOR is open. A second factory-minted store
// rather than component state, because the state's whole job is surviving a remount the component cannot:
// the built-in's copy-on-write retarget swaps `selectPreset` → the keyed `PresetForm` session remounts the
// entire editor → a LOCAL drill id died and dumped the author at the top of the 67-row list mid-sentence.
// The drilled id is a REGISTRY id (never preset-scoped), so re-anchoring "the forked preset's same slot" is
// the plain read-back. Its own axis rather than a second slot on the selection above: DRILL implies SELECT
// (the view writes both — side-eye F-2's rule), but SELECT must never imply drill, so one id cannot serve.
const templateDrill = createDrillSelectionStore<string>("preset-template-drill");

/** DRILL into a template's editor (the row chevron). The view also SELECTS it — one act, two axes. */
export const drillPresetTemplate = templateDrill.select;
/** Close the drill-in (the Back affordance) — the list stands back up. */
export const closePresetTemplateDrill = templateDrill.clear;
/** Reactive: the drilled template id (`null` = the list is showing). */
export const useDrilledPresetTemplateId = templateDrill.usePrimaryId;
