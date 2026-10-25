// A part that sits flush in a card's corners (a band across its top, a foot along its bottom, a tile in one corner, a
// portrait welded to one side) rounds exactly those corners at the card's radius, so its paint follows the card's
// outline. `start` and `end` square the opposite side, because the welded edge meets the card flat.
export const CARD_CORNERS = {
  all: "rounded-card",
  top: "rounded-t-card",
  bottom: "rounded-b-card",
  topStart: "rounded-ss-card",
  topEnd: "rounded-se-card",
  start: "rounded-s-card rounded-e-none",
  end: "rounded-s-none rounded-e-card",
} as const;
