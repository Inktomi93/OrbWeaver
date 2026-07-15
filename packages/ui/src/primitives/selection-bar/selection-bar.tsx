import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { Button } from "#primitives/button";
import { Icon, X } from "#primitives/icons";
import { selectionBarVariants } from "./variants";

export interface SelectionBarProps {
  /** Number of currently selected items — rendered as "N selected" in an `aria-live="polite"` region. */
  count: number;
  /** Fired by the clear button, and by Escape while focus is anywhere within the bar. */
  onClear: () => void;
  /** The bulk-action controls — caller-owned; this primitive is dumb chrome around them. */
  children?: ReactNode;
  /** `sticky` (default) pins to the bottom edge of a scroll container; `floating` is a centered pill. */
  placement?: "sticky" | "floating";
  className?: string;
}

/** Bulk-action chrome. Render-null-when-zero is the caller's concern — this primitive always renders exactly what it's given. */
export function SelectionBar({
  count,
  onClear,
  children,
  placement,
  className,
}: SelectionBarProps): ReactElement {
  const slots = selectionBarVariants({ placement });
  const rootRef = useRef<HTMLDivElement>(null);

  // Escape bubbles from whatever's focused inside the bar up to the root's native listener.
  useEffect(() => {
    const root = rootRef.current;
    if (root === null) {
      return;
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClear();
      }
    }
    root.addEventListener("keydown", onKeyDown);
    return (): void => root.removeEventListener("keydown", onKeyDown);
  }, [onClear]);

  return (
    <div className={slots.root({ className })} data-slot="selection-bar-root" ref={rootRef}>
      <span aria-live="polite" className={slots.count()} data-slot="selection-bar-count">
        {count} selected
      </span>
      <div className={slots.actions()} data-slot="selection-bar-actions">
        {children}
      </div>
      <Button
        aria-label="Clear selection"
        data-slot="selection-bar-clear"
        intent="ghost"
        onClick={onClear}
        size="icon"
        type="button"
      >
        <Icon icon={X} size="sm" />
      </Button>
    </div>
  );
}
