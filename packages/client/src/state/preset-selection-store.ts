// The preset-SELECTION store (W10 Panel A · UI-Arch §4.2 rule 1: LIST selection drives CONTENT). Holds
// which preset the Presets section has open (CONTENT renders its tabbed editor, else the teaching welcome)
// + which rack SECTION the CONTEXT inspector shows (The Assembly §2.2). Its own per-section concern,
// remembered independently. A secondary-drill `createDrillSelectionStore` with the LIST/CONTEXT overlay
// dual-writes (not persisted — landing back on the section welcome after a hard reload is fine).

import type { PresetId } from "@orb/kit/ids";
import { createDrillSelectionStore } from "./create-drill-selection-store";

// The rack section id is a preset-config-local string (not a `@orb/kit/ids` entity id).
const presetSelection = createDrillSelectionStore<PresetId, string>("preset-selection", { secondary: true });

/** Open a preset (a library-row click) — CONTENT swaps to its tabbed editor; a stale section is cleared. */
export const selectPreset = presetSelection.select;
/** Open a preset from the LIST AND close any open LIST slide-over (no-op when the LIST is docked). */
export const selectPresetFromList = presetSelection.selectFromList;
/** Clear the selection (back to the Presets welcome state). Clears the section too. */
export const clearPresetSelection = presetSelection.clear;
/** Select a rack section — a row's name-button click reveals the CONTEXT section inspector (§2.2/§3.4). */
export const selectPresetSection = presetSelection.selectSecondary;
/** Clear the section selection — CONTEXT collapses to its EmptyState (also fired on section delete). */
export const clearPresetSection = presetSelection.clearSecondary;
/** Dismiss the CONTEXT section inspector AND close any open CONTEXT slide-over (no-op when docked). */
export const dismissPresetSection = presetSelection.dismissSecondary;
/** Reactive: the currently-open preset id (`null` = none). A primitive selector (no fresh object). */
export const useSelectedPresetId = presetSelection.usePrimaryId;
/** Reactive: the currently-selected rack section id (`null` = none). A primitive selector. */
export const useSelectedPresetSectionId = presetSelection.useSecondaryId;
