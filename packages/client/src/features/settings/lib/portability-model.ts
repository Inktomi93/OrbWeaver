// portability-model — the Backup & Restore pane's pure export/import vocabulary: the human label per
// portable kind, the export-kind set the checkboxes drive, the export-href builder, and the report →
// summary normalizers. No React, no I/O.

import type { PortableKind } from "@orb/contracts/portability";
import { PORTABLE_KINDS } from "@orb/contracts/portability";
import type { CardImportResult } from "#data";

const LIBRARY_EXPORT_PATH = "/api/export/library";
// Blobs always travel so exported entities keep their media; never a user-facing checkbox.
const ASSETS_KIND = "assets";

/** The kinds the export checkboxes offer — every portable kind except the always-included `assets`. */
export const EXPORTABLE_KINDS: readonly PortableKind[] = PORTABLE_KINDS.filter(
  (kind) => kind !== ASSETS_KIND,
);

/** The human label per portable kind (checkboxes + report copy). */
export const PORTABLE_KIND_LABELS: Record<PortableKind, string> = {
  character: "Characters",
  chat: "Chats",
  persona: "Personas",
  "world-info": "World info",
  preset: "Presets",
  theme: "Themes",
  "user-settings": "Settings",
  tag: "Tags",
  gallery: "Gallery",
  assets: "Media",
};

/** Build the `/api/export/library` download href for the picked kinds. All selected ⇒ no `kinds` param; a partial pick appends `assets` so blobs always travel. */
export function buildLibraryExportHref(selected: ReadonlySet<PortableKind>): string {
  if (selected.size >= EXPORTABLE_KINDS.length) {
    return LIBRARY_EXPORT_PATH;
  }
  const picked = [...EXPORTABLE_KINDS.filter((kind) => selected.has(kind)), ASSETS_KIND];
  return `${LIBRARY_EXPORT_PATH}?kinds=${picked.join(",")}`;
}

/** One normalized per-file outcome for the report summary. */
export interface ImportOutcomeView {
  readonly path: string;
  readonly ok: boolean;
  readonly detail: string;
}

/** The normalized import result the report summary renders (both import paths map into this). */
export interface ImportSummary {
  readonly imported: number;
  readonly skipped: number;
  readonly failed: number;
  readonly outcomes: readonly ImportOutcomeView[];
}

/** The three summary counts a finished `import-bundle` workload reports (no per-file list). */
export interface BundleCounts {
  readonly imported: number;
  readonly skipped: number;
  readonly failed: number;
}

/** Narrow an `unknown` workload-succeeded result into the bundle counts. */
export function asBundleCounts(result: unknown): BundleCounts {
  const record =
    typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {};
  const count = (value: unknown): number => (typeof value === "number" ? value : 0);
  return {
    imported: count(record["imported"]),
    skipped: count(record["skipped"]),
    failed: count(record["failed"]),
  };
}

/** Normalize a finished bundle workload's counts into the summary view (no per-file outcomes). */
export function summarizeBundleCounts(counts: BundleCounts): ImportSummary {
  return { ...counts, outcomes: [] };
}

const UNNAMED_CARD = "Unnamed card";

/** Normalize a bare-card import into the summary shape from the server's real per-file result. */
export function summarizeCardImport(result: CardImportResult): ImportSummary {
  const created = result.imported.filter((card) => card.created);
  const deduped = result.imported.filter((card) => !card.created);
  return {
    imported: created.length,
    skipped: deduped.length,
    failed: result.failed.length,
    outcomes: [
      ...created.map((card) => ({
        path: card.filename ?? UNNAMED_CARD,
        ok: true,
        detail: "Character card",
      })),
      ...deduped.map((card) => ({
        path: card.filename ?? UNNAMED_CARD,
        ok: true,
        detail: "Already imported",
      })),
      ...result.failed.map((card) => ({
        path: card.filename ?? UNNAMED_CARD,
        ok: false,
        detail: card.error,
      })),
    ],
  };
}

/** A one-line "3 imported · 1 skipped · 1 failed" toast/summary caption (only non-zero tallies shown). */
export function summaryCaption(summary: ImportSummary): string {
  const parts = [`${summary.imported} imported`];
  if (summary.skipped > 0) {
    parts.push(`${summary.skipped} skipped`);
  }
  if (summary.failed > 0) {
    parts.push(`${summary.failed} failed`);
  }
  return parts.join(" · ");
}
