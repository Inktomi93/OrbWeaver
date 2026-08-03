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
// document that extracted to nothing (charCount 0 — the `empty-extraction` warning's persistent state);
// `stalled` = an in-flight phase whose `updatedAt` froze (see {@link STALE_INGEST_MS}).
// NOT exported: every consumer receives the phase from `ingestPhase(doc, now)` and hands it straight to
// `ingestBadge`/`showsPhaseChip`, so inference carries it and no surface ever needs to NAME the type
// (`no-inline-types` — a feature `lib/` is not a type home).
const INGEST_PHASES = ["empty", "indexing", "embedding", "ready", "stalled"] as const;
type IngestPhase = (typeof INGEST_PHASES)[number];

// The COUNT-derived half — the four phases that read off chunk/embed arithmetic alone, with no clock. The
// stall overlay is applied on top by `ingestPhase`; the hint needs THIS answer (it names the phase the job
// wedged in), which is why the two live apart.
type CountedPhase = Exclude<IngestPhase, "stalled">;

// A doc still in an IN-FLIGHT phase this long after its last write reads as a STUCK job (derived from
// `updatedAt` — no status column; a live ingest bumps `updatedAt` as chunks land, so a frozen timestamp is
// the stall signal). 5 minutes clears a slow-but-live large-doc embed while flagging a genuinely wedged one.
const STALE_INGEST_MS = 300_000; // 5 minutes

// The "still {word}" for each COUNT-derived phase — the in-flight phases echo their badge label lowercased;
// terminal phases are null (a full Record so a new phase must decide, mirroring INGEST_BADGES's
// exhaustiveness). It is keyed on the counted phase, not the rendered one, precisely because it is what
// DEFINES `stalled`: a phase that reads null here can never wedge.
const IN_FLIGHT_WORD: Record<CountedPhase, string | null> = { empty: null, indexing: "queued", embedding: "indexing", ready: null };

function countedPhase(doc: Pick<DocumentView, "charCount" | "chunkCount" | "embeddedCount">): CountedPhase {
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

/**
 * The phase a surface RENDERS. `stalled` is not a fifth arithmetic outcome — it is an in-flight phase whose
 * `updatedAt` stopped moving, which is the only signal a schema with no status column can offer that a job
 * is never coming back (a document whose ingest was never enqueued at all looks exactly like one that is
 * about to start, for the first five minutes).
 *
 * `now` is INJECTED (client-determinism — the render edge passes the wall clock off the `time` seam, never
 * an ambient `Date.now`).
 */
export function ingestPhase(doc: Pick<DocumentView, "charCount" | "chunkCount" | "embeddedCount" | "updatedAt">, now: number): IngestPhase {
  const counted = countedPhase(doc);
  return IN_FLIGHT_WORD[counted] !== null && now - doc.updatedAt >= STALE_INGEST_MS ? "stalled" : counted;
}

/** The `@orb/ui/badge` intent + label per ingest phase — a mapped-type Record dispatch (a new phase without
 *  a badge fails tsc; §5.5 exhaustiveness). */
const INGEST_BADGES: Record<IngestPhase, { readonly label: string; readonly intent: "success" | "warning" | "neutral" | "danger" }> = {
  empty: { label: "Empty", intent: "neutral" },
  indexing: { label: "Queued", intent: "warning" },
  embedding: { label: "Indexing", intent: "warning" },
  ready: { label: "Ready", intent: "success" },
  // DANGER, not warning: `Queued` and `Indexing` say "wait", and a user who has been waiting deserves the
  // one chip that says "this will not finish on its own". Reindex is the repair, on the row's own kebab.
  stalled: { label: "Stalled", intent: "danger" },
};

/** The badge (intent + label) for an ingest phase (the row chip + the detail header chip). */
export function ingestBadge(phase: IngestPhase): { readonly label: string; readonly intent: "success" | "warning" | "neutral" | "danger" } {
  return INGEST_BADGES[phase];
}

// Which phases EARN a chip in a 320px LIST row (§6.1). A full Record, not a `!== "ready"` test, so a new
// phase must decide — the same exhaustiveness INGEST_BADGES carries. The DETAIL surface is unaffected: it
// has room, and "Ready" there is the answer to a question the user just asked by opening the document.
const PHASE_EARNS_A_CHIP: Record<IngestPhase, boolean> = { empty: true, indexing: true, embedding: true, ready: false, stalled: true };

/** Does this phase render a chip in a list row? Ready is the ABSENCE of a chip (§6.1 / density CD1). */
export function showsPhaseChip(phase: IngestPhase): boolean {
  return PHASE_EARNS_A_CHIP[phase];
}

/** Is this document's ingest still running? The freshness driver for the library's bounded poll (D-3 arm b).
 *  A STALLED document is NOT in flight: it stopped moving, so polling it forever would be a 4-second request
 *  every 4 seconds, permanently, for a job that is never coming back. */
export function isIngestInFlight(doc: Pick<DocumentView, "charCount" | "chunkCount" | "embeddedCount" | "updatedAt">, now: number): boolean {
  const phase = ingestPhase(doc, now);
  return phase !== "stalled" && IN_FLIGHT_WORD[phase] !== null;
}

/** A stuck-ingest sentence for the surfaces' Reindex affordance, or `null` when the doc is fresh or terminal.
 *  Names the phase the job wedged in (which is why it reads the COUNTED phase, not the rendered `stalled`).
 *  `now` is injected (client-determinism — the render edge passes the wall clock). */
export function ingestStallHint(doc: Pick<DocumentView, "charCount" | "chunkCount" | "embeddedCount" | "updatedAt">, now: number): string | null {
  const word = IN_FLIGHT_WORD[countedPhase(doc)];
  if (word === null || ingestPhase(doc, now) !== "stalled") {
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
