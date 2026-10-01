// The Corpus Labels selection: which tag the Labels finder has open in the CONTENT editor. Not persisted — a
// reload lands on the tag library, like the other Corpus drills.

import type { TagId } from "@orb/kit/ids";
import { createDrillSelectionStore } from "./create-drill-selection-store.ts";

const labelSelection = createDrillSelectionStore<TagId>("label-selection");

/** Open a tag in the Labels editor (a create, or a library fact's door). */
export const selectLabel = labelSelection.select;
/** Open a tag from a finder row, releasing an open LIST slide-over. */
export const selectLabelFromList = labelSelection.selectFromList;
/** Close the editor and return to the tag library. */
export const clearLabelSelection = labelSelection.clear;
/** Reactive: the open tag id (`null` = the tag library). */
export const useSelectedLabelId = labelSelection.usePrimaryId;
/** The Labels mode's drill seam, composed into the Corpus section selection. */
export const labelDrillSelection = labelSelection.selection;

/** Release a deleted label only while it still owns the editor. */
export function labelDeleted(id: TagId): void {
  if (labelSelection.getPrimaryId() === id) {
    labelSelection.clear();
  }
}
