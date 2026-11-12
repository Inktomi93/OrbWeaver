// A collection's census as the config host reads it: the count read, and what a Retry re-asks.

import type { QueryFilters } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import type { CollectionCount } from "#lib";

/** The slice of a TanStack query result the census reads. */
interface CensusRead {
  readonly data: number | undefined;
  readonly error: unknown;
  readonly refetch: () => Promise<unknown>;
}

/**
 * A collection's {@link CollectionCount} from its census read. The landing shows one failure arm while the census
 * has no number, and its Retry reaches here. The rows mount the moment the census lands and read a cached failure as
 * a failure, so a rows read that failed beside the census is re-asked in the same press.
 *
 * The rows read is named by its filter and never observed: the LIST band calls this hook for every library on every
 * Settings visit, and an observer there would fetch every library's rows. A rows read that was never asked has nothing
 * to re-ask; the rows ask it themselves when the count lands.
 */
export function useCollectionCount(census: CensusRead, rows: QueryFilters): CollectionCount {
  const queryClient = useQueryClient();
  return {
    count: census.data,
    failed: census.error !== null,
    // `refetch` takes an OPTIONS BAG, so it is wrapped rather than passed by reference.
    retry: (): void => {
      void census.refetch().catch(globalThis.reportError);
      void queryClient.refetchQueries({ ...rows, predicate: (query) => query.state.status === "error" }).catch(globalThis.reportError);
    },
  };
}
