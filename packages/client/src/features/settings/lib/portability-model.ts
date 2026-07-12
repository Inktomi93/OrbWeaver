// portability-model — the Backup & Restore pane's pure export/import vocabulary (UI-Arch §2.1 lib/):
// the human label per portable kind, the export-kind set the checkboxes drive (every PortableKind
// EXCEPT `assets` — media always rides along so an exported character keeps its portrait), the pure
// export-href builder, and the report → summary normalizers. No React, no I/O — the surface owns the
// fetch + state. One home for the kind vocabulary (the label Record is exhaustive over PortableKind, so
// a new kind is a `tsc` error until it gets a label).

import type { PortableKind } from "@orb/contracts/portability";
import { PORTABLE_KINDS } from "@orb/contracts/portability";
import type { CardImportResult } from "#data";

const LIBRARY_EXPORT_PATH = "/api/export/library";
// Blobs (avatars, gallery, imagery) are their OWN portable kind but never a user-facing checkbox — they
// ALWAYS travel so exported entities keep their media. Appended to any partial selection; a full
// selection omits the `kinds` param entirely (the server exports everything, media included).
const ASSETS_KIND = "assets";

/** The kinds the export checkboxes offer — every portable kind except the always-included `assets`. */
export const EXPORTABLE_KINDS: readonly PortableKind[] = PORTABLE_KINDS.filter(
  (kind) => kind !== ASSETS_KIND,
);

/** The human label per portable kind (checkboxes + report copy) — one home for the vocabulary. */
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

/** Build the `/api/export/library` download href for the picked kinds. ALL selected ⇒ no `kinds` param
 *  (the server exports everything, media included). A partial pick ⇒ `?kinds=<picked>,assets` so blobs
 *  always travel. The caller passes this to `downloadUrl` (the session cookie rides the GET). */
export function buildLibraryExportHref(selected: ReadonlySet<PortableKind>): string {
  if (selected.size >= EXPORTABLE_KINDS.length) {
    return LIBRARY_EXPORT_PATH;
  }
  const picked = [...EXPORTABLE_KINDS.filter((kind) => selected.has(kind)), ASSETS_KIND];
  return `${LIBRARY_EXPORT_PATH}?kinds=${picked.join(",")}`;
}

/** One normalized per-file outcome for the report summary (the bare-card path carries these; the
 *  workload-backed bundle path returns summary COUNTS only, so its `outcomes` is empty). */
export interface ImportOutcomeView {
  readonly path: string;
  readonly ok: boolean;
  /** A short human detail: the kind label, or a note. */
  readonly detail: string;
}

/** The normalized import result the report summary renders (both import paths map into this). */
export interface ImportSummary {
  readonly imported: number;
  readonly skipped: number;
  readonly failed: number;
  readonly outcomes: readonly ImportOutcomeView[];
}

/** The three summary counts a finished `import-bundle` workload reports (its result carries no per-file
 *  list — the counts ARE the outcome; per-file rows live in the Workloads pane's row detail). */
export interface BundleCounts {
  readonly imported: number;
  readonly skipped: number;
  readonly failed: number;
}

/** Narrow an `unknown` workload-succeeded result into the bundle counts (the wire type is `unknown`). */
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

// A card with no server-reported filename (the wire type allows null) still needs a stable row label/key.
const UNNAMED_CARD = "Unnamed card";

/** Normalize a bare-card import into the summary shape from the server's REAL per-file `ProfileImportResult`
 *  — NOT the uploaded filenames. A newly-created card is imported, a byte-identical re-import (`created`
 *  false) is skipped (already present), and a card the server put in `failed` renders as a failure WITH its
 *  reason (never a fabricated ✓). Mirrors `summarizeBundleCounts`'s honesty for the `.zip` path. */
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
