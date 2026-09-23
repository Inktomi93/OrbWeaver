// Pure display projections for the databank surface — the row subtitle, the origin label, the derived
// ingest phase, and the stall hint. Zero I/O, zero React: every value is a function of a `DocumentView`, so
// the surfaces stay thin and these rules are unit-tested in isolation.
//
// PORTED hunk-by-hunk from `legacy-main:features/databank/lib/databank-model.ts` ("the best thing in the
// tree"), with ONE deliberate logic addition and zero deletions:
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
import { formatBytes, groupThousands } from "@orb/kit/strings";
import type { LucideIcon } from "@orb/ui/icons";
import { AlertTriangle } from "@orb/ui/icons";

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

/** What a phase's chip renders: its label, its `@orb/ui/badge` intent, and an optional leading glyph. */
interface IngestBadge {
  readonly label: string;
  readonly intent: "success" | "warning" | "neutral" | "danger";
  /** A leading `@orb/ui/icons` glyph, or `null` for a text-only chip — see the THIRD DIFFERENTIATOR note. */
  readonly glyph: LucideIcon | null;
}

/** The `@orb/ui/badge` intent + label per ingest phase — a mapped-type Record dispatch (a new phase without
 *  a badge fails tsc; §5.5 exhaustiveness). */
const INGEST_BADGES: Record<IngestPhase, IngestBadge> = {
  // WARNING, not neutral (side-eye 2026-08-08 P3): "Empty" is not the absence of a state, it is a FAILED
  // extraction — a scanned PDF that will never feed a chat no matter how long you wait. Neutral filed it
  // beside "nothing to report" and it read as a shrug; the user has to act (re-upload a text PDF, or paste
  // the text) or the document is dead weight. It stops short of `danger`, which is reserved for the job
  // that WEDGED — this one completed, honestly, with nothing in it.
  //
  // ── THE THIRD DIFFERENTIATOR (side-eye 2026-08-19 P2, a FORK with the ruling above) ──
  // The 08-08 ruling is NOT reversed: `Empty` stays `warning`, and the reasoning it records is still the
  // reason. What 08-19 measured is a different defect on top of it — `Empty` and `Indexing` resolve to the
  // IDENTICAL amber (same fg, same bg), so "act now, this is dead" and "wait, this is working" are one
  // pixel value distinguished only by a 10.5px word. Reverting `Empty` to neutral would satisfy the new
  // finding by re-committing the old one. A glyph is the axis neither ruling spends: the chip keeps its
  // amber, and only the arm that asks the user to DO something carries a mark.
  empty: { label: "Empty", intent: "warning", glyph: AlertTriangle },
  indexing: { label: "Queued", intent: "warning", glyph: null },
  embedding: { label: "Indexing", intent: "warning", glyph: null },
  ready: { label: "Ready", intent: "success", glyph: null },
  // DANGER, not warning: `Queued` and `Indexing` say "wait", and a user who has been waiting deserves the
  // one chip that says "this will not finish on its own". Reindex is the repair, on the row's own kebab.
  // No glyph: `danger` is already its own hue, so the mark would be decoration rather than a distinction.
  stalled: { label: "Stalled", intent: "danger", glyph: null },
};

/** The badge (intent + label + glyph) for an ingest phase (the row chip + the detail header chip). */
export function ingestBadge(phase: IngestPhase): IngestBadge {
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
 *  every 4 seconds, permanently, for a job that is never coming back.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function isIngestInFlight(doc: Pick<DocumentView, "charCount" | "chunkCount" | "embeddedCount" | "updatedAt">, now: number): boolean {
  const phase = ingestPhase(doc, now);
  return phase !== "stalled" && IN_FLIGHT_WORD[phase] !== null;
}

/** How often a documents read re-runs while ANY row is mid-ingest (D-3 arm b). Slow enough to be free at
 *  rest, fast enough that a small document's `Queued → Ready` is seen rather than reported later.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
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

/**
 * The EMPTY phase's remedy, or `null` for every other phase — `ingestStallHint`'s twin (side-eye 2026-08-19
 * N-5). `Empty` was the one phase that named a state and offered nothing: the chip says the extraction came
 * back with no text, and the amber + the ⚠ say "act", while nothing anywhere said what the act IS. Reindex
 * is NOT the act — re-running extraction over the same image-only bytes produces the same nothing, which is
 * exactly why this sentence cannot be folded into the stall hint's Reindex pointer.
 *
 * No clock: `empty` is terminal by arithmetic (charCount 0), so it can never be the stalled overlay and the
 * two hints are mutually exclusive by construction rather than by a caller remembering to pick one.
 */
export function ingestEmptyHint(doc: Pick<DocumentView, "charCount" | "chunkCount" | "embeddedCount">): string | null {
  return countedPhase(doc) === "empty" ? "No text could be extracted — re-upload a text PDF, or paste the text." : null;
}

/**
 * The passage count as a ROW states it — ONE home, because the list row and the detail readout print the
 * same fact and used to print it in two vocabularies ("12 passages" beside "Chunks 12/12 embedded").
 *
 * A PASSAGE IS AN EMBEDDED CHUNK (`@orb/contracts/databank`'s own phase note: `ready` = every chunk
 * embedded, and `BankHealthView.passages` is documented as "chunks a chat can actually retrieve"). This
 * used to print `chunkCount`, which is the chunks that EXIST — so a document mid-embed with 22 of 39
 * embedded read "39 passages", overstating its reach by 77% at exactly the moment the number is moving and
 * the user is watching it (side-eye 2026-08-19 P2). The bank-health line was fixed for this same
 * overstatement on 2026-08-08 ("286 of 1,170 passages indexed"); the row kept the old reading.
 *
 * So: both numbers while they differ, one number once they cannot. That is the same shape the health line
 * settled on, and it is why a partially-embedded row now says what a complete one does not have to.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function passageCount(doc: Pick<DocumentView, "chunkCount" | "embeddedCount">): string {
  if (doc.embeddedCount < doc.chunkCount) {
    return `${passageTally(doc)} passages`;
  }
  return doc.chunkCount === 1 ? "1 passage" : `${passageTally(doc)} passages`;
}

/** The same fact with the NOUN LEFT OFF — for a readout whose LABEL already says "Passages" ("12", "22 /
 *  39"). Split out rather than re-spelled: the DETAIL row said "Passages … 12 passages" and the stutter is
 *  what a labelled column exists to make unnecessary (side-eye 2026-08-19 N-3). The subtitle keeps the word,
 *  because a row's scent line has no label to carry it. One arithmetic, two renderings. */
export function passageTally(doc: Pick<DocumentView, "chunkCount" | "embeddedCount">): string {
  if (doc.embeddedCount < doc.chunkCount) {
    return `${groupThousands(doc.embeddedCount)} / ${groupThousands(doc.chunkCount)}`;
  }
  return groupThousands(doc.chunkCount);
}

/** The extracted-character count as a readout states it. ONE number convention across this feature: the
 *  bank-health line has grouped its thousands since 2026-08-08 and the passage tally does now, so a raw
 *  `4200` beside them read as an id rather than a quantity (side-eye 2026-08-19 N-3). */
export function characterCount(doc: Pick<DocumentView, "charCount">): string {
  return groupThousands(doc.charCount);
}

/** The library-row subtitle: provenance · size · passage count (e.g. "Upload · 24.5 KB · 12 passages"). A
 *  document with nothing embedded yet reads "0 passages" — the `Queued` chip carries the in-flight signal. */
export function documentSubtitle(doc: DocumentView): string {
  return `${originLabel(doc.origin)} · ${formatBytes(doc.byteSize)} · ${passageCount(doc)}`;
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
