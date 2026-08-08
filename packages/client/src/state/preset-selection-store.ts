// The preset-SELECTION store (W10 Panel A · UI-Arch §4.2 rule 1: LIST selection drives CONTENT). Holds
// which preset the Presets section has open (CONTENT renders its tabbed editor, else the teaching welcome)
// + which rack SECTION the CONTEXT inspector shows (The Assembly §2.2). Its own per-section concern,
// remembered independently. A secondary-drill `createDrillSelectionStore` with the LIST/CONTEXT overlay
// dual-writes (not persisted — landing back on the section welcome after a hard reload is fine).

import type { PresetId } from "@orb/kit/ids";
import { createDrillSelectionStore } from "./create-drill-selection-store.ts";

// The rack section id is a preset-config-local string (not a `@orb/kit/ids` entity id).
const presetSelection = createDrillSelectionStore<PresetId, string>("preset-selection", { secondary: true });

// The Prompt view's section DRILL axis (§5.2) — which section's consolidated EDITOR the center paints. Its
// OWN store, NOT the SELECTION above (§16 row 19: DRILL implies SELECT, never the reverse — one id cannot
// serve both) and NOT the local component state it used to be. The built-in's copy-on-write retarget swaps
// `selectPreset` → the keyed `PresetForm` session remounts the WHOLE editor mid-edit, and a LOCAL drill id
// died there, dumping the author from the section editor to the top of the rack mid-sentence — the SAME
// F-2 fork-eject the Actions-tab template drill (`preset-template-selection-store.ts`) already fixed by
// homing its drill on a store axis. The section id survives the fork VERBATIM — the server copies the
// submitted config, ids intact (`domain/preset/verbs/update.ts`) — so re-anchoring "the forked preset's
// same section" is the plain read-back, exactly as the registry-id template drill re-anchors. Device-
// transient, never persisted.
const presetSectionDrill = createDrillSelectionStore<string>("preset-section-drill");

/** Open a preset (a library-row click) — CONTENT swaps to its tabbed editor; a stale section is cleared. */
export const selectPreset = presetSelection.select;
/** Open a preset from the LIST AND close any open LIST slide-over (no-op when the LIST is docked). */
export const selectPresetFromList = presetSelection.selectFromList;
/** Clear the selection (back to the Presets welcome state). Clears the section too. */
export const __resetPresetSelection = presetSelection.clear;
/** Select a rack section — a row's name-button click reveals the CONTEXT section inspector (§2.2/§3.4). */
export const selectPresetSection = presetSelection.selectSecondary;
/** Clear the section selection — CONTEXT collapses to its EmptyState (also fired on section delete). */
export const __resetPresetSection = presetSelection.clearSecondary;
/** Dismiss the CONTEXT section inspector AND close any open CONTEXT slide-over (no-op when docked). */
export const __dismissPresetSectionForTest = presetSelection.dismissSecondary;
/** Reactive: the currently-open preset id (`null` = none). A primitive selector (no fresh object). */
export const useSelectedPresetId = presetSelection.usePrimaryId;
/** Reactive: the currently-selected rack section id (`null` = none). A primitive selector. */
export const useSelectedPresetSectionId = presetSelection.useSecondaryId;
/** The section-registry SEAM (`SectionSelection`) — what the SHELL reads for the mobile ONE-SHELL rule. */
export const presetSectionSelection = presetSelection.selection;

/** DRILL into a section's consolidated editor (the rack row's chevron / Enter). The Prompt view also SELECTS
 *  it — one act, two axes. Survives the built-in's fork-retarget remount because it is store state, not local. */
export const drillPresetSection = presetSectionDrill.select;
/** Close the section drill-in (the Back-to-rack affordance) — the rack stands back up. */
export const closePresetSectionDrill = presetSectionDrill.clear;
/** Reactive: the drilled section id (`null` = the rack is showing). A primitive selector. */
export const useDrilledPresetSectionId = presetSectionDrill.usePrimaryId;
