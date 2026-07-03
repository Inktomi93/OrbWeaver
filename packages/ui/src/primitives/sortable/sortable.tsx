// The @dnd-kit/react seal (ui-package-design §6.1 item 15; work-order §15). MODERN rewrite ONLY —
// `DragDropProvider` + `useSortable({id, index, handle?})` + `move()` from @dnd-kit/helpers. NEVER
// @dnd-kit/core / @dnd-kit/sortable / @dnd-kit/utilities (the dead legacy stack — dep-cruiser
// ui-satellite-seals seals this dir as the ONE @dnd-kit import site).
//
// Keyboard + a11y are NOT hand-wired here — verified against the shipped `@dnd-kit/dom` source
// (never memory): `DragDropProvider`'s default preset registers `KeyboardSensor` (Space/Enter
// starts, arrows move, Space/Enter/Tab drops, Escape cancels) AND the `Accessibility` plugin
// alongside it; `useSortable`'s own defaults include `SortableKeyboardPlugin` +
// `OptimisticSortingPlugin`. The `Accessibility` plugin's registered effect (dom/index.js) sets
// `tabindex="0"` / `role` / `aria-roledescription` / `aria-describedby` / `aria-pressed` on
// `draggable.handle ?? draggable.element` AUTOMATICALLY, and appends an off-screen
// `aria-live="polite"` region with default dragstart/dragend announcements — all on by construction,
// nothing to wire.
// `Feedback` is the ONE piece of `@dnd-kit/dom` this seal reaches past `@dnd-kit/react`'s public
// surface for (it is not re-exported there) — needed to configure the post-drop settle animation
// below. Still inside the ui-satellite-seals `primitives/sortable/` dir, so the dep-cruiser gate
// (a from-path allowlist keyed on the `@dnd-kit` PACKAGE SCOPE, not a specific subpackage) permits
// it; declared as a direct dependency (not left transitive) per the `@codemirror/lint` precedent.
import { Feedback } from "@dnd-kit/dom";
import { move } from "@dnd-kit/helpers";
import type { DragEndEvent } from "@dnd-kit/react";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import type { ReactElement, ReactNode } from "react";
import { cn } from "#lib";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc + vite resolve GripVertical/Icon fine.
import { GripVertical, Icon } from "#primitives/icons";
import { sortableVariants } from "./variants";

// `@dnd-kit/abstract`'s `UniqueIdentifier` (`string | number`) is a structural alias, not a branded
// nominal type, and it is NOT re-exported from `@dnd-kit/react`/`@dnd-kit/helpers` (the two deps
// this seal is allowed to depend on — `@dnd-kit/abstract` stays an undeclared transitive dep).
// Declaring the identical shape locally as `SortableItemKey` keeps the public API type-compatible
// with `useSortable`'s `id` and `move()`'s array element type without importing the unlisted package.
export type SortableItemKey = string | number;

function prefersReducedMotion(): boolean {
  return (
    typeof globalThis.matchMedia === "function" &&
    globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export interface SortableListProps<T> {
  readonly items: readonly T[];
  /** Stable per-item key — the identity `move()` reorders by and `onReorder` reports. */
  readonly getItemKey: (item: T) => SortableItemKey;
  readonly renderItem: (item: T, index: number) => ReactNode;
  /** Fires once per completed (non-canceled, position-changed) drag with the new key order. */
  readonly onReorder: (orderedKeys: SortableItemKey[]) => void;
  /**
   * When `true`, only a dedicated grip affordance starts a drag (the row's own interactive content
   * — buttons, inputs — stays clickable). When `false` (default), the whole row is the drag
   * surface — pick this only when rows have no other interactive content.
   */
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
  const { ref, handleRef, isDragging } = useSortable({
    id,
    index,
    disabled,
    // Reduced-motion: skip the post-drop settle bounce outright (verified against the shipped
    // `@dnd-kit/dom` source, R1) — `runDropAnimation` drives it via `element.animate()` (WAAPI),
    // a motion path the app's CSS reduced-motion floor (near-zero transition DURATIONS) cannot
    // reach, since there's no CSS transition/animation to shorten (the chart.tsx WAAPI
    // precedent). `dropAnimation: null` short-circuits the whole animation, not just its
    // duration. Extends `useSortable`'s own per-item plugin DEFAULTS (`SortableKeyboardPlugin` +
    // `OptimisticSortingPlugin`) via its documented `(defaults) => [...defaults, …]` shape rather
    // than replacing them.
    ...(prefersReducedMotion()
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

/**
 * `SortableList` — a generic controlled reorderable list over `@dnd-kit/react`. The caller owns
 * `items`; a completed drag reports the new key order via `onReorder` and the caller decides
 * whether/how to apply it (optimistic re-sort, a mutation, both) — this component holds no
 * reorder state of its own.
 *
 * Usage: `<SortableList items={rules} getItemKey={(r) => r.id} renderItem={(r) => <RuleRow r={r}
 *   />} onReorder={(keys) => reorderRules(keys)} handle />`
 */
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
