// portability-model — the Backup & Restore pane's pure export/import vocabulary: the human label per
// portable kind, the export-kind set the checkboxes drive, the export-href builder, and the report →
// summary normalizers. No React, no I/O.

import type { ImportWindow } from "@orb/contracts/chat";
import { importWindowSchema, mergeImportWindows } from "@orb/contracts/chat";
import type { CardImportResult, ImportPreview, ImportPreviewKind, ImportPreviewList } from "@orb/contracts/import";
import { IMPORT_PREVIEW_KINDS, importPreviewSchema } from "@orb/contracts/import";
import type { PortableKind } from "@orb/contracts/portability";
import { PORTABILITY_ROUTES, PORTABLE_KINDS, WHOLE_LIBRARY_ONLY_KINDS } from "@orb/contracts/portability";
import type { TreeImportPlan } from "#data";
import { skippedByReason } from "#data";
import { cardImportFailedDetail, cardImportRefusalLine } from "#lib";
import { IMPORT_LEFT_ON_DISK_PHRASE, importPreviewUncomparedNote, importSummaryImported } from "./import-library-names.ts";

/** One normalized per-file outcome for the report summary. `notes` mirrors the server's per-card
 *  `skippedOverlays` (#1598/#1709) — the planes THIS file's import deliberately did not assert (e.g. "book
 *  kept: primary already exists"). Absent on a failed outcome (nothing landed, so nothing was skipped). */
type ImportOutcomeView = { readonly path: string; readonly detail: string } & (
  | { readonly ok: true; readonly notes?: readonly string[] }
  | { readonly ok: false; readonly notes?: never }
);

/** The normalized import result the report summary renders (both import paths map into this). `notes` is
 *  the BATCH-wide list (#1710's `bundleImportNotes` flattening, for the bundle arm only — the card arm's
 *  notes are per-file and ride `outcomes[].notes` instead, since that arm already has per-file detail). */
export interface ImportSummary {
  readonly imported: number;
  readonly skipped: number;
  /** Personas the reader chose to merge into one they already own: neither new canon nor a skip. */
  readonly merged: number;
  readonly failed: number;
  readonly outcomes: readonly ImportOutcomeView[];
  readonly notes: readonly string[];
  /** The import's scope handle — the "Build memory for imported chats" offer's scope; null when it wrote no
   *  real conversation. */
  readonly memoryScope: ImportWindow | null;
}

// Blobs always travel so exported entities keep their media; never a user-facing checkbox.
const ASSETS_KIND = "assets";

type ExportableKind = Exclude<PortableKind, typeof ASSETS_KIND | (typeof WHOLE_LIBRARY_ONLY_KINDS)[number]>;

function isExportable(kind: PortableKind): kind is ExportableKind {
  return kind !== ASSETS_KIND && !(WHOLE_LIBRARY_ONLY_KINDS as readonly PortableKind[]).includes(kind);
}

/** The kinds the export checkboxes offer: every portable kind except the always-included `assets` and the kinds only the
 *  whole-library export carries, which travel when every box is ticked and never on a partial pick. */
export const EXPORTABLE_KINDS: readonly ExportableKind[] = PORTABLE_KINDS.filter(isExportable);

/** The human label per portable kind (checkboxes + report copy). */
export const PORTABLE_KIND_LABELS: Record<ExportableKind, string> = {
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
  imagery: "Image generation history",
};

/** Build the `/api/export/library` download href for the picked kinds. All selected ⇒ no `kinds` param; a partial pick appends `assets` so blobs always travel. */
export function buildLibraryExportHref(selected: ReadonlySet<PortableKind>): string {
  if (selected.size >= EXPORTABLE_KINDS.length) {
    return PORTABILITY_ROUTES.exportLibrary;
  }
  const picked: PortableKind[] = [...EXPORTABLE_KINDS.filter((kind) => selected.has(kind)), ASSETS_KIND];
  return `${PORTABILITY_ROUTES.exportLibrary}?kinds=${picked.join(",")}`;
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

/** The preview a finished dry run reports, or null for any other result. */
export function asImportPreview(result: unknown): ImportPreview | null {
  const preview = typeof result === "object" && result !== null ? (result as Record<string, unknown>)["preview"] : undefined;
  const parsed = importPreviewSchema.safeParse(preview);
  return parsed.success ? parsed.data : null;
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
  const lines = skippedByReason(plan.skipped).map(
    ({ reason, files }) => `${String(files)} file${files === 1 ? "" : "s"} ${IMPORT_LEFT_ON_DISK_PHRASE}: ${reason}.`,
  );
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
  // The server's own sentence for a refused card is a technical one for the log, so the report says what the Characters import says,
  // keyed on the card's reason: a short reason beside each refused file, and the move that works, once, when no file landed.
  const nothingLanded = result.imported.length === 0 && result.failed.length > 0;
  return {
    imported: created.length,
    skipped: deduped.length,
    merged: 0,
    failed: result.failed.length,
    notes: nothingLanded ? [cardImportRefusalLine(result.failed)] : [],
    // A bare card writes no chat, so it offers no memory build.
    memoryScope: null,
    outcomes: [
      ...created.map((card): ImportOutcomeView => {
        const notes = card.notes ?? [];
        return {
          path: card.filename ?? UNNAMED_CARD,
          ok: true,
          detail: "Character card",
          ...(notes.length > 0 ? { notes } : {}),
        };
      }),
      ...deduped.map((card): ImportOutcomeView => {
        const notes = card.notes ?? [];
        return {
          path: card.filename ?? UNNAMED_CARD,
          ok: true,
          detail: "Already imported",
          ...(notes.length > 0 ? { notes } : {}),
        };
      }),
      ...result.failed.map(
        (card): ImportOutcomeView => ({
          path: card.filename ?? UNNAMED_CARD,
          ok: false,
          detail: cardImportFailedDetail(card.reason),
        }),
      ),
    ],
  };
}

/** A one-line "3 imported · 1 skipped · 1 failed" toast/summary caption (only non-zero tallies shown). */
export function summaryCaption(summary: ImportSummary): string {
  const parts = [importSummaryImported(summary.imported)];
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

/** The preflight's confirm button, named for what it imports so no other control on the page shares its name. */
export const IMPORT_CONFIRM_NAMES = { folder: "Import this folder", file: "Import this file", files: "Import these files" } as const;

/** A dry run that found nothing a real run would write: no kind holds an item. */
export function previewIsEmpty(preview: ImportPreview): boolean {
  return IMPORT_PREVIEW_KINDS.every((kind) => preview.kinds[kind].total === 0);
}

/** What an import DOES to a library that already has things in it — the sentence the reader needs BEFORE
 *  the request, not in the report afterwards. One home: the preflight is the only place it is spoken. */
export const IMPORT_CONSEQUENCE = [
  "Importing ADDS to your library. Nothing you already have is deleted. Settings in an Orbweaver backup merge into yours.",
  "Anything already in your library (the same card, world book, theme or preset) is skipped, so running the same import twice is not a duplicate.",
  "A world book, theme or preset that shares a name with a DIFFERENT one of yours is imported under a numbered name, and so is a persona restored from an Orbweaver backup. Two different cards that share a name stay two characters.",
] as const;

/** What the preflight says when the dry run found nothing a real run would write. */
export const IMPORT_NOTHING_FOUND_NOTE = "Nothing to import was found in this folder.";

/** The noun a kind prints beside its count, singular then plural. */
export const KIND_NOUNS: Readonly<Record<ImportPreviewKind, readonly [one: string, many: string]>> = {
  characters: ["character", "characters"],
  chats: ["chat", "chats"],
  personas: ["persona", "personas"],
  worlds: ["world book", "world books"],
  presets: ["preset", "presets"],
  themes: ["theme", "themes"],
  backgrounds: ["background", "backgrounds"],
  groups: ["group", "groups"],
  orphans: ["character made from chats with no card", "characters made from chats with no card"],
};

export function counted(count: number, [one, many]: readonly [string, string]): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/** One kind's summary line: its total, then the entries already in the library, the entries the same as another in the
 *  upload (a run adds nothing for either), the personas that import without art and, for a folder sent in several
 *  uploads, the entries no other upload could be compared with. Every number is the server's exact count, never a count
 *  of the listed names. */
export function previewKindLine(kind: ImportPreviewKind, list: ImportPreviewList): string {
  const { inLibrary, repeat, withoutArt, uncompared } = list.counts;
  const notes = [
    ...(inLibrary === 0 ? [] : [`${String(inLibrary)} already in your library`]),
    ...(repeat === 0 ? [] : [`${String(repeat)} the same as another in this upload`]),
    ...(withoutArt === 0 ? [] : [`${String(withoutArt)} will import without art`]),
    ...(uncompared === 0 ? [] : [importPreviewUncomparedNote(uncompared)]),
  ];
  return [counted(list.total, KIND_NOUNS[kind]), ...notes].join(", ");
}

/** The preview with its persona counts taken from `judged`, a dry run of the persona files alone under the owner's newer
 *  answers. The listed names stay as the folder's own dry run sent them: only the counts say what a run writes, and the
 *  count line reads those. */
export function withPersonaCounts(preview: ImportPreview, judged: ImportPreview): ImportPreview {
  const { total, counts } = judged.kinds.personas;
  return { ...preview, kinds: { ...preview.kinds, personas: { ...preview.kinds.personas, total, counts } } };
}

/** The profile directories a preview names, in listed order, then `null` when a skip sits at the upload's root. More than one
 *  means the upload holds several profiles, so the reader needs each entry's profile beside it. */
export function previewProfiles(preview: ImportPreview): readonly (string | null)[] {
  const named = new Set<string>();
  for (const kind of IMPORT_PREVIEW_KINDS) {
    for (const { source } of preview.kinds[kind].items) {
      named.add(source.profile);
    }
  }
  let atRoot = false;
  for (const { source } of preview.skipped.items) {
    if (source.profile === null) {
      atRoot = true;
    } else {
      named.add(source.profile);
    }
  }
  return atRoot ? [...named, null] : [...named];
}
