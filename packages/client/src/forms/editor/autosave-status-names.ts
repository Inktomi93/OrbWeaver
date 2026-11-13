// The words the shared autosave readout prints. A zero-import leaf, so a spec's node side reads them without loading the
// component graph.

/** A settled save. */
export const AUTOSAVE_SAVED_TEXT = "Saved";

/** A write in flight. */
export const AUTOSAVE_SAVING_TEXT = "Saving…";

/** A refused or failed write; the readout appends a full stop and a Retry door when a retry can succeed. */
export const AUTOSAVE_SAVE_FAILED_TEXT = "Save failed";

/** What a draft restored over a refused save leads with, before it says it is not saved. */
export const AUTOSAVE_RESTORED_LEAD = "Restored draft";

/** The restored draft's door back to saving. */
export const AUTOSAVE_RESUME_NAME = "Resume saving";
