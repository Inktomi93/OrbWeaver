// The names the library import section prints. A zero-import leaf, so a spec's node side reads them without loading the
// component graph.

import type { ImportReuse, ProfileZipRefusal } from "@orb/contracts/import";

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

/** The line under the drop zone's instructions: what each kind of file it takes carries. */
export const IMPORT_DROPZONE_HINT = "A .zip carries a whole library or SillyTavern profile; a .png / .json is a single card";

/** The refused zip's one action: leave the preflight and pick again. */
export const IMPORT_PICK_ANOTHER_NAME = "Pick another file";

/** The preflight's question once its file is refused: the group's name, with nothing left to answer. */
export function importFileRefusedTitle(name: string): string {
  return `“${name}” cannot be imported`;
}

/** The button that clears a finished import for the next one. */
export const IMPORT_ANOTHER_NAME = "Import another";

/** The preflight's dry-run report. */
export const IMPORT_PREVIEW_REPORT_NAME = "What this import would bring";

/** The dry-run report's names disclosure, closed and open. */
export const IMPORT_PREVIEW_SHOW_NAMES = "Show names";
export const IMPORT_PREVIEW_HIDE_NAMES = "Hide names";

/** The scrolling region that holds a preview's names. */
export const IMPORT_PREVIEW_NAMES_REGION = "Names in this preview";

/** The label over one profile's names, shown when an upload holds several profiles. */
export function importPreviewProfileLabel(profile: string): string {
  return `Profile ${profile}`;
}

/** What a run does with one of a preset's own regex scripts: add it, reuse the owner's copy, or reuse the copy an
 *  earlier preset of the same import adds. A refused script's verdict is {@link importPreviewScriptRefused}. */
export const IMPORT_PREVIEW_SCRIPT_VERDICTS = {
  added: "new",
  library: "already in your library",
  upload: "added by an earlier preset here",
} as const satisfies Readonly<Record<ImportReuse | "added", string>>;

/** The verdict of a script the run refuses, with the write door's reason. */
export function importPreviewScriptRefused(reason: string): string {
  return `not imported: ${reason}`;
}

/** A preset's names-panel line for its own regex scripts, each already carrying its verdict. */
export function importPreviewPresetScriptsLine(preset: string, scripts: readonly string[]): string {
  return `${preset}, regex scripts: ${scripts.join(", ")}`;
}

/** One script on that line, with its verdict. */
export function importPreviewScriptEntry(name: string, verdict: string): string {
  return `${name} (${verdict})`;
}

/** A preset's names-panel line for the fields the run does not keep, each with why. */
export function importPreviewPresetLeftOutLine(preset: string, fields: readonly { readonly field: string; readonly reason: string }[]): string {
  return `${preset}, left out: ${fields.map(({ field, reason }) => `${field} (${reason})`).join("; ")}`;
}

/** A card's names-panel line for the handle it takes because another card of its profile already held the one its file name gives. */
export function importPreviewCollidedHandleLine(card: string, handle: string): string {
  return `${card}, imports under the handle ${handle}: another card already holds the handle its file name gives`;
}

/** A card's names-panel line for the chat folders that join it by the name match, no folder carrying the card's exact name. */
export function importPreviewPairedFoldersLine(card: string, folders: readonly string[]): string {
  return `${card}, chat folders joined by name: ${folders.join(", ")}`;
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

/** Why a zip was refused, by the reason the server named: what the file is and what to do with it. */
export const IMPORT_ZIP_REFUSAL: Record<ProfileZipRefusal, string> = {
  empty: "This file is empty. Zip your SillyTavern folder again and pick the new zip.",
  truncated: "This zip is cut short, likely an unfinished download or copy. Copy or download it again, then pick it.",
  "other-archive": "This is another kind of archive, not a zip. Unpack it and pick the folder, or zip the folder and pick the zip.",
  json: "This is a JSON file named as a zip. Pick the zip of your SillyTavern folder, or the folder itself.",
  html: "This is a web page saved as a zip, often a sign-in or error page from a download. Download the zip again.",
  "not-zip": "This file is not a zip. Pick the zip of your SillyTavern folder, or the folder itself.",
  damaged: "This zip is damaged and cannot be read. Zip your SillyTavern folder again.",
  unsupported: "This zip uses a format the import cannot read (encryption, ZIP64 or an unusual compression). Zip the folder again with standard settings.",
  unsafe: "An entry in this zip is unsafe to unpack: it points outside the folder or unpacks larger than it says. Zip your SillyTavern folder again.",
  "too-large": "This zip, or a file in it, is over the import's size limit. Import the folder itself, which is sent in parts.",
  layout: "This zip holds no SillyTavern profile. Zip the SillyTavern user folder, usually data/default-user.",
  "case-twins": "Two files in this zip differ only in letter case, and a Windows or macOS folder holds them as one. Rename one and zip the folder again.",
};

/** The words of a plan note that counts the files a folder import leaves behind. */
export const IMPORT_LEFT_ON_DISK_PHRASE = "will stay on your disk";

/** How many left-behind files a plan note names by path. */
export const IMPORT_LEFT_BEHIND_NAMED_MAX = 3;

/** The files a plan note names after its reason: each path, then how many more are not named. */
export function importLeftBehindFiles(named: readonly string[], more: number): string {
  return `${named.join(", ")}${more > 0 ? ` and ${String(more)} more` : ""}.`;
}

/** The persona review's answer-all buttons. */
export const COLLISION_MERGE_ALL_NAME = "Merge all";
export const COLLISION_KEEP_ALL_NAME = "Keep all";

/** The titles of a persona collision's two answers. */
export const COLLISION_MERGE_TITLE = "Merge into your existing persona";
export const COLLISION_KEEP_BOTH_TITLE = "Keep both";
