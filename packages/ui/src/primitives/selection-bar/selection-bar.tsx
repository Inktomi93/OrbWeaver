import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef } from "react";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc + vite resolve X/Icon fine.
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

/**
 * SelectionBar — bulk-action chrome: a live-announcing selection count, a caller-owned actions
 * slot, and a clear button. Render-null-when-zero is the CALLER's concern (ui-package-design §12
 * Wave 3-C; work-order #21) — this primitive always renders exactly what it's given.
 *
 * Usage: `{count > 0 && (
 *   <SelectionBar count={count} onClear={clearSelection}>
 *     <Button intent="ghost" size="sm">Archive</Button>
 *     <Button intent="destructive" size="sm">Delete</Button>
 *   </SelectionBar>
 * )}`
 */
export function SelectionBar({
  count,
  onClear,
  children,
  placement,
  className,
}: SelectionBarProps): ReactElement {
  const slots = selectionBarVariants({ placement });
  const rootRef = useRef<HTMLDivElement>(null);

  // Escape bubbles from whatever's focused inside the bar (an action button, the clear button
  // itself) up to the root's native listener — "focus within" falls out of normal DOM event
  // bubbling, no focus tracking needed. Wired imperatively (not a JSX `onKeyDown`) because the root
  // is a plain, non-interactive `<div>` — the handler belongs to the DOM node, not its ARIA role.
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
      <button
        aria-label="Clear selection"
        className={slots.clear()}
        data-slot="selection-bar-clear"
        onClick={onClear}
        type="button"
      >
        <Icon icon={X} size="sm" />
      </button>
    </div>
  );
}
