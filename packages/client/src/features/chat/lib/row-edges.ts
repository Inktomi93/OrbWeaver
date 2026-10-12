// A message's designed edges: the pinned header bar at its top and the actions it carries, one recipe per
// chat style (`RowSkin.pinnedHeader`, `RowSkin.actionsRow`). The swipe foot at its bottom is the matched
// half (pager-chrome.ts). Every paint here applies only while the header is pinned (`usePinnedHeader`).

import type { MessageRole } from "@orb/kit/message-role";

/** The bar's paint while pinned, for a row of this role. */
export interface PinnedHeader {
  readonly paint: (role: MessageRole) => string;
}

// @orb-waive no-inline-wire-interface(ActionsRow): baselined when the gate widened; burn-down item 904.
/** What the header bar carries. `identity: false` is a bar with no speaker (stock document): only the
 *  actions, as a quiet chip at the trailing edge, with a line of its own on the last row only. `surface` is
 *  the plate the actions cluster itself paints: it fades in and out with the actions, so a chip that sits
 *  over the page is never an empty box and never glyphs on bare words. */
export interface ActionsRow {
  readonly identity: boolean;
  readonly surface: string;
}

// The fade under a pinned bar: the bar's own surface dissolving to nothing over one block step, so the line
// scrolling under the bar's edge is faded, never guillotined. Out of flow (`top-full`), so it adds no box to
// the measured row height `exceedsViewport` reads.
const FADE_BELOW =
  "after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-block after:bg-linear-to-b after:to-transparent after:content-['']";

// The filled cards paint the role's own bubble fill and its paired ink, name and timestamp included (the
// speaker inks derive from the page and are not judged against a bubble fill).
const ROLE_FILL: Record<MessageRole, string> = {
  user: "bg-user-bubble text-user-bubble-foreground after:from-user-bubble",
  assistant: "bg-ai-bubble text-ai-bubble-foreground after:from-ai-bubble",
  system: "bg-system-bubble text-system-bubble-foreground after:from-system-bubble",
};
const FILL_INK = "[&_[data-slot=message-attribution]_*]:text-inherit [&_[data-slot=message-metadata-timestamp]]:text-inherit";

// A filled card's bar reaches the card's side edges. The reach is the bubble's own inset on each side,
// which `globals.css` defaults to `--spacing-block` and echo widens to its art pane on the art side, so the
// bar spans the art as the card does.
const CARD_REACH = "-ml-(--row-reach-left) pl-(--row-reach-left) -mr-(--row-reach-right) pr-(--row-reach-right)";

/** Bubble, echo, whisper, ripple: the card's fill, its top radius and its full width. */
export const PINNED_CARD: PinnedHeader = {
  paint: (role) => `${ROLE_FILL[role]} ${FILL_INK} ${CARD_REACH} rounded-t-card ${FADE_BELOW}`,
};

/** Tide: the speaker row above the train pins as one of the train's own pills. */
export const PINNED_PILL: PinnedHeader = {
  paint: (role) => `${ROLE_FILL[role]} ${FILL_INK} rounded-card ${FADE_BELOW}`,
};

/** Flat, hush: no box at rest, so the bar is the reading band across the column's inset, fading below. */
export const PINNED_BAND: PinnedHeader = {
  paint: () => `bg-reading-band text-reading-plate-foreground after:from-reading-band -mx-section px-section @max-md:-mx-row @max-md:px-row ${FADE_BELOW}`,
};

/** Document: no name to pin. The bar is the actions chip alone, and the chip's plate is the actions'
 *  own (`ACTIONS_ONLY.surface`), so the bar paints nothing of its own. */
export const PINNED_CHIP: PinnedHeader = {
  paint: () => "",
};

export const ACTIONS_WITH_IDENTITY: ActionsRow = { identity: true, surface: "" };
// Positioned and raised: an overlay chip's plate must paint over the line it sits on, not under its words.
export const ACTIONS_ONLY: ActionsRow = { identity: false, surface: "relative z-(--z-raised) rounded-card bg-reading-band text-reading-plate-foreground" };
