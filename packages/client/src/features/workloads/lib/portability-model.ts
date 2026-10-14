// portability-model — the Backup & Restore pane's pure export/import vocabulary: the human label per
// portable kind, the export-kind set the checkboxes drive, the export-href builder, and the report →
// summary normalizers. No React, no I/O.

import type { ImportWindow } from "@orb/contracts/chat";
import { importWindowSchema, mergeImportWindows } from "@orb/contracts/chat";
import type { PortableKind } from "@orb/contracts/portability";
import { PORTABLE_KINDS } from "@orb/contracts/portability";
import type { CardImportResult, TreeImportPlan } from "#data";
import { skippedByReason } from "#data";
import type { ImportSummary } from "../contract/portability-summary.ts";

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
  imagery: "Image generation history",
};

/** Build the `/api/export/library` download href for the picked kinds. All selected ⇒ no `kinds` param; a partial pick appends `assets` so blobs always travel. */
export function buildLibraryExportHref(selected: ReadonlySet<PortableKind>): string {
  if (selected.size >= EXPORTABLE_KINDS.length) {
    return LIBRARY_EXPORT_PATH;
  }
  const picked = [...EXPORTABLE_KINDS.filter((kind) => selected.has(kind)), ASSETS_KIND];
  return `${LIBRARY_EXPORT_PATH}?kinds=${picked.join(",")}`;
}

/** The counts + flattened notes a finished `import-bundle` workload reports (no per-file list — #1710's
 *  `bundleImportNotes` already flattened the per-file planes into one batch-wide list). */
export interface BundleCounts {
  readonly imported: number;
  readonly skipped: number;
  /** Folded names of the personas merged into one the reader owns. Keys, so the uploads of a split folder
   *  (which each re-merge the same persona) union instead of adding. */
  readonly mergedKeys: readonly string[];
  readonly failed: number;
  readonly notes: readonly string[];
  readonly memoryScope: ImportWindow | null;
}

/** One span over both scopes; a missing side leaves the other as it is. */
function mergeScopes(a: ImportWindow | null, b: ImportWindow | null): ImportWindow | null {
  if (a === null || b === null) {
    return a ?? b;
  }
  return mergeImportWindows(a, b);
}

/** Narrow an `unknown` workload-succeeded result into the bundle counts. An `import-st` run reports the
 *  maintenance-pass shape (`scanned`/`changed`/`failed`) instead of `imported`/`skipped`: its new canon is
 *  what landed and the rest of what it examined is what it already had or set aside. */
export function asBundleCounts(result: unknown): BundleCounts {
  const record = typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {};
  const count = (value: unknown): number => (typeof value === "number" ? value : 0);
  const notes = record["notes"];
  const memoryScope = importWindowSchema.safeParse(record["memoryScope"]);
  const failed = count(record["failed"]);
  const imported = record["imported"] === undefined ? count(record["changed"]) : count(record["imported"]);
  const mergedKeys = Array.isArray(record["mergedKeys"]) ? record["mergedKeys"].filter((key): key is string => typeof key === "string") : [];
  const skipped = record["skipped"] === undefined ? Math.max(0, count(record["scanned"]) - imported - failed - mergedKeys.length) : count(record["skipped"]);
  return {
    imported,
    skipped,
    mergedKeys,
    failed,
    notes: Array.isArray(notes) ? notes.filter((note): note is string => typeof note === "string") : [],
    memoryScope: memoryScope.success ? memoryScope.data : null,
  };
}

/** Sum two uploads' counts — a planned folder import is several sequential workloads reporting one result. */
export function sumBundleCounts(a: BundleCounts, b: BundleCounts): BundleCounts {
  return {
    imported: a.imported + b.imported,
    skipped: a.skipped + b.skipped,
    mergedKeys: [...new Set([...a.mergedKeys, ...b.mergedKeys])],
    failed: a.failed + b.failed,
    notes: [...a.notes, ...b.notes],
    memoryScope: mergeScopes(a.memoryScope, b.memoryScope),
  };
}

/** The plan's own lines, for the preflight AND the summary: what stays on your disk and why, and how many
 *  uploads the folder takes. One builder, so the two surfaces cannot disagree. */
export function planNotes(plan: TreeImportPlan): string[] {
  const lines = skippedByReason(plan.skipped).map(({ reason, files }) => `${String(files)} file${files === 1 ? "" : "s"} will stay on your disk — ${reason}.`);
  if (plan.batches.length > 1) {
    lines.push(
      `The folder is over the per-upload cap, so it is sent as ${String(plan.batches.length)} uploads, one after another. Each one imports on its own.`,
    );
  }
  return lines;
}

/** Normalize a finished bundle workload's counts into the summary view (no per-file outcomes). */
export function summarizeBundleCounts({ mergedKeys, ...counts }: BundleCounts): ImportSummary {
  return { ...counts, merged: mergedKeys.length, outcomes: [] };
}

const UNNAMED_CARD = "Unnamed card";

/** Summarize validated per-card outcomes. Optional notes preserve compatibility with older responses. */
export function summarizeCardImport(result: CardImportResult): ImportSummary {
  const created = result.imported.filter((card) => card.created);
  const deduped = result.imported.filter((card) => !card.created);
  return {
    imported: created.length,
    skipped: deduped.length,
    merged: 0,
    failed: result.failed.length,
    notes: [],
    // A bare card writes no chat, so it offers no memory build.
    memoryScope: null,
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
  if (summary.merged > 0) {
    parts.push(`${summary.merged} merged into existing`);
  }
  if (summary.skipped > 0) {
    parts.push(`${summary.skipped} skipped`);
  }
  if (summary.failed > 0) {
    parts.push(`${summary.failed} failed`);
  }
  return parts.join(" · ");
}

export type { ImportSummary } from "../contract/portability-summary.ts";
