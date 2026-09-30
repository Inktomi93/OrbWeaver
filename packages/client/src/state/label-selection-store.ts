// The Corpus Labels selection: which tag the Labels finder has open in the CONTENT editor. Not persisted — a
// reload lands on the tag library, like the other Corpus drills.

import type { TagId } from "@orb/kit/ids";
import { createDrillSelectionStore } from "./create-drill-selection-store.ts";
import { createGatedStore } from "./create-gated-store.ts";

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

// The tag whose Name field takes focus when its editor mounts: set by a create, cleared by the editor once
// it has focused. Beside the selection because the two are written together, in that order.
const useLabelNameFocusStore = createGatedStore<{ readonly tagId: TagId | null }>("label-name-focus", () => ({ tagId: null }));

/** Ask the editor for `tagId` to focus its Name field when it mounts (`null` clears the request). */
export function setLabelNameFocus(tagId: TagId | null): void {
  useLabelNameFocusStore.setState({ tagId }, false, "label-name-focus/set");
}
/** Reactive: the tag whose editor owes its Name field focus, if any. */
export function useLabelNameFocus(): TagId | null {
  return useLabelNameFocusStore((s) => s.tagId);
}
