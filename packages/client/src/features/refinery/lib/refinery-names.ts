// The accessible names the Refinery context tabs print. A zero-import leaf, so a spec's node side reads them without
// loading the component graph.

/** The context pane's version history tab. */
export const REFINERY_VERSIONS_NAME = "Versions";
export const REFINERY_HAND_EDIT_NAME = "Hand-edit";
export const REFINERY_ITERATE_NAME = "Iterate";
export const REFINERY_SAVE_AS_COPY_NAME = "Save as copy";
export const REFINERY_SESSION_STATE_NAME = "Session state";
export const REFINERY_SEARCH_SESSIONS_NAME = "Search sessions by character or name";
/** The list band's start control, and its entry in the band's overflow menu. */
export const REFINERY_START_SESSION_NAME = "Start a new session";
export const REFINERY_EDIT_SCOPE_NAME = "Edit scope";
/** What the Hand-edit dialog says when the scope holds no field to edit. */
export const REFINERY_HAND_EDIT_EMPTY_SCOPE = "Nothing is in scope, so there is nothing to hand-edit. Choose fields under Edit scope, then come back.";
export const REFINERY_COMPARE_NAME = "Compare";
export const REFINERY_HIDE_COMPARE_NAME = "Hide compare";

/** A version row's own label: what it prints and what its actions are named for. `qualifier` tells apart versions that share a label. */
export function refineryVersionRowLabel(label: string, qualifier?: string): string {
  return qualifier === undefined ? label : `${label} ${qualifier}`;
}

/** The compare toggle's visible verb for its current state. */
export function refineryCompareVerb(comparing: boolean): string {
  return comparing ? REFINERY_HIDE_COMPARE_NAME : REFINERY_COMPARE_NAME;
}

/** A version row's compare toggle for its current state, named for the version it compares. */
export function refineryCompareToggleName(comparing: boolean, label: string, qualifier?: string): string {
  return `${refineryCompareVerb(comparing)} ${refineryVersionRowLabel(label, qualifier)}`;
}

/** The sessions list's empty state before any session exists. */
export const REFINERY_NO_SESSIONS_TITLE = "No refinery sessions yet";

/** The context pane's run history tab, its resting tab. */
export const REFINERY_RUNS_TAB_LABEL = "Runs";

/** The Context pane's setup tab. */
export const REFINERY_SETUP_TAB_LABEL = "Setup";

/** The versions tab's compare heading and its pending read. */
export const REFINERY_VERSION_DIFF_HEADING = "description: this version vs live";
export const REFINERY_VERSION_LOADING_TEXT = "Loading that version…";

/** What a version row calls a snapshot that carries no label. */
export const REFINERY_UNLABELED_VERSION = "unlabeled";

/** A version row's Restore, named for the version it restores; `qualifier` tells apart versions that share a label. */
export function refineryRestoreVersionName(label: string, qualifier?: string): string {
  return `Restore ${refineryVersionRowLabel(label, qualifier)}`;
}

/** A stage lane's first run. */
export function refineryRunStageName(stage: string): string {
  return `Run ${stage}`;
}

/** A stage lane's run once it has a result. */
export function refineryRerunStageName(stage: string): string {
  return `Re-run ${stage}`;
}

/** The apply row's commit, counting the kept fields it writes. */
export function refineryApplyKeptLabel(count: number): string {
  return `Apply ${String(count)} kept`;
}

/** The apply outcome's note after Save as copy. */
export const REFINERY_COPY_UNTOUCHED_TEXT = "The live card is untouched. No snapshot was needed, nothing existing was written.";

/** The apply outcome's note after an apply that snapshotted the live card first. */
export const REFINERY_SNAPSHOT_TAKEN_TEXT = "Saved a snapshot first. Undo it from the character's History tab.";
