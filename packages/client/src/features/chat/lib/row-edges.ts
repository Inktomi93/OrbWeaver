// A message's designed edges: the pinned header bar at its top and the actions it carries, one row per chat style
// (`RowSkin.pinnedHeader`, `RowSkin.actionsRow`). The swipe foot at its bottom is the matched half (pager-chrome.ts).
// The bar's paint applies only while the header is pinned (`usePinnedHeader`); `NameRowFrame` turns each field into
// `@orb/ui` props.

/** What the header bar carries. `identity: false` is a bar with no speaker (stock document): only the actions, as a
 *  quiet chip at the trailing edge at rest, with a line of its own on the last row only. While pinned, its frame
 *  covers the reading width without adding identity. `chip` backs the actions cluster itself at rest. */
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
  /** The backing reaches the card edges, the column inset, or the train's full reading width. */
  readonly reach: "card" | "column" | "train" | "none";
}

/** Bubble, echo, whisper, ripple: the card's fill across its full width, with its top corners. */
export const PINNED_CARD: PinnedHeader = { fill: "role", corners: "top", reach: "card" };

/** Tide: the role-filled pinned header spans the train so it cannot mask only part of a prose line. */
export const PINNED_TRAIN: PinnedHeader = { fill: "role", reach: "train" };

/** Flat, hush and document: the pinned bar covers the reading width without adding a filled box at rest. */
export const PINNED_BAND: PinnedHeader = { fill: "band", reach: "column" };

export const ACTIONS_WITH_IDENTITY: ActionsRow = { identity: true, chip: false };
export const ACTIONS_ONLY: ActionsRow = { identity: false, chip: true };
