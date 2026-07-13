// The @dnd-kit/react seal — dep-cruiser seals this dir as the ONE @dnd-kit import site (never
// @dnd-kit/core/sortable/utilities). Keyboard + a11y come free from DragDropProvider/useSortable
// defaults (KeyboardSensor, Accessibility plugin) — nothing to hand-wire.
import { Feedback } from "@dnd-kit/dom";
import { move } from "@dnd-kit/helpers";
import type { DragEndEvent } from "@dnd-kit/react";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import type { ReactElement, ReactNode } from "react";
import { cn, usePrefersReducedMotion } from "#lib";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc + vite resolve GripVertical/Icon fine.
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
  readonly disabled?: boolean;
  readonly className?: string;
}

interface SortableItemProps {
  readonly id: SortableItemKey;
  readonly index: number;
  readonly handle: boolean;
  readonly disabled: boolean;
  readonly children: ReactNode;
}

function SortableItem({ id, index, handle, disabled, children }: SortableItemProps): ReactElement {
  const reducedMotion = usePrefersReducedMotion();
  const { ref, handleRef, isDragging } = useSortable({
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
  return (
    <div
      className={slots.item()}
      data-dragging={isDragging ? "" : undefined}
      data-slot="sortable-item"
      ref={ref}
    >
      {handle ? (
        <button
          aria-label="Reorder item"
          className={slots.handle()}
          data-slot="sortable-handle"
          disabled={disabled}
          ref={handleRef}
          type="button"
        >
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
