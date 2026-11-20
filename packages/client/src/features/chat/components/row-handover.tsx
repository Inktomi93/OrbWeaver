// A reply's hand-over from its streamed row to its settled row, inside ONE transcript item. The streamed row's panels
// are drawn in frames of their own, and the settled row's frame loads its own document, so a swap at the commit would
// show the settled row's stand-ins (forming chips) until its frame draws. The item keeps the streamed row on screen and
// lays the settled row out beneath it, invisible and inert, at the item's full width, so its frame mints, loads and
// measures; the settled row shows when it reports that it drew (`RowDrawWatch`).
//
// THE TWO SLOTS ARE POSITIONAL AND ALWAYS RENDERED, so dropping the streamed row and showing the settled one is a prop
// change on the same elements: the settled row's frame is never remounted, which would reload its document and bring
// the stand-ins back. Every transcript item renders through this component for that reason.
//
// A ROW HAS DRAWN when no stand-in in it is mounted: each stand-in a routed frame shows while its document is on the
// way registers a hold (`HoldsRowDraw`). A row with no frame holds nothing and reports at once.

import { Stack } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { createContext, use, useEffect, useLayoutEffect, useRef, useState } from "react";

interface RowDrawHolds {
  /** Register one mounted stand-in; the returned release unregisters it. */
  readonly hold: () => () => void;
}

const RowDrawContext = createContext<RowDrawHolds | null>(null);
RowDrawContext.displayName = "RowDrawContext";

// Reports through `onDrawn` once no stand-in inside it is mounted. A stand-in that swaps for another in one commit (the
// held run for the veiled frame's pending view) releases and holds in that commit, so the check waits for the passive
// effects after it instead of reading the count between the two.
function RowDrawWatch({ onDrawn, children }: { readonly onDrawn: (() => void) | undefined; readonly children: ReactNode }): ReactElement {
  const open = useRef(0);
  const [released, setReleased] = useState(0);
  const [holds] = useState<RowDrawHolds>(() => ({
    hold: (): (() => void) => {
      open.current += 1;
      let held = true;
      return (): void => {
        if (held) {
          held = false;
          open.current -= 1;
          setReleased((count) => count + 1);
        }
      };
    },
  }));
  // biome-ignore lint/correctness/useExhaustiveDependencies: `released` is the re-check trigger; the count it follows lives in a ref, so a hold and its release in one commit never read as drawn.
  useEffect(() => {
    if (onDrawn !== undefined && open.current === 0) {
      onDrawn();
    }
  }, [onDrawn, released]);
  return <RowDrawContext value={holds}>{children}</RowDrawContext>;
}

/** Holds the settled row's hand-over while mounted: wraps a stand-in a routed frame shows until its document draws, or
 *  sits beside a body that is laid out unseen. */
export function HoldsRowDraw({ children }: { readonly children?: ReactNode }): ReactElement {
  const holds = use(RowDrawContext);
  useLayoutEffect(() => holds?.hold(), [holds]);
  return <>{children}</>;
}

export interface RowHandoverProps {
  /** The streamed row, while it still stands in for the settled one; null once the settled row drew. */
  readonly ghost: ReactNode;
  /** The settled row; null while the reply has not committed. */
  readonly row: ReactNode;
  /** Called once the settled row drew, while `ghost` still stands over it. */
  readonly onDrawn: (() => void) | undefined;
}

export function RowHandover({ ghost, row, onDrawn }: RowHandoverProps): ReactElement {
  const beneath = ghost !== null && row !== null;
  return (
    <>
      {ghost}
      <RowDrawWatch onDrawn={beneath ? onDrawn : undefined}>
        {row === null ? null : (
          <Stack
            placed={beneath ? "fill" : undefined}
            className={beneath ? "invisible overflow-hidden" : undefined}
            inert={beneath}
            aria-hidden={beneath ? true : undefined}
            data-slot="row-handover-settled"
            data-beneath={beneath ? "" : undefined}
          >
            {row}
          </Stack>
        )}
      </RowDrawWatch>
    </>
  );
}
