// The SillyTavern export report as the preview's lines: a line per kind with the door its files go through, the rows
// left behind grouped by reason, and the names behind the toggle.

import type { ImportPreviewKind, StExportReport } from "@orb/contracts/import";
import { IMPORT_PREVIEW_KINDS, ST_EXPORT_DOORS, ST_EXPORT_PROFILE_DIR, ST_SETTINGS_FILE } from "@orb/contracts/import";
import { KIND_NOUNS, PORTABLE_KIND_LABELS } from "./portability-model.ts";
import { ST_EXPORT_LEFT_REASON_NAMES, ST_EXPORT_SETTINGS_LABEL, ST_IMPORT_DOOR_NAMES, stExportKindLine, stExportLeftHeading } from "./st-export-names.ts";

// The settings file carries the persona list beside the tags, the global scripts and the Data Bank index, so it is
// counted as its own line rather than as a persona.
const SETTINGS_PATH = `${ST_EXPORT_PROFILE_DIR}${ST_SETTINGS_FILE}`;

/** One line of the preview, keyed for its list. */
export interface PreviewLine {
  readonly key: string;
  readonly text: string;
}

/** The entries of one reason, by their source. */
export interface PreviewReasonGroup {
  readonly reason: string;
  readonly sources: readonly string[];
}

function filesOf(report: StExportReport, kind: ImportPreviewKind): readonly string[] {
  return report.files.filter((file) => file.kind === kind && file.path !== SETTINGS_PATH).map(({ path }) => path.slice(path.lastIndexOf("/") + 1));
}

function capitalized(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** A line per kind the export writes files for, then the settings file's. */
export function stExportKindLines(report: StExportReport): PreviewLine[] {
  const kinds = IMPORT_PREVIEW_KINDS.flatMap((kind) => {
    const files = filesOf(report, kind).length;
    return files === 0 ? [] : [{ key: kind, text: stExportKindLine(capitalized(KIND_NOUNS[kind][1]), files, ST_IMPORT_DOOR_NAMES[ST_EXPORT_DOORS[kind]]) }];
  });
  const settings = report.files.find(({ path }) => path === SETTINGS_PATH);
  return settings === undefined
    ? kinds
    : [...kinds, { key: SETTINGS_PATH, text: stExportKindLine(ST_EXPORT_SETTINGS_LABEL, 1, ST_IMPORT_DOOR_NAMES[settings.door]) }];
}

/** The rows left behind, one group per reason, each row named with its kind. */
export function stExportLeftGroups(report: StExportReport): { readonly heading: string; readonly groups: readonly PreviewReasonGroup[] } | null {
  if (report.left.length === 0) {
    return null;
  }
  const groups = new Map<string, string[]>();
  for (const { kind, item, reason } of report.left) {
    const name = ST_EXPORT_LEFT_REASON_NAMES[reason];
    groups.set(name, [...(groups.get(name) ?? []), `${PORTABLE_KIND_LABELS[kind]}: ${item}`]);
  }
  return { heading: stExportLeftHeading(report.left.length), groups: [...groups].map(([reason, sources]) => ({ reason, sources })) };
}

/** The file names behind the toggle, a line per kind. */
export function stExportNameLines(report: StExportReport): PreviewLine[] {
  return IMPORT_PREVIEW_KINDS.flatMap((kind) => {
    const names = filesOf(report, kind);
    return names.length === 0 ? [] : [{ key: kind, text: `${capitalized(KIND_NOUNS[kind][1])}: ${names.join(", ")}` }];
  });
}
