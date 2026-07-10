// `createCollectionSurface` (UI-Primitives §13.1): ONE machine for every browse/list/grid view —
// the feature supplies the infinite query + a row renderer; the machine owns everything a hand-wired
// list gets wrong:
//   • `useInfiniteQuery` + `maxPages` (the sliding-window memory bound — UI-Lib-TanStack-Query.md §4;
//     requires BOTH direction param-getters, which the tRPC proxy's `infiniteQueryOptions` carries)
//   • `placeholderData: keepPreviousData` gated on `isPlaceholderData` — a filter/search/page change
//     keeps the prior rows visible instead of flashing empty (critical with a virtualized list to
//     avoid scroll jump — §10)
//   • the TAIL-FETCH GUARD off the VIRTUALIZER's own range (`onEndApproach` wires straight into
//     `<VirtualList>`'s prop) — `hasNextPage && !isFetching` before every fetch; NO
//     react-intersection-observer (§5: the virtualizer already reports tail proximity)
//   • the selection set (toggle/clear/selectAll) as plain local state.
// The hook is the logic half (node-reasoned, feature-agnostic); the feature renders `items` through
// `<VirtualList>`/`<MediaGrid>` with the returned `listProps`.

import type {
  DefaultError,
  InfiniteData,
  QueryKey,
  UseInfiniteQueryOptions,
} from "@tanstack/react-query";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import type { Trpc } from "./trpc";

/** What the tRPC proxy's `.infiniteQueryOptions(input, opts)` returns — wrapped, never re-spelled.
 *  `TKey`/`TError` (W1-1, same fix as `use-gated-query.ts`) are the CALLER's real key/error types,
 *  not a bare `readonly unknown[]`/`Error` — the proxy's actual return is DataTag-keyed (a branded
 *  TRPCQueryKey tuple) with a TRPCClientErrorLike error (which doesn't structurally satisfy `Error`
 *  — no `name` field), and a fixed `readonly unknown[]`/`Error` rejects it (`queryFn`/`retry` embed
 *  those types contravariantly). Defaulted to `QueryKey`/`DefaultError` (the Register-resolving
 *  alias — `Error` today, no `defaultError` registered) so a caller that isn't wrapping a real tRPC
 *  options call still infers cleanly, and every factory follows §G7 uniformly if that fork lands. */
type BaseInfiniteOptions<
  TPage,
  TPageParam,
  TError = DefaultError,
  TKey extends QueryKey = QueryKey,
> = UseInfiniteQueryOptions<TPage, TError, InfiniteData<TPage, TPageParam>, TKey, TPageParam>;

export interface CollectionSurfaceConfig<
  TItem,
  TPage,
  TParams,
  TPageParam,
  TError = DefaultError,
  TKey extends QueryKey = QueryKey,
> {
  /** `(t, params) => t.character.list.infiniteQueryOptions({...params}, { getNextPageParam, maxPages })`. */
  readonly query: (
    trpc: Trpc,
    params: TParams,
  ) => BaseInfiniteOptions<TPage, TPageParam, TError, TKey>;
  /** Flatten one page into rows. */
  readonly itemsOf: (page: TPage) => readonly TItem[];
  /** Stable id per row (selection + the virtualizer key — id-based, NEVER the index). */
  readonly idOf: (item: TItem) => string;
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

export function createCollectionSurface<
  TItem,
  TPage,
  TParams,
  TPageParam = unknown,
  TError = DefaultError,
  TKey extends QueryKey = QueryKey,
>(
  config: CollectionSurfaceConfig<TItem, TPage, TParams, TPageParam, TError, TKey>,
): (deps: { trpc: Trpc }, params: TParams) => CollectionSurface<TItem> {
  // biome-ignore lint/nursery/noComponentHookFactories: the D54 §13.1 editor-factory pattern — factories run at MODULE scope (const useCharacterList = createCollectionSurface(...)), so the returned hook has a stable identity (see forms/create-saved-entity-form.ts).
  return function useCollectionSurface({ trpc }, params): CollectionSurface<TItem> {
    const query = useInfiniteQuery({
      ...config.query(trpc, params),
      // A params change (search/filter/page) keeps the prior rows on screen — no empty flash, no
      // virtualized scroll jump. The surface greys rows on isPlaceholderData.
      placeholderData: keepPreviousData,
    });

    const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set<string>());

    const items = useMemo(
      () => (query.data === undefined ? [] : query.data.pages.flatMap((p) => config.itemsOf(p))),
      [query.data],
    );

    // Destructured so the callback deps are the exact slices (the result object is a fresh proxy
    // per render — depending on `query` itself would re-mint the callback every render).
    const { hasNextPage, isFetching, fetchNextPage, refetch } = query;
    const onEndApproach = useCallback((): void => {
      // The documented guard verbatim (§5): never a duplicate fetch, never a fetch past the end.
      if (hasNextPage && !isFetching) {
        void fetchNextPage();
      }
    }, [hasNextPage, isFetching, fetchNextPage]);
    const retry = useCallback((): void => {
      void refetch();
    }, [refetch]);

    return {
      items,
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
