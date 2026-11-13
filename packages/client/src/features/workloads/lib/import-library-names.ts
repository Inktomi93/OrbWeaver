// The names the library import section prints. A zero-import leaf, so a spec's node side reads them without loading the
// component graph.

/** The folder picker's visible trigger. */
export const IMPORT_FOLDER_NAME = "Import a folder…";

/** The verb every staged-import question opens with; the question names the preflight group. */
export const IMPORT_PREFLIGHT_LEAD = "Import";

/** The staged-import question: a picked folder by the files the plan sends, one file by its name, or several files. */
export function importFolderPreflightTitle(files: number): string {
  return `${IMPORT_PREFLIGHT_LEAD} ${String(files)} file${files === 1 ? "" : "s"} from the folder you picked?`;
}
export function importFilePreflightTitle(name: string): string {
  return `${IMPORT_PREFLIGHT_LEAD} “${name}”?`;
}
export function importFilesPreflightTitle(count: number): string {
  return `${IMPORT_PREFLIGHT_LEAD} ${String(count)} files?`;
}

/** The staged question when nothing in a picked folder can be imported. */
export const IMPORT_FOLDER_NOTHING_TITLE = "Nothing in the folder you picked can be imported";

/** The finished import summary's first tally, always shown. */
export function importSummaryImported(count: number): string {
  return `${String(count)} imported`;
}

/** The group that holds the import's progress, which takes focus when the import starts. */
export const IMPORT_PROGRESS_NAME = "Import progress";

/** The region that holds an import's outcome, whether it finished or was refused. */
export const IMPORT_RESULT_NAME = "Import result";

/** The first sentence of the section's intro. */
export const IMPORT_INTRO_LEAD = "Restore a backup, or bring your SillyTavern library over.";

/** The drop zone for a backup zip or a single card. */
export const IMPORT_FILE_PICKER_NAME = "Import a backup or card file";

/** The button that clears a finished import for the next one. */
export const IMPORT_ANOTHER_NAME = "Import another";

/** The preflight's dry-run report. */
export const IMPORT_PREVIEW_REPORT_NAME = "What this import would bring";

/** The dry-run report's names disclosure, closed and open. */
export const IMPORT_PREVIEW_SHOW_NAMES = "Show names";
export const IMPORT_PREVIEW_HIDE_NAMES = "Hide names";

/** The label over one profile's names, shown when an upload holds several profiles. */
export function importPreviewProfileLabel(profile: string): string {
  return `Profile ${profile}`;
}

/** The count line's note for entries of a folder sent in several uploads that could not be checked against the other
 *  uploads: some may already be there, or be counted twice. */
export function importPreviewUncomparedNote(count: number): string {
  return `${String(count)} not compared with the other uploads, so the count may be high`;
}

/** Why a folder's dry run failed, by what the request met. */
export const IMPORT_PREVIEW_FAILURE = {
  unreachable: "Could not reach the server.",
  busy: "Another import is still finishing.",
  tooLarge: "This folder is too large to preview.",
  serverFailed: "The server could not read this folder.",
  refused: "The server did not accept this folder for a preview.",
} as const;

/** The words of a plan note that counts the files a folder import leaves behind. */
export const IMPORT_LEFT_ON_DISK_PHRASE = "will stay on your disk";

/** The persona review's answer-all buttons. */
export const COLLISION_MERGE_ALL_NAME = "Merge all";
export const COLLISION_KEEP_ALL_NAME = "Keep all";

/** The titles of a persona collision's two answers. */
export const COLLISION_MERGE_TITLE = "Merge into your existing persona";
export const COLLISION_KEEP_BOTH_TITLE = "Keep both";
