// The chart family's container-width sensor.
//
// A canvas chart's LABEL BUDGETS are width-relative or they are a point measurement pretending to be a
// range property: a fixed 64px value gutter and an unbounded category column both "work" at one width and
// clip at another (side-eye ANALYTICS 2026-08-19, P1c). ECharts cannot express a percentage label width, so
// the option builder needs a real number and this is where it comes from.
//
// QUANTIZED on purpose: the built option is handed to `<Chart>` with `notMerge`, so a fresh object per
// resize frame is a full redraw per frame. Rounding the measurement DOWN to a step means a drag-resize
// rebuilds the option a handful of times instead of sixty times a second, and the budgets still track the
// container. `useLayoutEffect` so the first real measurement lands BEFORE paint (the same shape as
// `ListRow`'s collapse sensor).
import type { RefObject } from "react";
import { useLayoutEffect, useState } from "react";

export function useMeasuredWidthPx(ref: RefObject<HTMLElement | null>, quantumPx: number): number {
  const [widthPx, setWidthPx] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null) {
      return;
    }
    const measure = (): void => {
      const next = Math.floor(node.getBoundingClientRect().width / quantumPx) * quantumPx;
      setWidthPx((previous) => (previous === next ? previous : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return (): void => observer.disconnect();
  }, [ref, quantumPx]);
  return widthPx;
}
