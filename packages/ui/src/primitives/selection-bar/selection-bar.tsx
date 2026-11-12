import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { usePinnedBarCap } from "#lib";
import { Button } from "#primitives/button";
import { Icon, X } from "#primitives/icons";
import { SELECTION_CLEAR_NAME, selectionCountLabel } from "./selection-bar-names.ts";
import { selectionBarVariants } from "./variants.ts";

export interface SelectionBarProps {
  /** Number of currently selected items — rendered as "N selected" in an `aria-live="polite"` region. */
  count: number;
  /** Fired by the clear button, and by Escape while focus is anywhere within the bar. */
  onClear: () => void;
  /** The bulk-action controls — caller-owned; this primitive is dumb chrome around them. */
  children?: ReactNode;
}

/** Bulk-action chrome. Render-null-when-zero is the caller's concern — this primitive always renders exactly what it's given. */
export function SelectionBar({ count, onClear, children }: SelectionBarProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const cap = usePinnedBarCap(rootRef, true);
  const slots = selectionBarVariants({ capped: cap !== null });

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
    // The cap is a measured share of the scroll box, so it can only be a runtime value.
    <div className={slots.root()} data-slot="selection-bar-root" ref={rootRef} style={cap === null ? undefined : { maxBlockSize: cap }}>
      <div className={slots.body()} data-slot="selection-bar-body">
        <span aria-live="polite" className={slots.count()} data-slot="selection-bar-count">
          {selectionCountLabel(count)}
        </span>
        <div className={slots.actions()} data-slot="selection-bar-actions">
          {children}
        </div>
      </div>
      <Button
        aria-label={SELECTION_CLEAR_NAME}
        className={slots.clear()}
        data-slot="selection-bar-clear"
        variant="ghost"
        onClick={onClear}
        square={true}
        type="button"
      >
        <Icon icon={X} size="sm" />
      </Button>
    </div>
  );
}
