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
// The ingest phase is DERIVED, never stamped: there is no `status` column — the
// chunk/embed counts ARE the truth, so the surface can never show a phase the data does not support.

import type { BankHealthView, DocOrigin, DocumentView, IngestPhase } from "@orb/contracts/databank";
import { INGEST_PHASES, STALE_INGEST_MS } from "@orb/contracts/databank";
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

// The derived ingest phase. The chunk/embed counts are the ONLY truth (no status column): `indexing` = no
// chunks yet (queued/in-flight); `embedding` = chunks exist but not all embedded (partial ingest, a retry
// resumes it); `ready` = every chunk is embedded; `empty` = a document that extracted to nothing (charCount
// 0 — the `empty-extraction` warning's persistent state); `stalled` = an in-flight phase whose `updatedAt`
// froze (see {@link STALE_INGEST_MS}).
//
// THE VOCABULARY AND THE STALL THRESHOLD LIVE IN `@orb/contracts/databank`. They moved there (from `#state`
// and from this file respectively, 2026-08-14) when the phase became a `databank.list` INPUT: the SERVER now
// filters the bank by phase, so both tiers must speak one tuple and measure the stall against one number, or
// the lens that selected a row and the chip that labels it can disagree about the same document. The RULES
// below are still this file's — the server spells the same arithmetic as SQL predicates and cites them.

// The COUNT-derived half — the four phases that read off chunk/embed arithmetic alone, with no clock. The
// stall overlay is applied on top by `ingestPhase`; the hint needs THIS answer (it names the phase the job
// wedged in), which is why the two live apart.
type CountedPhase = Exclude<IngestPhase, "stalled">;

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
  // WARNING, not neutral (side-eye 2026-08-08 P3): "Empty" is not the absence of a state, it is a FAILED
  // extraction — a scanned PDF that will never feed a chat no matter how long you wait. Neutral filed it
  // beside "nothing to report" and it read as a shrug; the user has to act (re-upload a text PDF, or paste
  // the text) or the document is dead weight. It stops short of `danger`, which is reserved for the job
  // that WEDGED — this one completed, honestly, with nothing in it.
  empty: { label: "Empty", intent: "warning" },
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

/** How often a documents read re-runs while ANY row is mid-ingest (D-3 arm b). Slow enough to be free at
 *  rest, fast enough that a small document's `Queued → Ready` is seen rather than reported later. */
export const INGEST_POLL_MS = 4000;

/** The bounded-poll interval for a `databank.list` read: {@link INGEST_POLL_MS} while some row is still
 *  ingesting, `false` the moment none is (a bank at rest makes zero extra requests). ONE home for the
 *  predicate because both readers of that list — the library pane and the HOME tile — must start and stop
 *  polling on the same rule; two spellings would drift into one surface polling a bank the other calls
 *  settled. `documents` is optional because a refetch callback sees the cache BEFORE the first read lands. */
export function ingestPollInterval(
  documents: readonly Pick<DocumentView, "charCount" | "chunkCount" | "embeddedCount" | "updatedAt">[] | undefined,
  now: number,
): number | false {
  return (documents ?? []).some((doc) => isIngestInFlight(doc, now)) ? INGEST_POLL_MS : false;
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

/** The library-row subtitle: provenance · size · passage count (e.g. "Upload · 24.5 KB · 12 passages"). A
 *  document with no passages yet reads "0 passages" — the `Queued` chip carries the in-flight signal. */
export function documentSubtitle(doc: DocumentView): string {
  const passages = doc.chunkCount === 1 ? "1 passage" : `${doc.chunkCount} passages`;
  return `${originLabel(doc.origin)} · ${formatBytes(doc.byteSize)} · ${passages}`;
}

// ── The bank-wide ingest health (the HOME tile, D-7) ────────────────────────────────────────────────
// The tile answers one question the LIST pane cannot answer from across the app: is the bank you already
// built still doing its job? That is two data points — how much of the bank is actually RETRIEVABLE
// (embedded passages, not documents: an un-embedded document feeds nothing), and which documents are in a
// phase that will never resolve on its own.
//
// THE NUMBERS ARE THE SERVER'S CENSUS NOW (`databank.bankHealth`, 2026-08-14). They used to be summed from
// the ONE page the tile renders four rows of, so "12 stalled" meant "12 stalled among your newest 100
// documents" and the size read "100+" — health CLAIMS about a bank, derived from a window (the same
// blind-lens class the library's client-side filters were, wearing a tile; owner ruling 2026-08-14). What is
// still derived here is the PRESENTATION: which counts earn a chip, and in what order.

/** Worst-first order for the health line's aggregate chips. A full Record so a new phase must decide where
 *  it sits; `ready` carries the last rank and is filtered out by {@link showsPhaseChip} — the steady state
 *  is the ABSENCE of a chip here exactly as it is on a row (§6.1). */
const ATTENTION_ORDER: Record<IngestPhase, number> = { stalled: 0, empty: 1, indexing: 2, embedding: 3, ready: 4 };

/** The bank as the HOME tile summarizes it: its size, the passages a chat can actually pull from out of the
 *  passages that exist, and one aggregate chip per non-ready phase the ROWS DO NOT ALREADY SHOW. Each chip
 *  carries its `phase`, because a chip is a CONTROL — it scopes the library to that phase (P2-a). The chip
 *  shape is spelled INLINE: one producer, one consumer, and a named export for it is an unused type the
 *  liveness lens correctly reds. */
export interface BankHealth {
  readonly total: number;
  readonly passages: number;
  /** Every chunk the bank holds — the denominator that makes `passages` legible ("286 of 1,170"). */
  readonly chunks: number;
  readonly attention: readonly {
    readonly phase: IngestPhase;
    readonly label: string;
    readonly intent: "success" | "warning" | "neutral" | "danger";
  }[];
}

/**
 * The bank's ingest health as the HOME tile renders it: the server's census, plus the chip decision.
 *
 * A phase earns a chip only when the census counts MORE of it than the tile is already showing by name: the
 * rows below say "Stalled" on the one stalled document they render, and an aggregate reading "1 stalled"
 * above them is the same fact twice, competing for the same glance (side-eye 2026-08-08 P2-a). The aggregate
 * exists for what you CANNOT see — the twelve wedged documents further down the bank. That subtraction is the
 * one place the tile still derives a phase per row, so `now` is still INJECTED (the stall overlay's clock;
 * the render edge passes it, never an ambient read).
 */
export function bankHealth(census: BankHealthView, visible: readonly DocumentView[], now: number): BankHealth {
  const shown = new Map<IngestPhase, number>();
  for (const doc of visible) {
    const phase = ingestPhase(doc, now);
    shown.set(phase, (shown.get(phase) ?? 0) + 1);
  }
  const attention = INGEST_PHASES.filter((phase) => showsPhaseChip(phase) && census.byPhase[phase] > (shown.get(phase) ?? 0))
    .toSorted((a, b) => ATTENTION_ORDER[a] - ATTENTION_ORDER[b])
    .map((phase) => ({ intent: ingestBadge(phase).intent, label: `${census.byPhase[phase]} ${ingestBadge(phase).label.toLowerCase()}`, phase }));
  return { attention, chunks: census.chunks, passages: census.passages, total: census.total };
}

const THOUSANDS_RE = /\B(?=(\d{3})+(?!\d))/gu;

/** Group a passage count for display ("1170" → "1,170"). Hand-rolled because `.toLocaleString()` is banned
 *  repo-wide (`no-raw-intl-time` — un-memoized Intl by the back door), and a four-digit passage count with
 *  no grouping reads as an id. Same spelling as the assembly panel's own `formatCount`, deliberately not
 *  lifted into a shared home for two call sites in different features. */
function groupThousands(value: number): string {
  return String(value).replace(THOUSANDS_RE, ",");
}

/** The tile's one-line summary: what you have, and how much of it a chat can actually pull from.
 *
 *  BOTH NUMBERS, ALWAYS ("286 of 1,170 passages indexed") — a bare "286 passages indexed" reads as a
 *  complete count, so a bank half-way through an embed looks finished (side-eye 2026-08-08 P2-e); side by
 *  side the two numbers teach what a passage IS and what "indexed" costs. And a capped page says `100+`,
 *  because `databank.list` returns a PAGE: reporting its length as the bank's size is a census the client
 *  never took (P2-d). */
// The "100+" reading is GONE from both surfaces that carried it (2026-08-14): the library band prints
// `databank.list`'s `totalCount` and this line prints `databank.bankHealth`'s. Neither is summarizing a page
// any more, so neither has a cap to admit to.
function documentCount(health: BankHealth): string {
  return health.total === 1 ? "1 document" : `${health.total} documents`;
}

export function bankHealthLine(health: BankHealth): string {
  const size = documentCount(health);
  const unit = health.chunks === 1 ? "passage" : "passages";
  return `${size} · ${groupThousands(health.passages)} of ${groupThousands(health.chunks)} ${unit} indexed`;
}
