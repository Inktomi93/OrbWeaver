// The composer's utilities row hands actions to the Message tools menu in a fixed order when its run is wider than the row:
// first Try another reply and Continue the reply (level 1), then Draft your line as well (level 2). Generate reply and
// Message tools never move. Moved boxes stay mounted out of flow, so every width is measurable in every level and the
// answer cannot flap. A ResizeObserver on the row and its parts catches a pane docking and a text-scale change the way
// a narrower window does. At level 2 the row can still be wider than its room; that is the measured floor.

import { useLayoutEffect, useState } from "react";

/** How many of the row's actions sit in the menu: none, the two secondary replies, or those and Draft your line. */
export type ReplyRowOverflowLevel = 0 | 1 | 2;

type SeatSetter = (node: HTMLElement | null) => void;

// Sub-pixel layout rounding must not flip a fit that holds.
const FIT_EPSILON = 0.5;

const gapOf = (element: HTMLElement): number => Number.parseFloat(getComputedStyle(element).columnGap) || 0;
const widthOf = (element: HTMLElement): number => element.getBoundingClientRect().width;

/**
 * The overflow level for the row, and the seats that attach it to the DOM: the row, the Message tools group, the
 * right-hand group, the Your message box, and the Try another reply, Generate reply and Continue the reply boxes, in
 * that order. `draftPinned` keeps Draft your line in the row while its Stop control lives there.
 */
export function useReplyRowOverflow(draftPinned: boolean): {
  readonly level: ReplyRowOverflowLevel;
  readonly seats: readonly [SeatSetter, SeatSetter, SeatSetter, SeatSetter, SeatSetter, SeatSetter, SeatSetter];
} {
  const [level, setLevel] = useState<ReplyRowOverflowLevel>(0);
  const [row, setRow] = useState<HTMLElement | null>(null);
  const [tools, setTools] = useState<HTMLElement | null>(null);
  const [replies, setReplies] = useState<HTMLElement | null>(null);
  const [you, setYou] = useState<HTMLElement | null>(null);
  const [swipe, setSwipe] = useState<HTMLElement | null>(null);
  const [generate, setGenerate] = useState<HTMLElement | null>(null);
  const [continuation, setContinuation] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (row === null || tools === null || replies === null || you === null || swipe === null || generate === null || continuation === null) {
      return;
    }
    const measure = (): void => {
      const gap = gapOf(replies);
      const room = row.clientWidth - widthOf(tools) - gapOf(row);
      const everything = widthOf(you) + gap + widthOf(swipe) + gap + widthOf(generate) + gap + widthOf(continuation);
      const withoutSecondary = widthOf(you) + gap + widthOf(generate);
      const fits = (run: number): boolean => run <= room + FIT_EPSILON;
      let fit: ReplyRowOverflowLevel = 2;
      if (fits(everything)) {
        fit = 0;
      } else if (fits(withoutSecondary) || draftPinned) {
        fit = 1;
      }
      setLevel(fit);
    };
    const observer = new ResizeObserver(measure);
    for (const element of [row, tools, replies, you, swipe, generate, continuation]) {
      observer.observe(element);
    }
    measure();
    return (): void => observer.disconnect();
  }, [row, tools, replies, you, swipe, generate, continuation, draftPinned]);
  return { level, seats: [setRow, setTools, setReplies, setYou, setSwipe, setGenerate, setContinuation] };
}
