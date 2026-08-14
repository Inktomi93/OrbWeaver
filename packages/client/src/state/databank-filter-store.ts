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
// THIS DOES NOT REOPEN D-5, WHICH IS ABOUT THE ORIGIN FACET. That ruling declined an ORIGIN chip
// ("upload/web/youtube/wiki/text") on the library — a taxonomy axis with no evidence of need at observed bank
// sizes. No origin chip has been added; `databank.list` has always accepted the facet and still offers no
// control for it.
//
// AMENDED 2026-08-14. This paragraph used to continue: "ingest phase is a CLIENT DERIVATION over counts the
// list already returns … No server read changes." That was true of a scope over a LOADED WINDOW, and it is
// exactly what the owner ruling of 2026-08-13 retired — a paged list's lenses are the server's, or they are a
// claim about rows the client never fetched (a chip reading "12 stalled" would scope the pane to whichever of
// those twelve happened to be on the loaded pages). The phase axis is now an INPUT to `databank.list`; its
// vocabulary moved to `@orb/contracts/databank` with the wire, and this store holds only which one is on.
//
// `createGatedStore`, not persisted: a hard reload landing on the unfiltered bank is right — a triage scope
// is about the thing you clicked a moment ago, and a filter that survives a restart is a filter you forget
// is on.

import type { IngestPhase } from "@orb/contracts/databank";
import { createGatedStore } from "./create-gated-store.ts";

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
