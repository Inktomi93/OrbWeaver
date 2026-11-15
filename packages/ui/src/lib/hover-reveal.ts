import { COLOR_MOTION } from "./state-motion.ts";
// The hover-reveal postures for a row's trailing actions, keyed on the nearest `group` ancestor (a ListRow root is one).
// Opacity only: a display or visibility swap under a hover key moves layout under the pointer and oscillates.
// Where the primary input cannot hover (a phone, a stylus tablet) every arm stays visible; `hover-capable` hides it at rest
// only where hover exists, so a fine pointer that cannot hover is not left with a hidden cluster.
// Every arm names `scale` beside `opacity`: a button wears its press (`active:scale-95`) on the same transition-property
// group, and tailwind-merge keeps one, so an opacity-only arm would evict the press ease.
export const HOVER_REVEAL = {
  /** A named field group keeps nested groups from revealing unrelated row actions. */
  setting:
    "opacity-0 transition-[opacity,scale] duration-(--motion-fast) ease-out-expo group-hover/setting:opacity-100 group-focus-within/setting:opacity-100 has-[[data-popup-open]]:opacity-100",
  /** Hidden at rest, shown on the row's hover or focus-within. */
  hover: "transition-[opacity,scale] duration-(--motion-fast) ease-out-expo hover-capable:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
  /** Secondary chrome (a pin, a crown): faint on the row's hover, full on its own hover or focus, or when focus is inside it (it sits on a wrapper), always faint on touch. */
  faint:
    "opacity-faint transition-[opacity,scale] duration-(--motion-fast) ease-out-expo hover-capable:opacity-0 group-hover:opacity-receded group-has-focus-visible:opacity-receded hover:opacity-100 focus-visible:opacity-100 has-focus-visible:opacity-100",
  /** `hover` for a cluster of controls: it also takes no pointer while hidden, so a pass over the row lands on nothing. */
  interactive:
    "transition-[opacity,scale] duration-(--motion-fast) ease-out-expo hover-capable:opacity-0 hover-capable:pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto",
  /** Hidden and inert at rest at every pointer, shown on the row's hover or keyboard focus: a touch reader never sees it. */
  focus:
    "opacity-0 pointer-events-none transition-[opacity,scale] duration-(--motion-fast) ease-out-expo group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto",
} as const;

/** Art that is also its own tap target dims while the pointer is over it: `self` on the art's box, `parent` on a layer
 *  whose parent box takes the hover (a masked tile under the button that covers it). */
export const HOVER_DIM = {
  self: "hover:opacity-hover",
  parent: "hover-capable:[:hover>&]:opacity-hover",
} as const;

/** A rest-visible marker whose fact the revealed cluster also carries (a starred row's ★): it yields while the
 *  ListRow (`group/row`) is hovered or holds keyboard focus, so the row never paints the state twice. Visibility, not
 *  display, so the title line never reflows under the pointer; where the primary input cannot hover, a tap leaves it. */
export const HOVER_YIELD = "hover-capable:group-hover/row:invisible group-has-focus-visible/row:invisible";

/** The two halves of a swap between two spans in one grid cell, keyed on the nearest `group` (a ListRow root is one):
 *  `hide` on the span that yields, `show` on the one that takes its place. Both halves ride one condition, or the line
 *  goes blank. Hover swaps only where the primary input can hover, since a tap sets `:hover` and `:focus-within` on a
 *  phone, where the swap was never meant to exist. Keyboard focus (`:focus-visible` inside the group) swaps at every
 *  pointer, because a keyboard user has no hover; a pointer-caused focus does not match it. */
export const HOVER_SWAP = {
  hide: "hover-capable:group-hover:invisible group-has-focus-visible:invisible",
  show: "hover-capable:group-hover:visible group-has-focus-visible:visible",
} as const;

/** A visible cluster that is inert where the primary input can hover until its `group` row is hovered or holds focus, so a
 *  pass of the pointer over the row does not land on it. Without hover the cluster stays live. */
export const INERT_UNTIL_HOVER =
  "hover-capable:pointer-events-none hover-capable:group-hover:pointer-events-auto hover-capable:group-focus-within:pointer-events-auto";

// The cues a quiet part of a hovered `group` (a card that is one control) gives: its ink lifts to the foreground, or a
// trailing arrow nudges toward where the control goes.
export const HOVER_CUE = {
  lift: `${COLOR_MOTION} group-hover:text-foreground`,
  nudge: "inline-block transition-transform duration-(--motion-fast) ease-out-expo group-hover:translate-x-tight",
} as const;
