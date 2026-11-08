// The inline room a content-sized flank column takes from the transcript has no token to reserve: the column's width is
// whatever its contributors paint. The room measures what the thread gave up and the composer region keeps that clear,
// so the composer and the rows stay on one axis beside a column of any width.

import type { RefObject } from "react";
import { useLayoutEffect } from "react";

/** Keep `region` clear of the width the flank row's thread gave up to the column beside it (nothing when the column stacks below). */
export function useFlankReserve(
  rowRef: RefObject<HTMLElement | null>,
  threadRef: RefObject<HTMLElement | null>,
  regionRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  useLayoutEffect(() => {
    const row = rowRef.current;
    const thread = threadRef.current;
    const region = regionRef.current;
    if (!enabled || row === null || thread === null || region === null) {
      return;
    }
    const publish = (): void => {
      const reserve = row.getBoundingClientRect().width - thread.getBoundingClientRect().width;
      region.style.paddingInlineEnd = `${String(reserve)}px`;
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(row);
    observer.observe(thread);
    return (): void => {
      observer.disconnect();
      region.style.paddingInlineEnd = "";
    };
  }, [rowRef, threadRef, regionRef, enabled]);
}
