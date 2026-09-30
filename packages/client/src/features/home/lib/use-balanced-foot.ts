// The shelf foot's balancer. Its three blocks (the side tile, the last tile, the doorway group) either stack or pair,
// with the last tile beside the other two. Which one levels the columns depends on how tall each block settled, so it
// is measured, not declared: a full bank wants the pair and an empty one the stack.

import type { RefObject } from "react";
import { useLayoutEffect } from "react";

/** The shelf attribute the foot's layout classes read; absent means stacked. */
export const FOOT_ATTRIBUTE = "data-foot";
const PAIRED = "paired";
/** A switch must level the columns by more than this, so width-dependent heights cannot make it flicker. */
const HYSTERESIS_PX = 24;
const TRACK_SEPARATOR = /\s+/u;

function height(el: Element): number {
  return el.getBoundingClientRect().height;
}

/** Whether the foot should pair, given its blocks: switch only when the other arrangement levels the columns by more
 *  than the hysteresis. */
function shouldPair(
  columns: { readonly hearth: Element; readonly shelf: Element },
  blocks: readonly [Element, Element, Element],
  gap: number,
  isPaired: boolean,
): boolean {
  const { hearth, shelf } = columns;
  const [side, last, fold] = blocks;
  const paired = Math.max(height(last), height(side) + gap + height(fold));
  const stacked = height(side) + gap + Math.max(height(last), height(fold));
  const others = height(shelf) - (isPaired ? paired : stacked);
  const offBy = (footHeight: number): number => Math.abs(height(hearth) - (others + footHeight));
  const current = offBy(isPaired ? paired : stacked);
  const alternative = offBy(isPaired ? stacked : paired);
  return alternative + HYSTERESIS_PX < current ? !isPaired : isPaired;
}

/**
 * Pair or stack the shelf foot, whichever ends the two columns closer, re-decided whenever either column resizes.
 *
 * @remarks It writes the attribute from the `ResizeObserver` callback, which runs after layout and before paint, so
 * the page never paints the losing arrangement; no React state is involved, so there is no second commit.
 */
export function useBalancedFoot(
  hearthRef: RefObject<HTMLElement | null>,
  shelfRef: RefObject<HTMLElement | null>,
  footRef: RefObject<HTMLElement | null>,
): void {
  useLayoutEffect(() => {
    const hearth = hearthRef.current;
    const shelf = shelfRef.current;
    const foot = footRef.current;
    if (hearth === null || shelf === null || foot === null) {
      return;
    }
    const balance = (): void => {
      const [side, last, fold] = [...foot.children];
      const split = getComputedStyle(foot).gridTemplateColumns.trim().split(TRACK_SEPARATOR).length === 2;
      const pair =
        split && side !== undefined && last !== undefined && fold !== undefined
          ? shouldPair(
              { hearth, shelf },
              [side, last, fold],
              Number.parseFloat(getComputedStyle(foot).rowGap) || 0,
              shelf.getAttribute(FOOT_ATTRIBUTE) === PAIRED,
            )
          : false;
      if (pair) {
        shelf.setAttribute(FOOT_ATTRIBUTE, PAIRED);
      } else {
        shelf.removeAttribute(FOOT_ATTRIBUTE);
      }
    };
    const observer = new ResizeObserver(balance);
    observer.observe(hearth);
    observer.observe(shelf);
    return (): void => observer.disconnect();
  }, [hearthRef, shelfRef, footRef]);
}
