import type { RefObject } from "react";
import { useEffect } from "react";
import { SCROLL_EDGE_EPSILON_PX } from "#lib";

export interface ScrollFadeOptions {
  /**
   * The caller writes this box's size from its own observer and calls {@link syncScrollFade} after. The hook then leaves the box
   * unobserved, because observing a box another observer resizes raises a ResizeObserver loop error.
   */
  readonly sizedByCaller?: boolean;
}

const SYNCS = new WeakMap<HTMLElement, () => void>();

/** Recompute an element's edge fades now; for a caller that has just resized an element that took `sizedByCaller`. */
export function syncScrollFade(el: HTMLElement): void {
  SYNCS.get(el)?.();
}

function useScrollFade(ref: RefObject<HTMLElement | null>, horizontal: boolean, { sizedByCaller = false }: ScrollFadeOptions): void {
  useEffect(() => {
    const el = ref.current;
    if (el === null) {
      return;
    }
    const sync = (): void => {
      const offset = horizontal ? Math.abs(el.scrollLeft) : el.scrollTop;
      const remaining = horizontal ? el.scrollWidth - el.clientWidth - offset : el.scrollHeight - el.clientHeight - offset;
      el.toggleAttribute(horizontal ? "data-fade-start" : "data-fade-top", offset > SCROLL_EDGE_EPSILON_PX);
      el.toggleAttribute(horizontal ? "data-fade-end" : "data-fade-bottom", remaining > SCROLL_EDGE_EPSILON_PX);
    };
    const resize = new ResizeObserver(sync);
    const observeContent = (): void => {
      resize.disconnect();
      if (!sizedByCaller) {
        resize.observe(el);
      }
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
    SYNCS.set(el, sync);
    return (): void => {
      SYNCS.delete(el);
      el.removeEventListener("scroll", sync);
      resize.disconnect();
      content.disconnect();
    };
  }, [ref, horizontal, sizedByCaller]);
}

/** Track logical horizontal overflow, including asynchronous content growth and RTL scrolling. */
export function useScrollFadeX(ref: RefObject<HTMLElement | null>, options: ScrollFadeOptions = {}): void {
  useScrollFade(ref, true, options);
}

/** Track vertical overflow when the viewport or its content changes. */
export function useScrollFadeY(ref: RefObject<HTMLElement | null>, options: ScrollFadeOptions = {}): void {
  useScrollFade(ref, false, options);
}
