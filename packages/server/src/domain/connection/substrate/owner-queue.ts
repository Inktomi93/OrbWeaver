// One queue per owner for the writes that can move their embed space. A binding or row write is settled by probing the
// new embedder and then landing or undoing the write; a second write by the same owner waits until the first has fully
// landed or been undone, so no write can land in the middle of another's probe.
//
// ASSUMES(single-replica): the queue is per process. The server is one process over one SQLite file
// (`packages/db/src/client/index.ts`: a `file:` url holds ONE native connection), and every connection write runs in it.

import type { UserId } from "@orb/kit/ids";

/** A queue that runs each owner's writes one at a time, in the order they arrive. */
export function createOwnerWriteQueue(): <T>(ownerId: UserId, write: () => Promise<T>) => Promise<T> {
  const tails = new Map<UserId, Promise<void>>();
  return <T>(ownerId: UserId, write: () => Promise<T>): Promise<T> => {
    const previous = tails.get(ownerId) ?? Promise.resolve();
    const next = previous.then(write);
    // @orb-waive caught-failure-ownership(next): the queue only waits for this write to settle before the next one
    // runs; the write's caller receives its rejection through the returned `next`.
    const settled = next.then(
      () => undefined,
      () => undefined,
    );
    // The last write out drops the owner's entry, so the map holds only owners with a write in flight.
    const tail = settled.finally(() => {
      if (tails.get(ownerId) === tail) {
        tails.delete(ownerId);
      }
    });
    tails.set(ownerId, tail);
    return next;
  };
}
