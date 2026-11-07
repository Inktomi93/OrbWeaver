// The count a roster prints beside its title, in one grammar: the Chats, Characters, Presets, Extensions, Databank and
// Refinery bands and their phone titles all read it.

/** `k of N` while a search or filter narrows the list, the bare total otherwise. A narrowed zero still names the
 *  total, so a search that missed reads as "your list is still there", never as an empty one. */
export function filteredCensus(shown: number, total: number, narrowed: boolean): number | string {
  return narrowed ? `${String(shown)} of ${String(total)}` : total;
}
