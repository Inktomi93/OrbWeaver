// EVIDENCE WINDOW (#1095) — the pure "what does '~N minutes ago' honestly cover" engine, shared by the two
// halves of a bug report: the browser filters `__orb`'s rings with it, the server filters its own in-memory
// flight recorders with it. ONE engine so the two halves can never disagree about what a window means or about
// when a ring has already dropped the thing being asked about (Constitution.md §1, engine vs data: this is the engine;
// the rings are the data).
//
// THE HONESTY CONTRACT (owner amendment 2026-09-02 — population law, applied to a capture instrument):
//  · A window is INCLUSIVE-AROUND, never point-in-time: entries in `[requestedFrom - pad, capturedAt]`. A human
//    saying "about five minutes ago" is guessing to the minute, so the pad is one minute — one unit of the
//    estimate's OWN precision, which is coarser than any instrument cadence underneath it.
//  · Every source reports `held` vs `kept` and, load-bearing, `truncatedAt`: the wall-clock of the OLDEST entry
//    the ring still holds, WHEN THAT IS NEWER than the requested start. That is "the cap already evicted part of
//    what you asked for", and a bundle that omitted it would let a short list read as a quiet period. It is the
//    common case, not an edge — one cold page load of this app fills 3 of the 32 layout-shift slots.
//  · A source whose entries carry no comparable timestamp is shipped WHOLE with the REASON, never filtered on a
//    timestamp that does not mean what the filter would assume (`wholeSource`).
//
// Clock discipline: every `at` this engine sees is WALL-CLOCK epoch ms. Callers convert — the browser's rings
// disagree among themselves (`performance.now()` offsets vs epoch), and a conversion buried in here would be a
// clock assumption no caller could see.

/** Inclusive-around padding on the leading edge of a requested window — see the header. */
export const EVIDENCE_WINDOW_PAD_MS = 60_000;

const MS_PER_MINUTE = 60_000;

/** A resolved capture window: what was asked for, and the instant of the capture. */
export interface EvidenceWindow {
  /** Wall-clock epoch ms the "~N minutes ago" ask resolves to; `null` ⇒ no window was requested. */
  readonly requestedFromAt: number | null;
  /** `requestedFromAt - pad` — the edge sources are actually filtered on. `null` ⇒ no filtering at all. */
  readonly fromAt: number | null;
  /** The padding applied to the leading edge, stated so a reader never has to infer it. */
  readonly padMs: number;
  /** Wall-clock epoch ms of the capture — the window's trailing edge. */
  readonly capturedAt: number;
  /** The ask in the requester's own unit, `null` when none was given. */
  readonly requestedMinutes: number | null;
}

/** What ONE evidence source could honestly contribute to a window. Read this before reading its entries. */
export interface EvidenceSourceMeta {
  /** The read this describes — `"motion().shifts"`, `"flags()"`, `"wire/captures"`, … */
  readonly source: string;
  /** false ⇒ the entries carry no comparable timestamp; the source ships WHOLE and `reason` says why. */
  readonly windowFilterable: boolean;
  /** Why a non-filterable source is non-filterable. Absent on filterable sources. */
  readonly reason?: string;
  /** The ring's capacity; `null` where the source has no cap. */
  readonly cap: number | null;
  /** How many entries the ring held before the window filter. */
  readonly held: number;
  /** How many entries the window kept (equals `held` for a non-filterable source). */
  readonly kept: number;
  /** Wall-clock epoch ms of the oldest entry the ring still holds, when that is NEWER than the requested
   *  start — the ring dropped part of the asked-for window. `null` ⇒ the ring reaches the whole ask. */
  readonly truncatedAt: number | null;
  /** Entries the ring evicted since its last reset, where the ring counts them (most do not). */
  readonly dropped?: number;
}

/** One source's contribution: the entries plus the meta that keeps them honest. */
export interface EvidenceSlice<T> {
  readonly entries: readonly T[];
  readonly meta: EvidenceSourceMeta;
}

/** Resolve an optional "~N minutes ago" into the window every source is filtered on. A non-finite, zero or
 *  negative ask is treated as NO ask (the whole ring), never as an empty window. */
export function resolveEvidenceWindow(capturedAt: number, requestedMinutes: number | null): EvidenceWindow {
  if (requestedMinutes === null || !Number.isFinite(requestedMinutes) || requestedMinutes <= 0) {
    return { requestedFromAt: null, fromAt: null, padMs: EVIDENCE_WINDOW_PAD_MS, capturedAt, requestedMinutes: null };
  }
  const requestedFromAt = capturedAt - requestedMinutes * MS_PER_MINUTE;
  return { requestedFromAt, fromAt: requestedFromAt - EVIDENCE_WINDOW_PAD_MS, padMs: EVIDENCE_WINDOW_PAD_MS, capturedAt, requestedMinutes };
}

/** Filter one timestamped source to the window and account for what its ring could not reach. */
export function sliceByWindow<T>(args: {
  readonly source: string;
  readonly entries: readonly T[];
  readonly at: (entry: T) => number;
  readonly window: EvidenceWindow;
  readonly cap: number | null;
  readonly dropped?: number;
}): EvidenceSlice<T> {
  const { source, entries, at, window, cap } = args;
  const from = window.fromAt;
  const kept = from === null ? [...entries] : entries.filter((entry) => at(entry) >= from);
  // TRUNCATION IS ABOUT THE RING, NOT THE FILTER: the question is whether the ring still HOLDS anything as old
  // as the ask. An oldest-held entry newer than the requested start means the cap already evicted part of the
  // window, and the reader is looking at a partial answer that must say where it begins.
  const stamps = entries.map(at);
  const oldestHeld = stamps.length === 0 ? null : Math.min(...stamps);
  const requested = window.requestedFromAt;
  const truncatedAt = requested !== null && oldestHeld !== null && oldestHeld > requested ? oldestHeld : null;
  return {
    entries: kept,
    meta: {
      source,
      windowFilterable: true,
      cap,
      held: entries.length,
      kept: kept.length,
      truncatedAt,
      ...(args.dropped === undefined ? {} : { dropped: args.dropped }),
    },
  };
}

/** Ship a source WHOLE with the reason it cannot answer a time question — never filter on a timestamp that does
 *  not mean what a filter would assume (the flagger ring's per-session dedupe is the canonical case). */
export function wholeSource<T>(args: {
  readonly source: string;
  readonly entries: readonly T[];
  readonly reason: string;
  readonly cap: number | null;
}): EvidenceSlice<T> {
  return {
    entries: [...args.entries],
    meta: {
      source: args.source,
      windowFilterable: false,
      reason: args.reason,
      cap: args.cap,
      held: args.entries.length,
      kept: args.entries.length,
      truncatedAt: null,
    },
  };
}
