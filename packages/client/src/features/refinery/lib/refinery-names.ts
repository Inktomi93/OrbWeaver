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
/** The lane note row's press that ends a walk back to a superseded run. */
export const REFINERY_BACK_TO_LATEST_NAME = "Back to latest";
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

/** The empty list's start door, whichever control it reaches: the desktop's picker or the start dialog. */
export const REFINERY_PICK_CHARACTER_NAME = "Pick a character";

/** The context pane's run history tab, its resting tab. */
export const REFINERY_RUNS_TAB_LABEL = "Runs";

/** The Context pane's setup tab. */
export const REFINERY_SETUP_TAB_LABEL = "Setup";

/** The versions tab's compare heading and its pending read. */
export const REFINERY_VERSION_DIFF_HEADING = "description: this version vs live";
export const REFINERY_VERSION_LOADING_TEXT = "Loading that version…";

/** The session list's pending status while its read is held. */
export const REFINERY_LIST_LOADING_NAME = "Loading your sessions…";

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

/** The verbs on a review row's decision buttons. The row's own label follows each in the button's name. */
export const REFINERY_KEEP_VERB = "Keep";
export const REFINERY_KEEP_CLEARING_VERB = "Keep (empties field)";
export const REFINERY_REOPEN_VERB = "Reopen";

/** The Keep verb of a row, by whether keeping it empties its field. */
export function refineryKeepVerb(emptiesField: boolean): string {
  return emptiesField ? REFINERY_KEEP_CLEARING_VERB : REFINERY_KEEP_VERB;
}

/** The screen-reader tail of an undecided row's open button, after the row's label. */
export const REFINERY_SHOW_CHANGE_TAIL = "show this change";

/** The line beside the diverged chip: what each decision does once the live card moved under the session. */
export const REFINERY_RECONFIRM_NOTE = "re-confirm which version wins: Keep uses the rewrite, Discard keeps the live text";

/** The state note of a rewrite that appends a greeting. */
export const REFINERY_GREETING_ADDED_NOTE = "A new greeting is added at the end. No existing greeting is touched.";

/** The verb of a run row's View door. */
export const REFINERY_VIEW_RUN_VERB = "View";

/** A run row's View door, by the run's label. */
export function refineryViewRunName(runLabel: string): string {
  return `${REFINERY_VIEW_RUN_VERB} ${runLabel}`;
}

/** The verbs of a rewrite run's apply door, by whether the run is already the one armed. */
export const REFINERY_USE_FOR_APPLY_VERB = "Use for apply";
export const REFINERY_USE_LATEST_VERB = "Use latest instead";

export function refineryUseRunVerb(armed: boolean): string {
  return armed ? REFINERY_USE_LATEST_VERB : REFINERY_USE_FOR_APPLY_VERB;
}

/** A rewrite run's apply door, by the run's label. */
export function refineryUseRunName(armed: boolean, runLabel: string): string {
  return `${refineryUseRunVerb(armed)}: ${runLabel}`;
}

/** The masthead's door back to the card, by the card's name. */
export function refineryOpenCardName(cardName: string): string {
  return `Open card ${cardName} in the Characters section`;
}

/** The scope chips' group and the scope dialog's title. */
export const REFINERY_SCOPE_NAME = "Scope";

/** The Hand-edit dialog's toggle that empties one slot. */
export function refineryEmptySlotLabel(slotLabel: string): string {
  return `Empty ${slotLabel}`;
}

/** The schema designer's two fields, its test card picker and its test press. */
export const REFINERY_SCHEMA_DESCRIBE_NAME = "Describe the structure";
export const REFINERY_SCHEMA_JSON_NAME = "Schema (JSON: the full vocabulary)";
export const REFINERY_SCHEMA_NAME_FIELD_NAME = "Name";
/** The two draft-authoring rows above the JSON pane: the arm picker and the refine instruction. */
export const REFINERY_FORGE_ARM_NAME = "How to build it";
export const REFINERY_REFINE_DRAFT_NAME = "Refine the draft";
/** The render-hint picker beside the JSON pane: its role select and the press that writes the hint. */
export const REFINERY_RENDER_HINT_ROLE_NAME = "Render hint role";
export const REFINERY_INSERT_RENDER_HINT_NAME = "Insert render hint";
export const REFINERY_PICK_TEST_CARD_NAME = "Pick a card to test on";
export const REFINERY_TEST_ON_CARD_NAME = "Test on this card";

/** The test press's name while a test is running. */
export const REFINERY_TEST_RUNNING_NAME = "Running…";

/** The test press's name, by whether a test is running. */
export function refineryTestOnCardLabel(running: boolean): string {
  return running ? REFINERY_TEST_RUNNING_NAME : REFINERY_TEST_ON_CARD_NAME;
}

/** The picker's name on the empty sessions state's start door and on the list band's popover. */
export const REFINERY_START_SESSION_PICKER_NAME = "Start a refinery session";

/** The runs tab's empty state and its door back to the run controls. */
export const REFINERY_NO_RUNS_TITLE = "No runs yet";
export const REFINERY_GO_TO_SCORE_NAME = "Go to Score";

/** The sessions list's note when a search matches no session. */
export const REFINERY_NO_SESSION_MATCH_TEXT = "No sessions match that search.";

/** The Original card dialog's title and its note under the card's name. */
export const REFINERY_ORIGINAL_CARD_TITLE = "Original card: pinned at session start";
export const REFINERY_ORIGINAL_CARD_NOTE = "Read-only authored fields pinned when this session started. Macros are shown as written.";

/** The versions tab's empty state. */
export const REFINERY_NO_VERSIONS_TITLE = "No versions yet";

/** The diverged review's three panes: the pinned base, the live text and the rewrite Keep applies. */
export const REFINERY_CONFLICT_PANE_LABELS = {
  base: "Base: the session pin",
  live: "Live: changed under the session",
  rewrite: "Rewrite: what Keep applies",
} as const;

/** What each versions read is called in its failure line, `queryFailedLabel(REFINERY_READ_LABELS.x)`. */
export const REFINERY_READ_LABELS = {
  versions: "this card's versions",
  version: "that version",
} as const;
