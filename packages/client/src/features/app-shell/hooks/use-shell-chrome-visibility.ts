import type { RefObject } from "react";
import { useLayoutEffect } from "react";

/** Keep floating header controls in the same rendered regime as the header. */
export function useShellChromeVisibility(frameRef: RefObject<HTMLElement | null>, headerRef: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const header = headerRef.current;
    if (frame === null || header === null) {
      return;
    }
    // CSS owns the height condition; sibling controls follow its result rather than duplicating the query.
    const publish = (): void => {
      frame.toggleAttribute("data-topbar-hidden", header.getClientRects().length === 0);
    };
    const observer = new ResizeObserver(publish);
    observer.observe(header);
    publish();
    return (): void => {
      observer.disconnect();
      frame.removeAttribute("data-topbar-hidden");
    };
  }, [frameRef, headerRef]);
}
