// The composer's input row is [options door][message field][Send]. When the field cannot keep its minimum inline size
// beside the door and Send, the row switches to two rows: the field takes the first, the door and Send the second
// (`globals.css` keys the grid areas on the `data-field-wrapped` attribute this hook's answer sets). The fit is measured,
// never read from a viewport or container step: a step would change default narrow phones at 100% text, where the
// field fits. A ResizeObserver on the row and its parts catches a text-scale change the way a narrower window does.

import { useLayoutEffect, useState } from "react";

type SeatSetter = (node: HTMLElement | null) => void;

// Sub-pixel layout rounding must not flip a fit that holds.
const FIT_EPSILON = 0.5;

const widthOf = (element: HTMLElement): number => element.getBoundingClientRect().width;

/**
 * Whether the field has to take its own row, and the seats that attach the answer to the DOM: the row, the door box,
 * the field box and the Send box, in that order. The minimum is the token in ch, resolved to pixels at the field's own font.
 */
export function useComposerFieldWrap(): {
  readonly wrapped: boolean;
  readonly seats: readonly [SeatSetter, SeatSetter, SeatSetter, SeatSetter];
} {
  const [wrapped, setWrapped] = useState(false);
  const [row, setRow] = useState<HTMLElement | null>(null);
  const [door, setDoor] = useState<HTMLElement | null>(null);
  const [field, setField] = useState<HTMLElement | null>(null);
  const [send, setSend] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (row === null || door === null || field === null || send === null) {
      return;
    }
    const measure = (): void => {
      const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
      // The token's length at the field's own font. The field's `min-inline-size` drops to 0 while wrapped, so it cannot be read back.
      const probe = document.createElement("span");
      probe.style.cssText = "position:absolute;visibility:hidden;inline-size:var(--dimension-composer-field-min)";
      field.append(probe);
      const minimum = widthOf(probe);
      probe.remove();
      setWrapped(widthOf(door) + widthOf(send) + minimum + 2 * gap > row.clientWidth + FIT_EPSILON);
    };
    const observer = new ResizeObserver(measure);
    for (const element of [row, door, field, send]) {
      observer.observe(element);
    }
    measure();
    return (): void => observer.disconnect();
  }, [row, door, field, send]);
  return { wrapped, seats: [setRow, setDoor, setField, setSend] };
}
