// ONE machine for every browse/list/grid view — the feature supplies the infinite query + a row
// renderer; the machine owns the tail-fetch guard, placeholder-keep on param change, and selection
// state. The hook is the logic half; the feature renders `items` via <VirtualList>/<MediaGrid>.

import type { DefaultError, InfiniteData, QueryKey, UseInfiniteQueryOptions } from "@tanstack/react-query";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { Trpc } from "./trpc.ts";

/** What the tRPC proxy's `.infiniteQueryOptions(input, opts)` returns — wrapped, never re-spelled.
 *  `TKey`/`TError` are the caller's real key/error types (the proxy's DataTag-keyed return + the
 *  TRPCClientErrorLike error don't structurally satisfy a fixed `readonly unknown[]`/`Error`). */
type BaseInfiniteOptions<TPage, TPageParam, TError = DefaultError, TKey extends QueryKey = QueryKey> = UseInfiniteQueryOptions<
  TPage,
  TError,
  InfiniteData<TPage, TPageParam>,
  TKey,
  TPageParam
>;

export interface CollectionSurfaceConfig<TItem, TPage, TParams, TPageParam, TError = DefaultError, TKey extends QueryKey = QueryKey> {
  /** `(t, params) => t.character.list.infiniteQueryOptions({...params}, { getNextPageParam, maxPages })`. */
  readonly query: (trpc: Trpc, params: TParams) => BaseInfiniteOptions<TPage, TPageParam, TError, TKey>;
  /** Flatten one page into rows. */
  readonly itemsOf: (page: TPage) => readonly TItem[];
  /** Stable id per row (selection + the virtualizer key — id-based, NEVER the index). */
  readonly idOf: (item: TItem) => string;
  /** The server CENSUS off a page, when the read serves one (`page.totalCount`). Omitted for reads that do
   *  not: a keyset surface's `items.length` is "loaded so far", and a readout that prints that number while
   *  meaning "how many there are" is the lie this seam exists to prevent — so the absence is `null`, never
   *  a plausible-looking count. */
  readonly totalOf?: (page: TPage) => number;
  /** Rows-from-the-tail threshold that triggers the next-page fetch. @defaultValue 12 */
  readonly endApproachRows?: number;
}

export interface CollectionSelection {
  readonly selected: ReadonlySet<string>;
  readonly isSelected: (id: string) => boolean;
  readonly toggle: (id: string) => void;
  readonly selectAll: (ids: readonly string[]) => void;
  readonly clear: () => void;
}

export interface CollectionSurface<TItem> {
  readonly items: readonly TItem[];
  /** How many rows match the query's scope on the SERVER — `null` when the read serves no census (or before
   *  the first page lands). Read off the FIRST page: every page of one keyset run counts the same scope. */
  readonly totalCount: number | null;
  /** WHEN these rows were true — the query's own `dataUpdatedAt`, forwarded because a surface whose rows
   *  carry a TIME-derived state (databank's stall verdict: an in-flight row whose `updatedAt` froze) needs a
   *  clock that ADVANCES with each refetch. A mount-time `useState(() => now())` snapshot would freeze and
   *  leave a document that wedged while the pane is open reading `Queued` forever; an ambient `Date.now()`
   *  off render is the impurity client-determinism forbids. `0` until the first read lands. */
  readonly dataUpdatedAt: number;
  readonly isPending: boolean;
  /** True while showing the PREVIOUS params' rows (grey them; gate forward-nav on it — §10). */
  readonly isPlaceholderData: boolean;
  readonly error: unknown | null;
  readonly isEmpty: boolean;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  /** Re-run the query — the enabled next-step affordance for the error state (UI-Arch §4.3 rule 1: no
   *  dead ends). Fire-and-forget (`=> void`): a Retry button never awaits; the boundary re-derives from
   *  `isPending`/`error` on the refetch. */
  readonly refetch: () => void;
  readonly selection: CollectionSelection;
  /** Spread into `<VirtualList>`: the id-keyed row key + the guarded tail-fetch. */
  readonly listProps: {
    readonly getItemKey: (item: TItem, index: number) => string;
    readonly onEndApproach: () => void;
    readonly endApproachRows: number;
  };
}

const DEFAULT_END_APPROACH_ROWS = 12;

export function createCollectionSurface<TItem, TPage, TParams, TPageParam = unknown, TError = DefaultError, TKey extends QueryKey = QueryKey>(
  config: CollectionSurfaceConfig<TItem, TPage, TParams, TPageParam, TError, TKey>,
): (deps: { trpc: Trpc }, params: TParams) => CollectionSurface<TItem> {
  // biome-ignore lint/nursery/noComponentHookFactories: factories run at module scope, so the returned hook has a stable identity (see forms/create-saved-entity-form.ts).
  return function useCollectionSurface({ trpc }, params): CollectionSurface<TItem> {
    const query = useInfiniteQuery({
      ...config.query(trpc, params),
      placeholderData: keepPreviousData,
    });

    const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set<string>());

    const items = query.data === undefined ? [] : query.data.pages.flatMap((p) => config.itemsOf(p));
    const firstPage = query.data?.pages[0];
    const totalCount = config.totalOf === undefined || firstPage === undefined ? null : config.totalOf(firstPage);

    // Destructured so the callback closes over exact slices, not the fresh-proxy-per-render `query` object.
    const { hasNextPage, isFetching, fetchNextPage, refetch } = query;
    const onEndApproach = (): void => {
      if (hasNextPage && !isFetching) {
        void fetchNextPage();
      }
    };
    const retry = (): void => {
      void refetch();
    };

    return {
      items,
      totalCount,
      dataUpdatedAt: query.dataUpdatedAt,
      isPending: query.isPending,
      isPlaceholderData: query.isPlaceholderData,
      error: query.error,
      isEmpty: !query.isPending && items.length === 0,
      hasNextPage: query.hasNextPage,
      isFetchingNextPage: query.isFetchingNextPage,
      refetch: retry,
      selection: {
        selected,
        isSelected: (id) => selected.has(id),
        toggle: (id): void => {
          setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
              next.delete(id);
            } else {
              next.add(id);
            }
            return next;
          });
        },
        selectAll: (ids): void => {
          setSelected(new Set(ids));
        },
        clear: (): void => {
          setSelected(new Set());
        },
      },
      listProps: {
        getItemKey: (item) => config.idOf(item),
        onEndApproach,
        endApproachRows: config.endApproachRows ?? DEFAULT_END_APPROACH_ROWS,
      },
    };
  };
}
