// The names the SillyTavern export prints: its preflight, the door each file goes back through, and why a row stays
// here. A zero-import leaf (types only), so a spec's node side reads them without loading the component graph.

import type { StExportLeftReason, StImportDoor } from "@orb/contracts/import";

/** The preflight's question, which names its group. */
export const ST_EXPORT_TITLE = "Download your library for SillyTavern?";

/** What the export is, above its open button. */
export const ST_EXPORT_LEDE =
  "Or download it as a SillyTavern user folder, to move your library to SillyTavern. You see what goes where, and what stays here, before anything downloads.";

/** The button that opens the preflight and reads the preview. */
export const ST_EXPORT_OPEN_NAME = "Export for SillyTavern…";

/** The preflight's confirm. */
export const ST_EXPORT_DOWNLOAD_NAME = "Download for SillyTavern";

/** The group the preview's lines sit in. */
export const ST_EXPORT_REPORT_NAME = "What the SillyTavern export carries";

/** While the dry run reads the library. */
export const ST_EXPORT_READING = "Reading your library. Nothing is downloaded yet.";

/** A dry run that did not answer, before the retry. */
export const ST_EXPORT_PREVIEW_FAILED = "No preview. The library could not be read for the export. Try again.";

/** A dry run refused because another SillyTavern export or preview of this library is still running. */
export const ST_EXPORT_RUNNING = "Another SillyTavern export of your library is still running. Try again when it finishes.";

/** How the zip goes into SillyTavern, under the preview. */
export const ST_EXPORT_PLACEMENT_NOTE =
  "Unzip it and place data/default-user inside SillyTavern's data folder, or bring each file in through the SillyTavern import its line names. The zip's orbweaver-export-report.json repeats this preview.";

/** The settings file's line label: what it carries besides the persona list. */
export const ST_EXPORT_SETTINGS_LABEL = "Settings, tags, global regex scripts and the Data Bank index";

/** Each SillyTavern door, as a line ends: "…, for <door>". */
export const ST_IMPORT_DOOR_NAMES: Readonly<Record<StImportDoor, string>> = {
  "character-import": "SillyTavern's character import",
  "chat-import": "SillyTavern's chat import",
  "world-info-import": "SillyTavern's world info import",
  "preset-import": "SillyTavern's preset import",
  "theme-import": "SillyTavern's theme import",
  "background-upload": "SillyTavern's background upload",
  "data-folder": "SillyTavern's data folder",
};

/** Why a row stays here, as its group in the preview reads. */
export const ST_EXPORT_LEFT_REASON_NAMES: Readonly<Record<StExportLeftReason, string>> = {
  "no-sillytavern-home": "SillyTavern keeps nothing like it",
  "no-sillytavern-field": "SillyTavern's file has no place for this part",
  "rides-its-card-or-preset": "a scoped regex script travels only inside the card or preset it runs on",
  unreadable: "it could not be read",
  "persona-without-art": "a persona with no image, which SillyTavern cannot list",
  "past-zip-limit": "too large for the zip, or past the number of files a zip can hold",
};

/** One kind's line: how many files, and the door that takes them. */
export function stExportKindLine(label: string, files: number, door: string): string {
  return `${label}: ${String(files)} file${files === 1 ? "" : "s"}, for ${door}`;
}

/** The heading over the rows the export leaves behind. */
export function stExportLeftHeading(count: number): string {
  return `${String(count)} item${count === 1 ? "" : "s"} would stay here:`;
}
