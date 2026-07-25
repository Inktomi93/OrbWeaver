// The @dnd-kit/react seal — dep-cruiser seals this dir as the ONE @dnd-kit import site (never
// @dnd-kit/core/sortable/utilities). Keyboard + a11y come free from DragDropProvider/useSortable
// defaults (KeyboardSensor, Accessibility plugin) — nothing to hand-wire.
import { Feedback } from "@dnd-kit/dom";
import { move } from "@dnd-kit/helpers";
import type { DragEndEvent } from "@dnd-kit/react";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef } from "react";
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
  // @dnd-kit's KeyboardSensor moves the drag by re-ordering the list, which re-renders these rows;
  // the browser drops DOM focus off the handle button in that reflow, landing it on <body>. A
  // keyboard-only user then can't continue a multi-step reorder (further arrows never reach the
  // sensor). While THIS row is the active drag source, restore focus to its handle after each such
  // re-render — but only if focus actually escaped, so we never yank focus mid-interaction otherwise.
  const handleButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isDragSource) {
      return;
    }
    const button = handleButtonRef.current;
    if (button && document.activeElement !== button) {
      button.focus();
    }
  });
  const setHandleRef = (element: HTMLButtonElement | null): void => {
    handleButtonRef.current = element;
    handleRef(element);
  };
  // Arm the pickup affordance the instant the item becomes the drag source (Space/Enter), not just
  // once a move flips status to "dragging" (isDragging) — so the visual state matches the
  // "Picked up" live-region announcement for a sighted keyboard user.
  return (
    <div className={slots.item()} data-dragging={isDragging || isDragSource ? "" : undefined} data-slot="sortable-item" ref={ref}>
      {handle ? (
        <button aria-label={handleLabel} className={slots.handle()} data-slot="sortable-handle" disabled={disabled} ref={setHandleRef} type="button">
          <Icon icon={GripVertical} size="sm" />
        </button>
      ) : null}
      <div className={slots.content()} data-slot="sortable-content">
        {children}
      </div>
    </div>
  );
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
