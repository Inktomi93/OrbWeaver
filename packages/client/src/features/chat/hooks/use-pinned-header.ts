// Whether a sticky header is pinned against the top of its scrollport right now. The header sticks at
// `-top-px`, so while pinned its top pixel is clipped: a top clip is the pin, with no sentinel element,
// and a header clipped at its BOTTOM (a row entering from below) is not pinned.

import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";

// One threshold per percent, not just 1: a header already clipped elsewhere (a row wider than its
// scrollport) never reaches ratio 1, so pinning would cross no single threshold. A one-pixel clip on a
// header under 100px tall always crosses one of these.
const THRESHOLD_STEPS = 100;
const THRESHOLDS = Array.from({ length: THRESHOLD_STEPS + 1 }, (_, step) => step / THRESHOLD_STEPS);

export function usePinnedHeader(enabled: boolean): { readonly ref: RefObject<HTMLDivElement | null>; readonly pinned: boolean } {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!enabled || node === null) {
      return;
    }
    // Root `null` is right for any scrollport: the intersection is clipped by every scrolling ancestor.
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        // Not `isIntersecting`: Chromium reports it false whenever the ratio is under the threshold, which
        // is exactly the pinned state here.
        if (entry !== undefined) {
          setPinned(entry.intersectionRatio > 0 && entry.intersectionRect.top > entry.boundingClientRect.top);
        }
      },
      { threshold: THRESHOLDS },
    );
    observer.observe(node);
    return (): void => observer.disconnect();
  }, [enabled]);
  return { ref, pinned: enabled && pinned };
}
