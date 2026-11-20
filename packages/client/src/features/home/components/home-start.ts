// Home's one start control and the seam a tile in its empty state uses to take it as its own action. Home reads no feature: a tile says it
// holds the control (`HomeTileContribution.useHoldsStart`), and Home draws it nowhere else. A tile that cannot say yet reports `null`, and
// Home draws the control nowhere until it can.

import type { ReactNode } from "react";
import { createContext } from "react";

interface HomeStartSeam {
  readonly start: ReactNode;
  readonly onHold: (tileId: string, held: boolean | null) => void;
}

export const HomeStart = createContext<HomeStartSeam>({ start: null, onHold: () => undefined });
HomeStart.displayName = "HomeStart";

/** The tiles holding the control after `tileId` changes its mind; the same array while nothing changed, so a repeat report costs no render. */
export function holdersAfter(current: readonly string[], tileId: string, held: boolean): readonly string[] {
  if (current.includes(tileId) === held) {
    return current;
  }
  return held ? [...current, tileId] : current.filter((id) => id !== tileId);
}
