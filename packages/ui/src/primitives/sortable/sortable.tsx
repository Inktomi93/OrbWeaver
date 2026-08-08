// The @dnd-kit/react seal — dep-cruiser seals this dir as the ONE @dnd-kit import site (never
// @dnd-kit/core/sortable/utilities). Keyboard + a11y come free from DragDropProvider/useSortable
// defaults (KeyboardSensor, Accessibility plugin); TWO things are hand-wired — mid-drag keyboard focus
// restoration (KeyboardFocusKeeper below), because dnd-kit restores focus only at drop and not per move,
// and the live-region SCRIPT (`withAnnouncements` below), because the stock one reads raw entity ids.
import { Accessibility, Feedback } from "@dnd-kit/dom";
import { move } from "@dnd-kit/helpers";
import type { DragEndEvent, DragMoveEvent } from "@dnd-kit/react";
import { DragDropProvider, useDragDropMonitor } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { cn, usePrefersReducedMotion } from "#lib";
import { GripVertical, Icon } from "#primitives/icons";
import { sortableVariants } from "./variants.ts";

// Mirrors @dnd-kit/abstract's UniqueIdentifier shape locally to avoid importing the undeclared transitive dep.
export type SortableItemKey = string | number;

/** The row NAME the live region reads, carried on the sortable's own `data` (see `ANNOUNCEMENTS`). */
const LABEL_DATA_KEY = "orbSortableLabel";
/** What an unnamed row is called — the same fallback the grip's own label uses, minus the verb. */
const UNNAMED_ITEM = "item";

export interface SortableListProps<T> {
  readonly items: readonly T[];
  /** Stable per-item key — the identity `move()` reorders by and `onReorder` reports. */
  readonly getItemKey: (item: T) => SortableItemKey;
  readonly renderItem: (item: T, index: number) => ReactNode;
  /** Fires once per completed (non-canceled, position-changed) drag with the new key order. */
  readonly onReorder: (orderedKeys: SortableItemKey[]) => void;
  /** When `true`, only a dedicated grip starts a drag (row's own interactive content stays clickable). */
  readonly handle?: boolean;
  /** The row's own NAME — one resolver, two consumers: the grip's accessible name ("Reorder Rev", so a
   *  screen reader can tell N grips apart) AND the live-region announcements below. It is the bare noun,
   *  never a phrase: the seal owns the verb, so the two channels can never word the same row differently.
   *  Falls back to "item". */
  readonly itemLabel?: (item: T) => string;
  readonly disabled?: boolean;
  readonly className?: string;
  /** Names the `<ul>` root, the `VirtualList` twin — a rack among sibling racks is otherwise an unnamed
   *  list in the a11y tree. Omit it when a heading directly above already names the group. */
  readonly "aria-label"?: string;
}

interface SortableItemProps {
  readonly id: SortableItemKey;
  readonly index: number;
  readonly count: number;
  readonly handle: boolean;
  readonly label: string;
  readonly disabled: boolean;
  readonly children: ReactNode;
}

function SortableItem({ id, index, count, handle, label, disabled, children }: SortableItemProps): ReactElement {
  const reducedMotion = usePrefersReducedMotion();
  const { ref, handleRef, isDragging, isDragSource } = useSortable({
    id,
    index,
    disabled,
    // The name travels ON THE ENTITY, not in the announcement closure: the Accessibility plugin binds its
    // listeners ONCE at construction, so a closure over this render's items would be frozen at first mount
    // and read stale names forever. `useSortable` re-assigns `data` on every render, so this is live.
    data: { [LABEL_DATA_KEY]: label },
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
    <li
      aria-posinset={index + 1}
      aria-setsize={count}
      className={slots.item()}
      data-dragging={isDragging || isDragSource ? "" : undefined}
      data-slot="sortable-item"
      ref={ref}
    >
      {handle ? (
        <button aria-label={`Reorder ${label}`} className={slots.handle()} data-slot="sortable-handle" disabled={disabled} ref={handleRef} type="button">
          <Icon icon={GripVertical} size="sm" />
        </button>
      ) : null}
      <div className={slots.content()} data-slot="sortable-content">
        {children}
      </div>
    </li>
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

/** The announcement callbacks' parameter shapes, spelled STRUCTURALLY: dnd-kit does not export its
 *  `Announcements` interface, and `Plugin.configure`'s options infer as `any`, so an un-annotated callback
 *  is an implicit-any. These are supertypes of the real event/manager, which is exactly what a contravariant
 *  parameter position needs — the concrete `DragStartEvent`/`DragDropManager` stay assignable to them. */
interface AnnounceEvent {
  readonly operation: {
    readonly source: { readonly id: SortableItemKey; readonly data: Record<string, unknown> } | null | undefined;
    readonly target?: { readonly id: SortableItemKey; readonly data: Record<string, unknown> } | null | undefined;
  };
  readonly canceled?: boolean;
}
interface AnnounceManager {
  readonly registry: { readonly draggables: Iterable<unknown> };
}
/** What the announcement reads off an entity — dnd-kit's own `isSortable` narrows to `SortableDraggable`,
 *  but its overloads take one entity KIND each, and the source/target here are read through one path. */
type AnnounceEntity = AnnounceEvent["operation"]["source"];

/** The dragged row's NAME, off the entity's own `data` (see `SortableItem`). Read through `unknown` because
 *  dnd-kit types `data` as an open record — the shape is ours, but the type system can't know that here. */
function nameOf(entity: AnnounceEntity): string {
  const label: unknown = entity?.data[LABEL_DATA_KEY];
  return typeof label === "string" && label !== "" ? label : UNNAMED_ITEM;
}

/** How many rows this list has — read off the manager's OWN registry rather than a captured `items.length`,
 *  for the same staleness reason the name rides `data` (one provider per list ⇒ one registry per list). */
function totalOf(manager: AnnounceManager): number {
  return [...manager.registry.draggables].length;
}

/** The entity's 1-based rank, or `null` when it carries none (a plain draggable is not in a sorted list, so
 *  there is no position to announce). `Sortable.index` is the OPTIMISTIC live index during a drag. */
function rankOf(entity: AnnounceEntity): number | null {
  if (entity === null || entity === undefined || !("index" in entity)) {
    return null;
  }
  const index: unknown = entity.index;
  return typeof index === "number" ? index + 1 : null;
}

/** `name, position N of M` — or the bare name when there is no rank to state. */
function atPosition(name: string, rank: number | null, total: number): string {
  return rank === null ? name : `${name}, position ${rank} of ${total}`;
}

/**
 * THE LIVE-REGION SCRIPT (side-eye 2026-08-06), installed by REPLACING the default Accessibility plugin
 * with a configured one.
 *
 * WHY IT EXISTS: dnd-kit's stock announcements interpolate `source.id` / `target.id`, which in this app are
 * TypeIDs — a screen-reader user heard "Picked up draggable item regexscript_01jq…" and, at drop, "…was
 * dropped over droppable target …its own id", because with optimistic sorting the source ends up over
 * itself. Both halves are replaced: the row's own NAME, and its DESTINATION POSITION, which is the only
 * fact a reorder is about.
 *
 * WHY REPLACE AND NOT APPEND: the plugin registry keys instances by CONSTRUCTOR and the first registration
 * wins the construction — an appended `Accessibility.configure(…)` would only swap a live instance's
 * `.options`, which the plugin has already destructured. And why the callbacks close over NOTHING from
 * render: those listeners bind once, at manager construction, so a captured `items` would be frozen at
 * first mount (hence the name on `data` and the count off the registry).
 */
const withAnnouncements: NonNullable<ComponentProps<typeof DragDropProvider>["plugins"]> = (defaults) =>
  defaults.map((plugin) =>
    plugin === Accessibility
      ? Accessibility.configure({
          announcements: {
            dragstart: ({ operation: { source } }: AnnounceEvent, manager: AnnounceManager): string | undefined =>
              source === null || source === undefined ? undefined : `Picked up ${atPosition(nameOf(source), rankOf(source), totalOf(manager))}.`,
            // The DESTINATION is the hovered TARGET's rank, not the source's: the optimistic-sorting plugin
            // registers after this one, so at this instant the source still sits at its old index and the
            // target sits at the one it is about to take.
            dragover: ({ operation: { source, target } }: AnnounceEvent, manager: AnnounceManager): string | undefined =>
              source === null || source === undefined || target === null || target === undefined || source.id === target.id
                ? undefined
                : `${atPosition(nameOf(source), rankOf(target), totalOf(manager))}.`,
            dragend: ({ operation: { source }, canceled }: AnnounceEvent, manager: AnnounceManager): string | undefined =>
              source === null || source === undefined
                ? undefined
                : `${canceled === true ? "Reorder cancelled. " : "Dropped "}${atPosition(nameOf(source), rankOf(source), totalOf(manager))}.`,
          },
        })
      : plugin,
  );

/** Generic controlled reorderable list over `@dnd-kit/react`; caller owns `items` and applies `onReorder`. */
export function SortableList<T>({
  items,
  getItemKey,
  renderItem,
  onReorder,
  handle = false,
  itemLabel,
  disabled = false,
  className,
  "aria-label": ariaLabel,
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
    <DragDropProvider onDragEnd={handleDragEnd} plugins={withAnnouncements}>
      <KeyboardFocusKeeper />
      {/* LIST SEMANTICS, the `VirtualList` shape (side-eye 2026-08-06): a reorderable rack IS a list, and a
          screen reader that never hears "list, 12 items · item 3 of 12" cannot tell a reorder landed. Real
          `<ul>`/`<li>` rather than roles (tailwind preflight strips the marker/indent, so the skin is
          unchanged and no suppression is owed). The rank rides each item as `aria-posinset`, which is also
          the only channel a list with no VISIBLE rank has for saying where a row sits. */}
      <ul aria-label={ariaLabel} className={cn(sortableVariants().root(), className)} data-slot="sortable-root">
        {items.map((item, index) => (
          <SortableItem
            count={items.length}
            disabled={disabled}
            handle={handle}
            id={getItemKey(item)}
            index={index}
            key={getItemKey(item)}
            label={itemLabel?.(item) ?? UNNAMED_ITEM}
          >
            {renderItem(item, index)}
          </SortableItem>
        ))}
      </ul>
    </DragDropProvider>
  );
}
