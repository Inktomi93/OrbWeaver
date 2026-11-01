// Keeps the keyboard with a pressed-for page. The press leaves focus on a button that is now far above the new
// rows, or that the last page unmounts, and the next Tab would then restart from the top of the popup.

import type { RefCallback } from "react";
import { useState } from "react";

interface PageFocusArgs {
  readonly rowCount: number;
  /** Resolves whether the press added rows. */
  readonly loadMore: () => Promise<boolean>;
  /** A row to land on as soon as it mounts, for a list that opens on a reader's press. */
  readonly firstRow?: number;
}

interface PageFocus {
  readonly loadNextPage: () => void;
  /** The ref for the row at `index`: the landing row takes focus when it mounts, and no other row is touched. */
  readonly rowRef: (index: number) => RefCallback<HTMLElement> | undefined;
}

export function usePageFocus({ rowCount, loadMore, firstRow }: PageFocusArgs): PageFocus {
  const [landing, setLanding] = useState<number | null>(firstRow ?? null);
  return {
    loadNextPage: (): void => {
      setLanding(rowCount);
      // A press that added no row must disarm here: the landing row may never mount, and a later refetch that
      // puts a row at this index would then pull focus with no press behind it.
      void loadMore().then((added) => {
        if (!added) {
          setLanding(null);
        }
      });
    },
    rowRef: (index) =>
      index === landing
        ? (element): void => {
            if (element !== null) {
              element.focus();
              setLanding(null);
            }
          }
        : undefined,
  };
}
