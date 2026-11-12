// A collection's census as the config host reads it: the count read, and what a Retry re-asks.

import type { CollectionCount } from "#lib";

/** The slice of a TanStack query result the census reads. */
interface CensusRead {
  readonly data: unknown;
  readonly error: unknown;
  readonly refetch: () => Promise<unknown>;
}

/**
 * A collection's {@link CollectionCount} from its census read and its rows read. The landing shows one failure
 * arm while the census has no number, and its Retry reaches here. The rows mount the moment the census lands and
 * read a cached failure as a failure, so a rows read that failed beside the census is re-asked in the same press.
 */
export function collectionCount(census: CensusRead & { readonly data: number | undefined }, rows: CensusRead): CollectionCount {
  return {
    count: census.data,
    failed: census.error !== null,
    // `refetch` takes an OPTIONS BAG, so it is wrapped rather than passed by reference.
    retry: (): void => {
      for (const read of rows.error === null ? [census] : [census, rows]) {
        void read.refetch().catch(globalThis.reportError);
      }
    },
  };
}
