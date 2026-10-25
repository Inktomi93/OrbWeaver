// A message's designed edges: the pinned header bar at its top and the actions it carries, one row per chat style
// (`RowSkin.pinnedHeader`, `RowSkin.actionsRow`). The swipe foot at its bottom is the matched half (pager-chrome.ts).
// The bar's paint applies only while the header is pinned (`usePinnedHeader`); `NameRowFrame` turns each field into
// `@orb/ui` props.

/** What the header bar carries. `identity: false` is a bar with no speaker (stock document): only the actions, as a
 *  quiet chip at the trailing edge, with a line of its own on the last row only. `chip` paints the reading band under
 *  the actions cluster itself, fading with it, so a chip over the page is never an empty box or glyphs on bare words. */
export interface ActionsRow {
  readonly identity: boolean;
  readonly chip: boolean;
}

/** The bar's paint while pinned. */
export interface PinnedHeader {
  /** `role`: the row's own bubble fill and ink; `band`: the reading band; `none`: the bar paints nothing of its own. */
  readonly fill: "role" | "band" | "none";
  /** The card corners the bar's fill follows: a card's top edge, or a pill's whole outline. */
  readonly corners?: "top" | "all";
  /** How far the bar reaches past the content inset: to the card's side edges, or across the column's reading inset. */
  readonly reach: "card" | "column" | "none";
}

/** Bubble, echo, whisper, ripple: the card's fill across its full width, with its top corners. */
export const PINNED_CARD: PinnedHeader = { fill: "role", corners: "top", reach: "card" };

/** Tide: the speaker row above the train pins as one of the train's own pills. */
export const PINNED_PILL: PinnedHeader = { fill: "role", corners: "all", reach: "none" };

/** Flat, hush: no box at rest, so the bar is the reading band across the column's inset. */
export const PINNED_BAND: PinnedHeader = { fill: "band", reach: "column" };

/** Document: no name to pin. The bar is the actions chip alone, which paints its own band (`ACTIONS_ONLY`). */
export const PINNED_CHIP: PinnedHeader = { fill: "none", reach: "none" };

export const ACTIONS_WITH_IDENTITY: ActionsRow = { identity: true, chip: false };
export const ACTIONS_ONLY: ActionsRow = { identity: false, chip: true };
