// The @dnd-kit/react seal — dep-cruiser seals this dir as the ONE @dnd-kit import site (never
// @dnd-kit/core/sortable/utilities). Keyboard + a11y come free from DragDropProvider/useSortable
// defaults (KeyboardSensor, Accessibility plugin); the ONE thing hand-wired is mid-drag keyboard
// focus restoration (KeyboardFocusKeeper below) — dnd-kit only restores focus at drop, not per move.
import { Feedback } from "@dnd-kit/dom";
import { move } from "@dnd-kit/helpers";
import type { DragEndEvent, DragMoveEvent } from "@dnd-kit/react";
import { DragDropProvider, useDragDropMonitor } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import type { ReactElement, ReactNode } from "react";
import { cn, usePrefersReducedMotion } from "#lib";
import { GripVertical, Icon } from "#primitives/icons";
import { sortableVariants } from "./variants";

// Mirrors @dnd-kit/abstract's UniqueIdentifier shape locally to avoid importing the undeclared transitive dep.
export type SortableItemKey = string | number;

export interface SortableListProps<T> {
  readonly items: readonly T[];
  /** Stable per-item key — the identity `move()` reorders by and `onReorder` reports. */
  readonly getItemKey: (item: T) => SortableItemKey;
  readonly renderItem: (item: T, index: number) => ReactNode;
  /** Fires once per completed (non-canceled, position-changed) drag with the new key order. */
  readonly onReorder: (orderedKeys: SortableItemKey[]) => void;
  /** When `true`, only a dedicated grip starts a drag (row's own interactive content stays clickable). */
  readonly handle?: boolean;
  /** Per-item accessible name for the drag handle — a screen reader can't tell N generic "Reorder item"
   *  grips apart, so name them by row (`(item) => "Reorder Rev"`). Falls back to "Reorder item". */
  readonly handleLabel?: (item: T) => string;
  readonly disabled?: boolean;
  readonly className?: string;
}

interface SortableItemProps {
  readonly id: SortableItemKey;
  readonly index: number;
  readonly handle: boolean;
  readonly handleLabel: string;
  readonly disabled: boolean;
  readonly children: ReactNode;
}

function SortableItem({ id, index, handle, handleLabel, disabled, children }: SortableItemProps): ReactElement {
  const reducedMotion = usePrefersReducedMotion();
  const { ref, handleRef, isDragging, isDragSource } = useSortable({
    id,
    index,
    disabled,
    // The drop-settle bounce is WAAPI (element.animate()), not CSS, so the app's reduced-motion
    // duration floor can't shorten it — short-circuit it outright instead.
    ...(reducedMotion
      ? {
          plugins: (defaults) => [...defaults, Feedback.configure({ dropAnimation: null })],
        }
      : {}),
  });
  const slots = sortableVariants();
  // Arm the pickup affordance the instant the item becomes the drag source (Space/Enter), not just
  // once a move flips status to "dragging" (isDragging) — so the visual state matches the
  // "Picked up" live-region announcement for a sighted keyboard user.
  return (
    <div className={slots.item()} data-dragging={isDragging || isDragSource ? "" : undefined} data-slot="sortable-item" ref={ref}>
      {handle ? (
        <button aria-label={handleLabel} className={slots.handle()} data-slot="sortable-handle" disabled={disabled} ref={handleRef} type="button">
          <Icon icon={GripVertical} size="sm" />
        </button>
      ) : null}
      <div className={slots.content()} data-slot="sortable-content">
        {children}
      </div>
    </div>
  );
}

// Keyboard focus-restoration, driven off dnd-kit's OWN drag lifecycle rather than React rendering.
//
// The KeyboardSensor moves the drag via `manager.actions.move` (transform math on the feedback
// element) WITHOUT flushing an onReorder — the list only re-renders when its own internal state
// signals flip, which happens on an unpredictable schedule relative to the sensor's DOM reflow. In
// that reflow the browser can drop focus off the active handle onto <body>, and dnd-kit's built-in
// `restoreFocus` runs ONLY at drop-animation end (its `runDropAnimation`), not per mid-drag move. A
// render-coupled effect that refocuses "after each re-render" therefore races: if the state flip
// lands BEFORE the focus loss, the effect sees focus intact, no-ops, and never re-runs — focus stays
// on <body> for the rest of a multi-step keyboard reorder (further arrows never reach the sensor).
//
// So we subscribe to the manager's `dragmove` event (fires on EVERY move regardless of React render)
// and re-grab the active source's handle. `activatorEvent` being a keyboard event is the gate: a
// POINTER drag must never have its focus yanked (pointer users routinely move focus mid-drag), and a
// keyboard drag is exactly the case where focus belongs on the handle for the next arrow key.
function KeyboardFocusKeeper(): null {
  useDragDropMonitor({
    onDragMove(event: DragMoveEvent, manager): void {
      if (!(manager.dragOperation.activatorEvent instanceof KeyboardEvent)) {
        return;
      }
      const source = event.operation.source;
      const focusTarget = source?.handle ?? source?.element;
      if (!(focusTarget instanceof HTMLElement)) {
        return;
      }
      // Defer to the next frame: the sensor's list reflow (which is what steals focus onto <body>)
      // runs after this event dispatches, so a synchronous refocus here would be immediately undone.
      // dnd-kit's own drop-time `restoreFocus` defers the same way (requestAnimationFrame).
      requestAnimationFrame(() => {
        if (document.activeElement !== focusTarget) {
          focusTarget.focus();
        }
      });
    },
  });
  return null;
}

/** Generic controlled reorderable list over `@dnd-kit/react`; caller owns `items` and applies `onReorder`. */
export function SortableList<T>({
  items,
  getItemKey,
  renderItem,
  onReorder,
  handle = false,
  handleLabel,
  disabled = false,
  className,
}: SortableListProps<T>): ReactElement {
  const keys = items.map((item) => getItemKey(item));

  const handleDragEnd = (event: DragEndEvent): void => {
    if (event.canceled) {
      return;
    }
    const next = move(keys, event);
    if (next !== keys) {
      onReorder(next);
    }
  };

  return (
    <DragDropProvider onDragEnd={handleDragEnd}>
      <KeyboardFocusKeeper />
      <div className={cn(sortableVariants().root(), className)} data-slot="sortable-root">
        {items.map((item, index) => (
          <SortableItem
            disabled={disabled}
            handle={handle}
            handleLabel={handleLabel?.(item) ?? "Reorder item"}
            id={getItemKey(item)}
            index={index}
            key={getItemKey(item)}
          >
            {renderItem(item, index)}
          </SortableItem>
        ))}
      </div>
    </DragDropProvider>
  );
}
