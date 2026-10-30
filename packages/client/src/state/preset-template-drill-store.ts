// The preset ACTIONS view's template DRILL: which action template's editor is open. Its own store beside
// `preset-template-selection-store.ts` because drilling implies selecting but selecting never implies drilling.

import { createDrillSelectionStore } from "./create-drill-selection-store.ts";

// A store, not component state: the copy-on-write fork remounts the editor, and a local drill id would
// return the author to the top of the list. The id is a registry id, so it survives the fork unchanged.
const templateDrill = createDrillSelectionStore<string>("preset-template-drill");

/** DRILL into a template's editor (the row chevron). The view also SELECTS it — one act, two axes. */
export const drillPresetTemplate = templateDrill.select;
/** Close the drill-in (the Back affordance) — the list stands back up. */
export const closePresetTemplateDrill = templateDrill.clear;
/** Reactive: the drilled template id (`null` = the list is showing). */
export const useDrilledPresetTemplateId = templateDrill.usePrimaryId;
