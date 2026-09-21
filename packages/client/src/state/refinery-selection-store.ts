// The refinery section's DRILL selection (R3 — the D62 sessions roster → the pipeline CONTENT). Primary
// = the open session; NO secondary: the stage stepper is in-session UI state, so the phone back gesture
// pops to the roster, never stage-by-stage (the NL design's shell audit). Minted through the ONE
// door (G27 `selection-store-via-factory`); centrally homed so the shell's ONE-SHELL rule reads the
// `selection` seam and a sibling could read the pointer without reaching into the feature.

import type { RefinerySessionId } from "@orb/kit/ids";
import { createDrillSelectionStore } from "./create-drill-selection-store.ts";

const store = createDrillSelectionStore<RefinerySessionId>("refinery-selection");

/** Reactive: the open session id (`null` = the roster/teaching home). */
export const useSelectedRefinerySessionId = store.usePrimaryId;
/** Drill into a session (CONTENT swaps to the pipeline). */
export const selectRefinerySession = store.select;
/** LIST-row click: drill AND close an open roster slide-over (viewport-unaware). */
export const selectRefinerySessionFromList = store.selectFromList;
/** The section-registry seam (`SectionSelection`) — the shell's mobile ONE-SHELL input and its clear door
 *  back to the roster/teaching home. */
export const refinerySectionSelection = store.selection;
