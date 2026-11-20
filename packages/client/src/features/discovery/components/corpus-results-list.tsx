import { Stack } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { useLayoutEffect, useRef } from "react";
import { testId } from "#lib";
import { readCorpusResultScroll, setCorpusResultScroll } from "#state";

/**
 * Explore restores its result scroller after the query has produced the same list again.
 *
 * The scroller holds one row of window itself: it shares the bounded pane with the status line and the notes above it, and at
 * enlarged text those take the whole pane's floor and leave the results none.
 */
export function CorpusResultsList({
  label,
  children,
  retainFinderScroll,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly retainFinderScroll: boolean;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (retainFinderScroll && ref.current !== null) {
      ref.current.scrollTop = readCorpusResultScroll();
    }
  }, [retainFinderScroll]);
  return (
    <Stack
      ref={ref}
      aria-label={`Search results: ${label}`}
      scroll="y"
      grow={true}
      minHeight="scrollShort"
      data-testid={testId("corpusSearchResults")}
      gap="row"
      role="list"
      onScroll={retainFinderScroll ? (event): void => setCorpusResultScroll(event.currentTarget.scrollTop) : undefined}
    >
      {children}
    </Stack>
  );
}
