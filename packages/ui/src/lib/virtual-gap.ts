// Shared virtualizer token-math + the unbounded-window invariant, hoisted out of the three seals
// (virtual-list / message-list / media-grid) that each hand-rolled an identical copy. Pure functions
// over the spacing-token map + a thrown guard — the exact shared-infra tier the seals already lean on
// for focus-ring/motion; the old "each seal owns its own" comments predated this file.
import { TOKENS } from "#tokens";

// Intent-token gap between rows (maps to the --spacing-* scale — never a raw px). `tight` joined the set
// when the chat list virtualized (2026-08-09): its rows had always sat at `gap="tight"` as a plain <Stack>,
// and the seal's narrower vocabulary would have silently re-spaced a landed list by 2px to adopt it. The
// token itself is `spacing.tight` — the same one the <Stack> was resolving; nothing new is minted here.
export const GAP_TOKENS = ["tight", "field", "row", "block", "section", "gutter"] as const;
export type GapToken = (typeof GAP_TOKENS)[number];

// The virtualizer's `gap` option is a px number; spacing tokens are authored in rem.
const ROOT_FONT_SIZE_PX = 16;

// A scroll element taller than this many viewports at mount means the parent gave the list no bounded
// height, so the whole list is the "window" and virtualization is a no-op.
const UNBOUNDED_HEIGHT_VIEWPORT_MULTIPLIER = 3;

export function gapPxFor(token: GapToken | undefined): number {
  if (token === undefined) {
    return 0;
  }
  return Number.parseFloat(TOKENS[`spacing.${token}`].value) * ROOT_FONT_SIZE_PX;
}

// Structural scroll-element type so this file stays DOM-lib-free (lib/ compiles without the DOM lib —
// see reduced-motion-now.ts); a real HTMLElement is structurally compatible.
interface ScrollElement {
  readonly getBoundingClientRect: () => { readonly height: number };
}

// The unbounded-window tripwire — thrown, not warned. `seal` names the primitive and `noun` its unit
// ("list"/"grid") so the message reads naturally; no-op when the ref is not yet attached.
export function assertBoundedScrollHeight(el: ScrollElement | null, seal: string, noun = "list"): void {
  if (el === null) {
    return;
  }
  // globalThis (not `window`) so lib/ stays DOM-lib-free; in the browser useLayoutEffect where this
  // runs, innerHeight is always defined — the guard just no-ops it in a non-DOM env.
  const innerHeight = (globalThis as { innerHeight?: number }).innerHeight;
  if (innerHeight === undefined) {
    return;
  }
  const maxHeightPx = innerHeight * UNBOUNDED_HEIGHT_VIEWPORT_MULTIPLIER;
  const measuredPx = el.getBoundingClientRect().height;
  if (measuredPx > maxHeightPx) {
    throw new Error(
      `${seal}: the scroll container measured ${Math.round(measuredPx)}px tall — over ` +
        `${UNBOUNDED_HEIGHT_VIEWPORT_MULTIPLIER}× the viewport (${Math.round(maxHeightPx)}px). ` +
        `The parent gave the ${noun} no bounded height, so every row is 'visible' and ` +
        "virtualization is a no-op. Fix: constrain the parent (e.g. h-full inside a sized " +
        `layout region) so the ${noun} scrolls inside a real window.`,
    );
  }
}
