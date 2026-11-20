// The SillyTavern export's vocabulary: the format value the library export door takes, the profile tree it writes,
// the SillyTavern import door each preview kind's files go back through, and the report the dry run and the zip share.
// The door map is keyed by the import's own preview kinds, so a kind the import learns fails `tsc` here until the
// export names the door that takes it back.

import { z } from "zod";
import { PORTABILITY_ROUTES, PORTABLE_KINDS } from "../portability/index.ts";
import type { ImportPreviewKind } from "./preview.ts";
import { IMPORT_PREVIEW_KINDS, importTextSchema } from "./preview.ts";

/** The library export door's `format` value for a SillyTavern user directory. */
export const ST_EXPORT_FORMAT = "sillytavern";

/** The library export door's query that asks for the plan alone: no zip, nothing written. */
export const ST_EXPORT_DRY_RUN_QUERY = "dryRun";

/** The library export door's address for the SillyTavern profile, or for its dry run (the report alone). */
export function stProfileExportPath(dryRun: boolean): string {
  return `${PORTABILITY_ROUTES.exportLibrary}?format=${ST_EXPORT_FORMAT}${dryRun ? `&${ST_EXPORT_DRY_RUN_QUERY}=1` : ""}`;
}

/** The profile directory inside the zip, as SillyTavern lays a user out under its data root. */
export const ST_EXPORT_PROFILE_DIR = "data/default-user/";

/** The report at the zip root, beside the profile tree so SillyTavern never reads it. */
export const ST_EXPORT_REPORT_FILE = "orbweaver-export-report.json";

/** The SillyTavern import doors an exported file is shaped for. `data-folder` is the user directory itself, which
 *  SillyTavern reads when the profile is placed under its data root. */
const ST_IMPORT_DOORS = ["character-import", "chat-import", "world-info-import", "preset-import", "theme-import", "background-upload", "data-folder"] as const;
export type StImportDoor = (typeof ST_IMPORT_DOORS)[number];

/** The door that takes each kind back: the SillyTavern route or client function the import inventory names for it
 *  (`docs/plans/import-robustness/design.md`). */
export const ST_EXPORT_DOORS = {
  characters: "character-import",
  chats: "chat-import",
  personas: "data-folder",
  worlds: "world-info-import",
  presets: "preset-import",
  themes: "theme-import",
  backgrounds: "background-upload",
  groups: "data-folder",
  orphans: "character-import",
  documents: "data-folder",
  gallery: "data-folder",
} as const satisfies Readonly<Record<ImportPreviewKind, StImportDoor>>;

/** Why the export left something behind or carried it with a loss. A consumer that words each maps over this tuple.
 *  `no-sillytavern-home`: SillyTavern keeps nothing of the kind. `no-sillytavern-field`: the row carries, but the
 *  named part of it has no field in SillyTavern's file (the item reads `<row>: <part>`). `rides-its-card-or-preset`:
 *  a scoped regex script travels only inside the card or preset it runs on. `unreadable`: the stored row or its
 *  blob did not read. `persona-without-art`: SillyTavern lists a persona only by its avatar image, and this one has
 *  none. */
const ST_EXPORT_LEFT_REASONS = ["no-sillytavern-home", "no-sillytavern-field", "rides-its-card-or-preset", "unreadable", "persona-without-art"] as const;
export type StExportLeftReason = (typeof ST_EXPORT_LEFT_REASONS)[number];

const stExportFileSchema = z.strictObject({
  /** Relative to the zip root. */
  path: z.string(),
  kind: z.enum(IMPORT_PREVIEW_KINDS),
  door: z.enum(ST_IMPORT_DOORS),
});

const stExportLeftSchema = z.strictObject({
  kind: z.enum(PORTABLE_KINDS),
  /** The row as its owner knows it, clipped. */
  item: importTextSchema,
  reason: z.enum(ST_EXPORT_LEFT_REASONS),
});

/** What a SillyTavern export carries and leaves: the dry run's answer and the zip's report. The zip's report can also
 *  name a row that was gone by the time its file was written. */
export const stExportReportSchema = z.strictObject({
  files: z.array(stExportFileSchema).readonly(),
  left: z.array(stExportLeftSchema).readonly(),
});
export type StExportReport = z.infer<typeof stExportReportSchema>;
export type StExportFile = StExportReport["files"][number];
export type StExportLeft = StExportReport["left"][number];

/** The code the export door refuses a second SillyTavern export or dry run with while one runs for the owner. */
export const ST_EXPORT_RUNNING_CODE = "export-running";

/** The export door's refusal body while the owner's SillyTavern export or dry run runs. */
export const stExportRefusalSchema = z.strictObject({ code: z.literal(ST_EXPORT_RUNNING_CODE), error: z.string() });
export type StExportRefusal = z.infer<typeof stExportRefusalSchema>;
