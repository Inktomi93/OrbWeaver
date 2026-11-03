import type { RefObject } from "react";
import { useEffect } from "react";

const EDGE_EPSILON_PX = 1;

function useScrollFade(ref: RefObject<HTMLElement | null>, horizontal: boolean): void {
  useEffect(() => {
    const el = ref.current;
    if (el === null) {
      return;
    }
    const sync = (): void => {
      const offset = horizontal ? Math.abs(el.scrollLeft) : el.scrollTop;
      const remaining = horizontal ? el.scrollWidth - el.clientWidth - offset : el.scrollHeight - el.clientHeight - offset;
      el.toggleAttribute(horizontal ? "data-fade-start" : "data-fade-top", offset > EDGE_EPSILON_PX);
      el.toggleAttribute(horizontal ? "data-fade-end" : "data-fade-bottom", remaining > EDGE_EPSILON_PX);
    };
    const resize = new ResizeObserver(sync);
    const observeContent = (): void => {
      resize.disconnect();
      resize.observe(el);
      for (const child of el.children) {
        resize.observe(child);
      }
      sync();
    };
    // React can replace the content wrapper without resizing the viewport or its former children.
    const content = new MutationObserver(observeContent);
    content.observe(el, { childList: true, subtree: true, characterData: true });
    observeContent();
    el.addEventListener("scroll", sync, { passive: true });
    return (): void => {
      el.removeEventListener("scroll", sync);
      resize.disconnect();
      content.disconnect();
    };
  }, [ref, horizontal]);
}

/** Track logical horizontal overflow, including asynchronous content growth and RTL scrolling. */
export function useScrollFadeX(ref: RefObject<HTMLElement | null>): void {
  useScrollFade(ref, true);
}

/** Track vertical overflow when the viewport or its content changes. */
export function useScrollFadeY(ref: RefObject<HTMLElement | null>): void {
  useScrollFade(ref, false);
}
