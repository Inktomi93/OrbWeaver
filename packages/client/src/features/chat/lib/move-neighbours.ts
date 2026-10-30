// What lies above and below one transcript row, for the host's Move up / Move down arrows.

import { MESSAGE_MOVE_DOWN_UNAVAILABLE, MESSAGE_MOVE_GENERATING, MESSAGE_MOVE_LOADING, MESSAGE_MOVE_UP_UNAVAILABLE } from "./message-action-names.ts";

/** A seq is the loaded neighbour's; `beyond*` says canon continues past the loaded rows (the paging query's own
 *  `hasPreviousPage` / `hasNextPage`), so that neighbour is not loaded yet. `settling` says the loaded pages are
 *  still catching up to the live tail, so a loaded neighbour may sit across a gap from this row. */
export interface MoveNeighbours {
  readonly previousSeq: number | null;
  readonly nextSeq: number | null;
  readonly beyondAbove: boolean;
  readonly beyondBelow: boolean;
  readonly settling: boolean;
}

export const NO_MOVE_NEIGHBOURS: MoveNeighbours = { previousSeq: null, nextSeq: null, beyondAbove: false, beyondBelow: false, settling: false };

/** The neighbours of `at` in the loaded, seq-ordered rows. Only the first and last loaded rows can have canon beyond them. */
export function moveNeighboursAt(
  rows: readonly { readonly seq: number }[],
  at: number,
  edges: { readonly earlier: boolean; readonly later: boolean; readonly settling: boolean },
): MoveNeighbours {
  if (at < 0) {
    return NO_MOVE_NEIGHBOURS;
  }
  return {
    previousSeq: rows[at - 1]?.seq ?? null,
    nextSeq: rows[at + 1]?.seq ?? null,
    beyondAbove: at === 0 && edges.earlier,
    beyondBelow: at === rows.length - 1 && edges.later,
    settling: edges.settling,
  };
}

function endReason(canMove: boolean, reason: string): string | undefined {
  return canMove ? undefined : reason;
}

/** Why each arrow is disabled, or undefined when it is live. A running turn, or pages still catching up to the live
 *  tail, disables both with one shared reason. */
export function moveReasons(neighbours: MoveNeighbours, generating: boolean): { readonly up: string | undefined; readonly down: string | undefined } {
  if (generating) {
    return { up: MESSAGE_MOVE_GENERATING, down: MESSAGE_MOVE_GENERATING };
  }
  if (neighbours.settling) {
    return { up: MESSAGE_MOVE_LOADING, down: MESSAGE_MOVE_LOADING };
  }
  return {
    up: endReason(neighbours.previousSeq !== null || neighbours.beyondAbove, MESSAGE_MOVE_UP_UNAVAILABLE),
    down: endReason(neighbours.nextSeq !== null || neighbours.beyondBelow, MESSAGE_MOVE_DOWN_UNAVAILABLE),
  };
}
