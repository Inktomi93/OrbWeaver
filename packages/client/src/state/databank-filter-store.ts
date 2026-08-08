// The databank-list FILTER store: an optional "show only the documents in this ingest phase" scope the
// Databank LIST honors. The `chat-list-filter-store` twin, and for the same structural reason — the WRITER
// (home's databank tile, on another section entirely) and the READER (the library pane) are sibling shell
// regions with no shared React ancestor, so they share through state, not props.
//
// WHY IT EXISTS (side-eye 2026-08-08 P2-a): home's tile reports the bank's ingest health as aggregate chips
// — "12 stalled", "11 empty". A chip that names twelve dead jobs and offers no way to reach them is a
// dead-end notice: the user has to go to the Databank, guess which of 46 rows the chips meant, and count.
// Each aggregate is a CONTROL now, and this is what it writes.
//
// THIS DOES NOT REOPEN D-5. That ruling declined an ORIGIN facet ("upload/web/youtube/wiki/text") on the
// library — a taxonomy axis with no evidence of need at observed bank sizes, and one the SERVER would have
// to serve (`databank.list({origin})`). This is a different axis: ingest phase is a CLIENT DERIVATION over
// counts the list already returns (there is no status column), it is a transient triage scope rather than a
// browsing facet, and it exists to answer a question the product itself just asked the user. No server read
// changes.
//
// `createGatedStore`, not persisted: a hard reload landing on the unfiltered bank is right — a triage scope
// is about the thing you clicked a moment ago, and a filter that survives a restart is a filter you forget
// is on.

import { createGatedStore } from "./create-gated-store.ts";

/** The derived ingest phase of a document — the CLIENT's answer to "where is this in its ingest", since the
 *  schema deliberately has no status column and the chunk/embed counts are the only truth.
 *
 *  THE TUPLE HOMES HERE, not in `features/databank/lib` where the derivation lives, because the axis became
 *  reachable from the SHELL the moment a phase could be a list scope (the store below names it, and a
 *  feature `lib/` may not export a type — `no-inline-types`). The derivation still owns the RULES
 *  (`ingestPhase()` and its badge/chip Records); this owns only the vocabulary they speak. */
export const INGEST_PHASES = ["empty", "indexing", "embedding", "ready", "stalled"] as const;
export type IngestPhase = (typeof INGEST_PHASES)[number];

interface DatabankFilterState {
  readonly phaseFilter: IngestPhase | null;
}

const useDatabankFilterStore = createGatedStore<DatabankFilterState>("databank-filter", (): DatabankFilterState => ({ phaseFilter: null }));

/** Scope the Databank LIST to one ingest phase (home's health chips, and any future triage affordance) —
 *  the LIST filters to documents deriving that phase and shows a "filtered by [phase] ✕" clear chip. */
export function setDatabankPhaseFilter(phase: IngestPhase): void {
  useDatabankFilterStore.setState({ phaseFilter: phase }, false, "databank-filter/set");
}

/** Clear the phase scope — the LIST returns to the whole bank (the chip's ✕, and the filtered empty state's
 *  own way out). */
export function clearDatabankPhaseFilter(): void {
  useDatabankFilterStore.setState({ phaseFilter: null }, false, "databank-filter/clear");
}

/** Reactive: the active ingest-phase scope (`null` = the whole bank). A primitive selector. */
export function useDatabankPhaseFilter(): IngestPhase | null {
  return useDatabankFilterStore((s) => s.phaseFilter);
}
