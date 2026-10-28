// The notice stack clears the rendered chrome, including a wrapping topbar and a sheet's own dismiss band.
import type { RefCallback } from "react";
import { useRef } from "react";

const NOTICE_CHROME_END = "--orb-notice-chrome-end";

/** Registers visible shell bands; callback cleanup also releases deferred or keyed header mounts. */
export function useShellNoticeInset(): RefCallback<HTMLElement> {
  const bands = useRef(new Set<HTMLElement>());
  const observer = useRef<{ readonly resize: ResizeObserver; readonly publish: () => void } | null>(null);
  return (band) => {
    if (band === null) {
      return;
    }
    const activeBands = bands.current;
    const root = document.documentElement;
    const publish = (): void => {
      let bottom = 0;
      for (const header of activeBands) {
        const box = header.getBoundingClientRect();
        if (box.height > 0) {
          bottom = Math.max(bottom, box.bottom);
        }
      }
      const inset = `${bottom}px`;
      if (root.style.getPropertyValue(NOTICE_CHROME_END) !== inset) {
        root.style.setProperty(NOTICE_CHROME_END, inset);
      }
    };
    if (observer.current === null) {
      observer.current = { resize: new ResizeObserver(publish), publish };
      // A rotated safe-area can move a band without changing its size.
      window.addEventListener("resize", publish);
    }
    const { resize: resizeObserver, publish: publishObserved } = observer.current;
    activeBands.add(band);
    resizeObserver.observe(band);
    publish();
    return (): void => {
      activeBands.delete(band);
      resizeObserver.unobserve(band);
      if (activeBands.size === 0) {
        resizeObserver.disconnect();
        observer.current = null;
        window.removeEventListener("resize", publishObserved);
        root.style.removeProperty(NOTICE_CHROME_END);
      } else {
        publish();
      }
    };
  };
}
