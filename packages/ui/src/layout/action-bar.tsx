// Slot order follows measured fit, so visual order and keyboard order agree at every container width.
// The fill slot counts toward fit only at its declared minimum, so elastic content never holds the bar stacked.
import { useRender } from "@base-ui/react/use-render";
import type { ReactElement, ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { actionBarVariants } from "./variants.ts";

export interface ActionBarProps extends Omit<useRender.ComponentProps<"div">, "children"> {
  readonly leading: ReactNode;
  readonly primary: ReactNode;
  /** Elastic content that takes the free space before the trailing slot; it hides while it renders nothing. */
  readonly fill?: ReactNode;
  readonly trailing: ReactNode;
}

/** Keeps the primary group intact above leading and trailing controls when one row cannot fit. */
export function ActionBar({ leading, primary, fill, trailing, className, render, ref, ...props }: ActionBarProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const leadingRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const trailingRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const [stacked, setStacked] = useState(false);
  const styles = actionBarVariants({ stacked });

  useLayoutEffect(() => {
    const control = restoreFocus.current;
    restoreFocus.current = null;
    if (control !== null && control.isConnected && document.activeElement !== control) {
      control.focus({ preventScroll: true });
    }
  });

  useLayoutEffect(() => {
    const root = rootRef.current;
    const lead = leadingRef.current;
    const body = primaryRef.current;
    const elastic = fillRef.current;
    const end = trailingRef.current;
    if (root === null || lead === null || body === null || elastic === null || end === null) {
      return;
    }
    const measure = (): void => {
      const style = getComputedStyle(root);
      const gap = Number.parseFloat(style.columnGap);
      const contentWidth = root.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
      const fillStyle = getComputedStyle(elastic);
      const fillFloor = fillStyle.display === "none" ? 0 : Number.parseFloat(fillStyle.minWidth) + gap;
      const needed = lead.getBoundingClientRect().width + body.getBoundingClientRect().width + end.getBoundingClientRect().width + gap * 2 + fillFloor;
      const next = needed > contentWidth;
      if (next === stacked) {
        return;
      }
      const focused = document.activeElement;
      restoreFocus.current = focused instanceof HTMLElement && root.contains(focused) ? focused : null;
      setStacked(next);
    };
    const observer = new ResizeObserver(measure);
    // The fill is observed for its shown-or-hidden change; its grown width never enters the sum.
    for (const element of [root, lead, body, elastic, end]) {
      observer.observe(element);
    }
    measure();
    return (): void => observer.disconnect();
  }, [stacked]);

  const lead = (
    <div className={styles.leading()} data-slot="action-bar-leading" key="leading" ref={leadingRef}>
      {leading}
    </div>
  );
  const body = (
    <div className={styles.primary()} data-slot="action-bar-primary" key="primary">
      <div className={styles.primaryContent()} data-slot="action-bar-primary-content" ref={primaryRef}>
        {primary}
      </div>
    </div>
  );
  const elastic = (
    <div className={styles.fill()} data-slot="action-bar-fill" key="fill" ref={fillRef}>
      {fill}
    </div>
  );
  const end = (
    <div className={styles.trailing()} data-slot="action-bar-trailing" key="trailing" ref={trailingRef}>
      {trailing}
    </div>
  );
  return useRender({
    defaultTagName: "div",
    render,
    ref: ref === undefined ? [rootRef] : [rootRef, ref],
    props: {
      ...props,
      className: styles.root({ className }),
      "data-slot": "action-bar",
      "data-stacked": stacked,
      children: stacked ? [body, lead, elastic, end] : [lead, body, elastic, end],
    },
  });
}
