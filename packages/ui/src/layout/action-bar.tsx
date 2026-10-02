// Slot order follows measured fit, so visual order and keyboard order agree at every container width.
import { useRender } from "@base-ui/react/use-render";
import type { ReactElement, ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { actionBarVariants } from "./variants.ts";

export interface ActionBarProps extends Omit<useRender.ComponentProps<"div">, "children"> {
  readonly leading: ReactNode;
  readonly primary: ReactNode;
  readonly trailing: ReactNode;
}

/** Keeps the primary group intact above leading and trailing controls when one row cannot fit. */
export function ActionBar({ leading, primary, trailing, className, render, ref, ...props }: ActionBarProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const leadingRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLDivElement>(null);
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
    const end = trailingRef.current;
    if (root === null || lead === null || body === null || end === null) {
      return;
    }
    const measure = (): void => {
      const style = getComputedStyle(root);
      const gap = Number.parseFloat(style.columnGap);
      const contentWidth = root.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
      const needed = lead.getBoundingClientRect().width + body.getBoundingClientRect().width + end.getBoundingClientRect().width + gap * 2;
      const next = needed > contentWidth;
      if (next === stacked) {
        return;
      }
      const focused = document.activeElement;
      restoreFocus.current = focused instanceof HTMLElement && root.contains(focused) ? focused : null;
      setStacked(next);
    };
    const observer = new ResizeObserver(measure);
    for (const element of [root, lead, body, end]) {
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
      children: stacked ? [body, lead, end] : [lead, body, end],
    },
  });
}
