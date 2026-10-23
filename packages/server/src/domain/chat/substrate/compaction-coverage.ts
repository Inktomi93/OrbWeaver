// domain/chat/substrate/compaction-coverage — the ONE reading of a compaction coverage stamp.
// No marker is `null`, never a numeric 0: a launched imported room can hold a real seq-0 row.

/** True when a marker covering canon through `coveredThroughSeq` stands in for the row at `seq`; `null` covers nothing. */
export function isCoveredByCompaction(seq: number, coveredThroughSeq: number | null): boolean {
  return coveredThroughSeq !== null && seq <= coveredThroughSeq;
}
