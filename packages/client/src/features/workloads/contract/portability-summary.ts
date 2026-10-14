// The local import-report presentation shared by its card and bundle normalizers.
import type { ImportWindow } from "@orb/contracts/chat";

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
  /** Personas the reader chose to merge into one they already own: neither new canon nor a skip. */
  readonly merged: number;
  readonly failed: number;
  readonly outcomes: readonly ImportOutcomeView[];
  readonly notes: readonly string[];
  /** The import's scope handle — the "Build memory for imported chats" offer's scope; null when it wrote no
   *  real conversation. */
  readonly memoryScope: ImportWindow | null;
}
