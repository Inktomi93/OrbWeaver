// Whether any marked part inside a box is drawn cut by its line: its text is wider than its box. One home for the read, so
// the band's census and the topbar's title decide "cut" the same way.

import type { RefObject } from "react";
import { useLayoutEffect, useState } from "react";

const CUT_PART_ATTRIBUTE = "data-cut-part";
const CUT_PART_SELECTOR = `[${CUT_PART_ATTRIBUTE}]`;

/** Spread onto each text part whose cut the surrounding box reads. */
export const CUT_PART = { [CUT_PART_ATTRIBUTE]: "" } as const;

/**
 * Reads whether a part under `ref` (or `ref`'s own element, when it is marked) is cut. The box changes size when the room does,
 * and the text changes with no change to the box when its words do, so both are watched; parts that mount or unmount, as the
 * title's does when its reveal swaps in, are picked up again.
 */
export function useIsCut(ref: RefObject<HTMLElement | null>): boolean {
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const root = ref.current;
    if (root === null) {
      return (): void => undefined;
    }
    const parts = (): HTMLElement[] => [...(root.matches(CUT_PART_SELECTOR) ? [root] : []), ...root.querySelectorAll<HTMLElement>(CUT_PART_SELECTOR)];
    const read = (): void => setCut(parts().some((part) => part.scrollWidth > part.clientWidth));
    const resized = new ResizeObserver(read);
    const watch = (): void => {
      resized.disconnect();
      for (const part of parts()) {
        resized.observe(part);
      }
    };
    const retyped = new MutationObserver(() => {
      watch();
      read();
    });
    watch();
    read();
    retyped.observe(root, { characterData: true, childList: true, subtree: true });
    return (): void => {
      resized.disconnect();
      retyped.disconnect();
    };
  }, [ref]);
  return cut;
}
