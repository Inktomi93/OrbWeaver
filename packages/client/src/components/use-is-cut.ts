// Whether any text part of a box is drawn cut by its line: its text is wider than its box. One home for the read, so the band's census and the
// topbar's title decide "cut" the same way. A part says so by holding the ref this hook hands out; the box reads only the parts that did.

import type { RefCallback } from "react";
import { createContext, use, useState } from "react";

interface CutParts {
  readonly cut: boolean;
  /** The ref of each text part the box reads. */
  readonly part: RefCallback<HTMLElement>;
}

const OBSERVED_TEXT = { characterData: true, childList: true, subtree: true } as const;
const NO_PART: RefCallback<HTMLElement> = () => undefined;

/** One box's watch: the parts it holds, observed for the box they sit in and for the words they carry. */
function watchParts(setCut: (cut: boolean) => void): RefCallback<HTMLElement> {
  const parts = new Set<HTMLElement>();
  let resized: ResizeObserver | null = null;
  let retyped: MutationObserver | null = null;
  const read = (): void => setCut([...parts].some((part) => part.scrollWidth > part.clientWidth));
  const attach = (node: HTMLElement): (() => void) => {
    parts.add(node);
    resized ??= new ResizeObserver(read);
    retyped ??= new MutationObserver(read);
    resized.observe(node);
    retyped.observe(node, OBSERVED_TEXT);
    read();
    return (): void => {
      parts.delete(node);
      resized?.unobserve(node);
      // A mutation observer cannot drop one target, so it watches the parts that remain.
      retyped?.disconnect();
      for (const remaining of parts) {
        retyped?.observe(remaining, OBSERVED_TEXT);
      }
      // A box whose last part leaves keeps its answer: its parts remount under the control that a cut part makes, and an answer reset between the
      // two would unmake the control the remount belongs to.
      if (parts.size > 0) {
        read();
      }
    };
  };
  return (node) => (node === null ? undefined : attach(node));
}

/** Reads whether a part that holds `part` is cut. The box changes size when the room does, and the text changes with no change to the box when its words do, so both are watched. */
export function useCutParts(): CutParts {
  const [cut, setCut] = useState(false);
  const [part] = useState(() => watchParts(setCut));
  return { cut, part };
}

/** Hands a box's part ref to the text parts under it. */
export const CutPartContext = createContext<RefCallback<HTMLElement> | null>(null);
CutPartContext.displayName = "CutPartContext";

/** The ref for a text part of the nearest box that reads its parts, or one that reads nothing where there is no box. */
export function useCutPart(): RefCallback<HTMLElement> {
  return use(CutPartContext) ?? NO_PART;
}
