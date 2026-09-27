// Where focus goes in a gallery grid (the dialog's, the add-picker's) when the cell that held it leaves, or new cells arrive. A removal lands
// on the next image (the previous one at the end), or on the heading once the gallery is empty; a "Load more"
// hands focus to the first new image. In between, focus waits on the heading, never outside the dialog.

import type { MediaGridHandle, MediaGridKey } from "@orb/ui/media-grid";
import type { RefObject } from "react";
import { useEffect, useRef } from "react";

// A removal waits for two things: the lightbox's close to finish (it returns focus as it goes) and the refetched
// grid without the removed row (the next cell's position is only final then).
interface PendingRemoval<TId extends MediaGridKey> {
  readonly removed: TId;
  readonly next: TId | null;
  lightboxClosed: boolean;
}

// A "Load more" waits for its page: `started` once the fetch is seen in flight, so a settle is not read early.
interface PendingLoad {
  readonly from: number;
  started: boolean;
}

interface GalleryFocusInput<TId extends MediaGridKey> {
  /** The grid the caller renders (`ref` on its `MediaGrid`). */
  readonly gridRef: RefObject<MediaGridHandle | null>;
  /** Where focus waits, and lands once the grid is empty: the dialog's heading. `null` when there is none. */
  readonly headingRef: RefObject<HTMLHeadingElement | null> | null;
  readonly ids: readonly TId[];
  readonly isFetchingNextPage: boolean;
  readonly hasNextPage: boolean;
  readonly onLoadMore: () => void;
}

interface GalleryFocus<TId extends MediaGridKey> {
  /** Run a "Load more", remembering where its cells will start. */
  readonly loadMore: () => void;
  /** Record a removal that has succeeded, before the lightbox closes. */
  readonly noteRemoval: (removed: TId) => void;
  /** The lightbox's `finalFocus`: the heading while a removal settles, else Base UI's default (the opening cell). */
  readonly lightboxFinalFocus: () => HTMLElement | true;
  /** The lightbox's `onOpenChangeComplete`. */
  readonly onLightboxSettled: (open: boolean) => void;
}

export function useGalleryFocus<TId extends MediaGridKey>({
  gridRef,
  headingRef,
  ids,
  isFetchingNextPage,
  hasNextPage,
  onLoadMore,
}: GalleryFocusInput<TId>): GalleryFocus<TId> {
  const removalRef = useRef<PendingRemoval<TId> | null>(null);
  const loadRef = useRef<PendingLoad | null>(null);

  const settleRemoval = (current: readonly TId[]): void => {
    const removal = removalRef.current;
    if (removal === null || !removal.lightboxClosed || current.includes(removal.removed)) {
      return;
    }
    removalRef.current = null;
    if (removal.next === null || gridRef.current?.focusItem(removal.next) !== true) {
      headingRef?.current?.focus();
    }
  };

  const settleLoad = (current: readonly TId[]): void => {
    const load = loadRef.current;
    if (load === null) {
      return;
    }
    const first = current[load.from];
    if (first !== undefined) {
      loadRef.current = null;
      gridRef.current?.focusItem(first);
      return;
    }
    if (isFetchingNextPage) {
      load.started = true;
      return;
    }
    if (!load.started) {
      return;
    }
    loadRef.current = null;
    // A failed page keeps its "Load more" and the focus on it; an empty last page removes the control, so
    // focus goes to the end of the list it was extending.
    const last = current.at(-1);
    if (!hasNextPage && last !== undefined) {
      gridRef.current?.focusItem(last);
    }
  };

  // Every commit may be the one that lands the refetched grid or the new page.
  useEffect(() => {
    settleRemoval(ids);
    settleLoad(ids);
  });

  return {
    loadMore: (): void => {
      loadRef.current = { from: ids.length, started: false };
      onLoadMore();
    },
    noteRemoval: (removed): void => {
      const index = ids.indexOf(removed);
      const next = index === -1 ? null : (ids[index + 1] ?? ids[index - 1] ?? null);
      removalRef.current = { removed, next, lightboxClosed: false };
    },
    lightboxFinalFocus: (): HTMLElement | true => (removalRef.current === null ? true : (headingRef?.current ?? true)),
    onLightboxSettled: (open): void => {
      const removal = removalRef.current;
      if (open || removal === null) {
        return;
      }
      removal.lightboxClosed = true;
      settleRemoval(ids);
    },
  };
}
