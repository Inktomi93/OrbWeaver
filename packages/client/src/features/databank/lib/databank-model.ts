// Pure display projections for the databank surface — the row subtitle, the origin label, the derived
// ingest phase, and the stall hint. Zero I/O, zero React: every value is a function of a `DocumentView`, so
// the surfaces stay thin and these rules are unit-tested in isolation.
//
// PORTED hunk-by-hunk from `legacy-main:features/databank/lib/databank-model.ts` (databank-surface-spec §2.1
// — "the best thing in the tree"), with ONE deliberate logic addition and zero deletions:
//
//   §6.1's PHASE-CHIP RULING — `showsPhaseChip` is new. Legacy rendered a phase Badge on EVERY row, `Ready`
//   included; at the real 320px pane floor a `Ready` chip on six of seven rows is chrome carrying zero
//   information (the steady state IS ready) while eating the title down to an ellipsis. Ready is now the
//   ABSENCE of a chip. The derived phase itself is unchanged — only this render predicate is new.
//
// The ingest phase is DERIVED, never stamped: there is no `status` column (databank-design/02 §1.2) — the
// chunk/embed counts ARE the truth, so the surface can never show a phase the data does not support.

import type { DocOrigin, DocumentView } from "@orb/contracts/databank";
// `formatBytes` moved to `@orb/kit/strings` when the per-chat rack became its THIRD consumer (it was
// spelled here and, byte-identically, inside `@orb/ui/file-dropzone`). Same function, one home.
import { formatBytes } from "@orb/kit/strings";

const ORIGIN_LABELS: Record<DocOrigin, string> = {
  upload: "Upload",
  web: "Web",
  youtube: "YouTube",
  wiki: "Wiki",
  text: "Text",
};

/** The provenance label for a document's origin (the row subtitle + detail metadata). */
export function originLabel(origin: DocOrigin): string {
  return ORIGIN_LABELS[origin];
}

// The derived ingest phase (ONE importable union from a tuple — §5.5). The chunk/embed counts are the ONLY
// truth (no status column): `indexing` = no chunks yet (queued/in-flight); `embedding` = chunks exist but
// not all embedded (partial ingest, a retry resumes it); `ready` = every chunk is embedded; `empty` = a
// document that extracted to nothing (charCount 0 — the `empty-extraction` warning's persistent state).
// NOT exported: every consumer receives the phase from `ingestPhase(doc)` and hands it straight to
// `ingestBadge`/`showsPhaseChip`, so inference carries it and no surface ever needs to NAME the type
// (`no-inline-types` — a feature `lib/` is not a type home).
const INGEST_PHASES = ["empty", "indexing", "embedding", "ready"] as const;
type IngestPhase = (typeof INGEST_PHASES)[number];

export function ingestPhase(doc: Pick<DocumentView, "charCount" | "chunkCount" | "embeddedCount">): IngestPhase {
  if (doc.charCount === 0) {
    return "empty";
  }
  if (doc.chunkCount === 0) {
    return "indexing";
  }
  if (doc.embeddedCount < doc.chunkCount) {
    return "embedding";
  }
  return "ready";
}

/** The `@orb/ui/badge` intent + label per ingest phase — a mapped-type Record dispatch (a new phase without
 *  a badge fails tsc; §5.5 exhaustiveness). */
const INGEST_BADGES: Record<IngestPhase, { readonly label: string; readonly intent: "success" | "warning" | "neutral" }> = {
  empty: { label: "Empty", intent: "neutral" },
  indexing: { label: "Queued", intent: "warning" },
  embedding: { label: "Indexing", intent: "warning" },
  ready: { label: "Ready", intent: "success" },
};

/** The badge (intent + label) for an ingest phase (the row chip + the detail header chip). */
export function ingestBadge(phase: IngestPhase): { readonly label: string; readonly intent: "success" | "warning" | "neutral" } {
  return INGEST_BADGES[phase];
}

// Which phases EARN a chip in a 320px LIST row (§6.1). A full Record, not a `!== "ready"` test, so a new
// phase must decide — the same exhaustiveness INGEST_BADGES carries. The DETAIL surface is unaffected: it
// has room, and "Ready" there is the answer to a question the user just asked by opening the document.
const PHASE_EARNS_A_CHIP: Record<IngestPhase, boolean> = { empty: true, indexing: true, embedding: true, ready: false };

/** Does this phase render a chip in a list row? Ready is the ABSENCE of a chip (§6.1 / density CD1). */
export function showsPhaseChip(phase: IngestPhase): boolean {
  return PHASE_EARNS_A_CHIP[phase];
}

// A doc still in an IN-FLIGHT phase this long after its last write reads as a STUCK job (derived from
// `updatedAt` — no status column; a live ingest bumps `updatedAt` as chunks land, so a frozen timestamp is
// the stall signal). 5 minutes clears a slow-but-live large-doc embed while flagging a genuinely wedged one.
const STALE_INGEST_MS = 300_000; // 5 minutes

// The "still {word}" for each phase — the in-flight phases echo their badge label lowercased; terminal
// phases are null (a full Record so a new phase must decide, mirroring INGEST_BADGES's exhaustiveness).
const IN_FLIGHT_WORD: Record<IngestPhase, string | null> = { empty: null, indexing: "queued", embedding: "indexing", ready: null };

/** Is this document's ingest still running? The freshness driver for the library's bounded poll (D-3 arm b)
 *  and the only state in which {@link ingestStallHint} can fire. */
export function isIngestInFlight(doc: Pick<DocumentView, "charCount" | "chunkCount" | "embeddedCount">): boolean {
  return IN_FLIGHT_WORD[ingestPhase(doc)] !== null;
}

/** A quiet stuck-ingest hint for the detail's Reindex affordance, or `null` when the doc is fresh or terminal.
 *  A doc parked in `Queued`/`Indexing` for {@link STALE_INGEST_MS} past its last update has stalled — Reindex
 *  restarts it. `now` is injected (client-determinism — the render edge passes the wall clock). */
export function ingestStallHint(doc: Pick<DocumentView, "charCount" | "chunkCount" | "embeddedCount" | "updatedAt">, now: number): string | null {
  const word = IN_FLIGHT_WORD[ingestPhase(doc)];
  if (word === null || now - doc.updatedAt < STALE_INGEST_MS) {
    return null;
  }
  return `Still ${word} — Reindex can restart a stuck job.`;
}

/** The library-row subtitle: provenance · size · chunk count (e.g. "Upload · 24.5 KB · 12 chunks"). A
 *  document with no chunks yet reads "0 chunks" — the `Queued` chip carries the in-flight signal. */
export function documentSubtitle(doc: DocumentView): string {
  const chunks = doc.chunkCount === 1 ? "1 chunk" : `${doc.chunkCount} chunks`;
  return `${originLabel(doc.origin)} · ${formatBytes(doc.byteSize)} · ${chunks}`;
}
