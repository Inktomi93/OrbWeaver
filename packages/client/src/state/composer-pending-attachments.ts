// How many files each room's composer has staged and not sent. The files live in the composer's own state, so nothing outside it can
// read them; a room that is deleted under the reader must still say whether they are lost, and this is the one count it reads.
// In memory only: attachments never persist, so a reload has none to report. The composer writes it on every change and does not
// clear it on unmount, because the unmount a gone room causes runs before the leave that reads it; a composer that mounts again
// starts from none and writes that.

const counts = new Map<string, number>();

/** Record how many attachments `scopeKey`'s composer holds now. */
export function notePendingAttachments(scopeKey: string, count: number): void {
  if (count === 0) {
    counts.delete(scopeKey);
    return;
  }
  counts.set(scopeKey, count);
}

/** The staged attachment count for `scopeKey`, forgotten as it is read: the room it belonged to is gone. */
export function takePendingAttachments(scopeKey: string): number {
  const count = counts.get(scopeKey) ?? 0;
  counts.delete(scopeKey);
  return count;
}
