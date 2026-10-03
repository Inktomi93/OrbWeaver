// The shelf foot's balancer. Its blocks (the side tile, the last tile, and the doorway group when one is declared)
// either stack or pair, with the last tile beside the rest. Which one levels the columns depends on how tall each
// block settled, so it is measured, not declared: a full bank wants the pair and an empty one the stack.

import type { RefObject } from "react";
import { useLayoutEffect } from "react";
import { readRememberedFootPaired, rememberHomeFootPaired } from "#state";

/** The shelf attribute the foot's layout classes read; absent means stacked. */
const FOOT_ATTRIBUTE = "data-foot";
const PAIRED = "paired";
/** A switch must level the columns by more than this, so width-dependent heights cannot make it flicker. */
const HYSTERESIS_PX = 24;
const TRACK_SEPARATOR = /\s+/u;
/** A column still showing a loading placeholder, or holding a tile out until its column is known, has not settled. */
const UNSETTLED = '[data-slot="skeleton"], [data-home-held]';

function height(el: Element): number {
  return el.getBoundingClientRect().height;
}

/** The foot's height in each arrangement. With a doorway group: paired puts the last tile beside the side tile over
 *  the group, stacked puts the side tile over the last tile beside the group. Without one: paired puts the two tiles
 *  side by side, stacked puts one over the other. */
function footHeights(side: Element, last: Element, fold: Element | undefined, gap: number): { readonly paired: number; readonly stacked: number } {
  if (fold === undefined) {
    return { paired: Math.max(height(side), height(last)), stacked: height(side) + gap + height(last) };
  }
  return {
    paired: Math.max(height(last), height(side) + gap + height(fold)),
    stacked: height(side) + gap + Math.max(height(last), height(fold)),
  };
}

/** Whether the foot should pair, given its blocks: switch only when the other arrangement levels the columns by more
 *  than the hysteresis. */
function shouldPair(
  columns: { readonly hearth: Element; readonly shelf: Element },
  blocks: { readonly side: Element; readonly last: Element; readonly fold: Element | undefined },
  gap: number,
  isPaired: boolean,
): boolean {
  const { hearth, shelf } = columns;
  const { paired, stacked } = footHeights(blocks.side, blocks.last, blocks.fold, gap);
  const others = height(shelf) - (isPaired ? paired : stacked);
  const offBy = (footHeight: number): number => Math.abs(height(hearth) - (others + footHeight));
  const current = offBy(isPaired ? paired : stacked);
  const alternative = offBy(isPaired ? stacked : paired);
  return alternative + HYSTERESIS_PX < current ? !isPaired : isPaired;
}

function applyFoot(shelf: Element, paired: boolean): void {
  if (paired) {
    shelf.setAttribute(FOOT_ATTRIBUTE, PAIRED);
  } else {
    shelf.removeAttribute(FOOT_ATTRIBUTE);
  }
}

/**
 * Pair or stack the shelf foot, whichever ends the two columns closer, and remember it for the next boot.
 *
 * @remarks The first paint takes the arrangement this device last settled on (stacked when it never has, the empty
 * house's arrangement, which a first boot most often is). It is re-decided only once both columns have settled, since a
 * decision on skeleton heights paints and then loses to the content. Content settles through DOM commits, so a
 * `MutationObserver` decides before that frame paints. A width change does not mutate the DOM, so a `ResizeObserver`
 * catches it and decides on the next frame: writing the attribute inside its own callback resizes the observed shelf,
 * which the browser reports as an undelivered-notification loop.
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
    applyFoot(shelf, readRememberedFootPaired() === true);
    const balance = (): void => {
      if (hearth.querySelector(UNSETTLED) !== null || shelf.querySelector(UNSETTLED) !== null) {
        return;
      }
      const [side, last, fold] = [...foot.children];
      const split = getComputedStyle(foot).gridTemplateColumns.trim().split(TRACK_SEPARATOR).length === 2;
      if (!split || side === undefined || last === undefined) {
        applyFoot(shelf, false);
        return;
      }
      const paired = shouldPair(
        { hearth, shelf },
        { side, last, fold },
        Number.parseFloat(getComputedStyle(foot).rowGap) || 0,
        shelf.getAttribute(FOOT_ATTRIBUTE) === PAIRED,
      );
      applyFoot(shelf, paired);
      rememberHomeFootPaired(paired);
    };
    let frame = 0;
    const balanceNextFrame = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(balance);
    };
    const mutations = new MutationObserver(balance);
    mutations.observe(hearth, { childList: true, subtree: true });
    mutations.observe(shelf, { childList: true, subtree: true });
    const resizes = new ResizeObserver(balanceNextFrame);
    resizes.observe(shelf);
    balance();
    return (): void => {
      mutations.disconnect();
      resizes.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [hearthRef, shelfRef, footRef]);
}
