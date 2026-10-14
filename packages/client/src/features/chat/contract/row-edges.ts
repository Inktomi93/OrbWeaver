// The client skin recipe for the pinned actions bar, not a network response.

/** What the header bar carries. `identity: false` is a bar with no speaker (stock document): only the
 *  actions, as a quiet chip at the trailing edge, with a line of its own on the last row only. `surface` is
 *  the plate the actions cluster itself paints: it fades in and out with the actions, so a chip that sits
 *  over the page is never an empty box and never glyphs on bare words. */
export interface ActionsRow {
  readonly identity: boolean;
  readonly surface: string;
}
