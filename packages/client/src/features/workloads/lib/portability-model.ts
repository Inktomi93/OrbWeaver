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
export const EXPORTABLE_KINDS: readonly PortableKind[] = PORTABLE_KINDS.filter((kind) => kind !== ASSETS_KIND);

/** The human label per portable kind (checkboxes + report copy). */
export const PORTABLE_KIND_LABELS: Record<PortableKind, string> = {
  character: "Characters",
  chat: "Chats",
  persona: "Personas",
  "world-info": "World info",
  regex: "Regex scripts",
  databank: "Databank",
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

/** One normalized per-file outcome for the report summary. `notes` mirrors the server's per-card
 *  `skippedOverlays` (#1598/#1709) — the planes THIS file's import deliberately did not assert (e.g. "book
 *  kept: primary already exists"). Absent on a failed outcome (nothing landed, so nothing was skipped). */
interface ImportOutcomeView {
  readonly path: string;
  readonly ok: boolean;
  readonly detail: string;
  readonly notes?: readonly string[];
}

/** The normalized import result the report summary renders (both import paths map into this). `notes` is
 *  the BATCH-wide list (#1710's `bundleImportNotes` flattening, for the bundle arm only — the card arm's
 *  notes are per-file and ride `outcomes[].notes` instead, since that arm already has per-file detail). */
export interface ImportSummary {
  readonly imported: number;
  readonly skipped: number;
  readonly failed: number;
  readonly outcomes: readonly ImportOutcomeView[];
  readonly notes: readonly string[];
}

/** The counts + flattened notes a finished `import-bundle` workload reports (no per-file list — #1710's
 *  `bundleImportNotes` already flattened the per-file planes into one batch-wide list). */
export interface BundleCounts {
  readonly imported: number;
  readonly skipped: number;
  readonly failed: number;
  readonly notes: readonly string[];
}

/** Narrow an `unknown` workload-succeeded result into the bundle counts. */
export function asBundleCounts(result: unknown): BundleCounts {
  const record = typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {};
  const count = (value: unknown): number => (typeof value === "number" ? value : 0);
  const notes = record["notes"];
  return {
    imported: count(record["imported"]),
    skipped: count(record["skipped"]),
    failed: count(record["failed"]),
    notes: Array.isArray(notes) ? notes.filter((note): note is string => typeof note === "string") : [],
  };
}

/** Normalize a finished bundle workload's counts into the summary view (no per-file outcomes). */
export function summarizeBundleCounts(counts: BundleCounts): ImportSummary {
  return { ...counts, outcomes: [] };
}

const UNNAMED_CARD = "Unnamed card";

/** Normalize a bare-card import into the summary shape from the server's real per-file result. Per-card
 *  `notes` (#1598/#1709) rides each landed outcome — the deduped arm carries them too: a re-import that
 *  reconciled overlays against an existing character can skip the SAME planes a fresh import can.
 *  `card.notes` reads `?? []`: `import-characters.ts`'s `(await response.json()) as CardImportResult` is
 *  an unvalidated cast at the fetch boundary (no zod on this raw route), so a caller carrying an OLDER
 *  cached body (or a test fixture minted before this field existed) must not throw on a missing array. */
export function summarizeCardImport(result: CardImportResult): ImportSummary {
  const created = result.imported.filter((card) => card.created);
  const deduped = result.imported.filter((card) => !card.created);
  return {
    imported: created.length,
    skipped: deduped.length,
    failed: result.failed.length,
    notes: [],
    outcomes: [
      ...created.map((card) => ({
        path: card.filename ?? UNNAMED_CARD,
        ok: true,
        detail: "Character card",
        ...((card.notes ?? []).length > 0 ? { notes: card.notes } : {}),
      })),
      ...deduped.map((card) => ({
        path: card.filename ?? UNNAMED_CARD,
        ok: true,
        detail: "Already imported",
        ...((card.notes ?? []).length > 0 ? { notes: card.notes } : {}),
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
