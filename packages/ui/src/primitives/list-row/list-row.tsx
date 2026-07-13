import type { MouseEventHandler, ReactElement, ReactNode, RefObject } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { listRowVariants } from "./variants";

export interface ListRowProps {
  /** Leading slot — avatar/icon, rendered before the title/subtitle stack. */
  leading?: ReactNode;
  /**
   * The row's primary label. Typed as a plain string (not `ReactNode`) because it backs the
   * native `title=` attribute and — when `clickable` — the row's accessible name.
   */
  title: string;
  /** Optional secondary line (subtitle/meta — one slot, caller's call which it means). */
  subtitle?: string;
  /**
   * Optional hover/:focus-within reveal that display-swaps the `subtitle` on the same content-
   * column line. Lives in the content column (never `actions`), so it truncates within the
   * column rather than contending with trailing buttons for width. Requires `subtitle` to swap against.
   */
  subtitleReveal?: string;
  /**
   * Trailing actions. Rendered as a sibling of the clickable body, never nested inside it. Ignored
   * when `renderActions` is supplied.
   */
  actions?: ReactNode;
  /**
   * The collapse-aware actions form: a render fn given `collapsed` — true once the row's own
   * width drops below `collapseBelow` (a ResizeObserver on the root). Wins over `actions` when
   * both are set. No-op collapse (always false) when `collapseBelow` is omitted.
   */
  renderActions?: (collapsed: boolean) => ReactNode;
  /** The row width (px) at/below which `renderActions` receives `collapsed=true`. */
  collapseBelow?: number;
  /**
   * Renders the row's body as a native `<button>`, with the `actions` slot kept a sibling so
   * nothing interactive nests inside it. The body's children are all phrasing content, so a
   * native `<button>` is valid.
   */
  clickable?: boolean;
  /** Marks the row as the current selection (`data-selected` skin + `aria-current`). */
  selected?: boolean;
  /** Disables the click affordance: removed from tab order, `aria-disabled`, dimmed. */
  disabled?: boolean;
  /** `compact` tightens the row to the sm control height for dense surfaces. */
  density?: "default" | "compact";
  onClick?: MouseEventHandler<HTMLButtonElement>;
  className?: string;
}

/**
 * ListRow — the slot-based entity row every list surface composes: leading slot → title/subtitle
 * stack → trailing actions. Domain-agnostic — slots + props only.
 *
 * A11y-critical: when `clickable`, the row's body (leading + title/subtitle) is one native
 * `<button>` element — `actions` renders as a sibling outside that body, never nested inside it
 * (nested interactive content inside a button is invalid for assistive tech). The body's own
 * children are strictly phrasing content, so the native `<button>` is valid HTML.
 */
type Slots = ReturnType<typeof listRowVariants>;

/** The body's inner content — strictly phrasing content so it's valid inside the clickable button. */
function ListRowContent({
  slots,
  leading,
  title,
  subtitle,
  subtitleReveal,
}: {
  slots: Slots;
  leading: ReactNode;
  title: string;
  subtitle: string | undefined;
  subtitleReveal: string | undefined;
}): ReactElement {
  // The subtitle hides on hover/focus only when a reveal is present, so it takes the exact line.
  const subtitleSwap =
    subtitleReveal === undefined ? "" : "group-hover:hidden group-focus-within:hidden";
  return (
    <>
      {leading === undefined ? null : (
        // Decorative — title/subtitle are the row's accessible name. aria-hidden keeps a fallback
        // avatar's initials (or an image's alt) from leaking into the name.
        <span className={slots.leading()} data-slot="list-row-leading" aria-hidden={true}>
          {leading}
        </span>
      )}
      <span className={slots.content()} data-slot="list-row-content">
        <span className={slots.title()} data-slot="list-row-title" title={title}>
          {title}
        </span>
        {subtitle === undefined ? null : (
          <span
            className={slots.subtitle({ className: subtitleSwap })}
            data-slot="list-row-subtitle"
            title={subtitle}
          >
            {subtitle}
          </span>
        )}
        {subtitleReveal === undefined ? null : (
          <span
            aria-hidden={true}
            className={slots.subtitleReveal()}
            data-slot="list-row-subtitle-reveal"
            title={subtitleReveal}
          >
            {subtitleReveal}
          </span>
        )}
      </span>
    </>
  );
}

/** The body wrapper: a native `<button>` when `clickable`, else a static `<div>`. Split out to keep
 *  the clickable/selected/disabled branching off the composition root's complexity. */
function ListRowBody({
  slots,
  clickable,
  selected,
  disabled,
  onClick,
  children,
}: {
  slots: Slots;
  clickable: boolean;
  selected: boolean;
  disabled: boolean;
  onClick: MouseEventHandler<HTMLButtonElement> | undefined;
  children: ReactNode;
}): ReactElement {
  const ariaCurrent = selected ? "true" : undefined;
  if (!clickable) {
    // Non-clickable rows are a static <div> body — no role, no tab stop; onClick is honored only
    // when clickable.
    return (
      <div
        aria-current={ariaCurrent}
        className={slots.body()}
        data-selected={selected ? "" : undefined}
        data-slot="list-row-body"
      >
        {children}
      </div>
    );
  }
  // aria-disabled (not the native disabled attribute) keeps a disabled row focusable + announced;
  // dropping onClick neutralizes activation with no pointer-events CSS trick needed.
  return (
    <button
      aria-current={ariaCurrent}
      aria-disabled={disabled ? true : undefined}
      className={slots.body()}
      data-disabled={disabled ? "" : undefined}
      data-selected={selected ? "" : undefined}
      data-slot="list-row-body"
      onClick={disabled ? undefined : onClick}
      tabIndex={disabled ? -1 : 0}
      type="button"
    >
      {children}
    </button>
  );
}

/** Tracks whether the observed element's width dropped at/below `threshold`. useLayoutEffect +
 *  ResizeObserver so the collapse settles before paint. */
function useCollapsedBelow(
  ref: RefObject<HTMLElement | null>,
  threshold: number | undefined,
): boolean {
  const [collapsed, setCollapsed] = useState(false);
  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null || threshold === undefined) {
      setCollapsed(false);
      return;
    }
    const measure = (): void => setCollapsed(node.getBoundingClientRect().width <= threshold);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return (): void => observer.disconnect();
  }, [ref, threshold]);
  return collapsed;
}

export function ListRow({
  leading,
  title,
  subtitle,
  subtitleReveal,
  actions,
  renderActions,
  collapseBelow,
  clickable = false,
  selected = false,
  disabled = false,
  density = "default",
  onClick,
  className,
}: ListRowProps): ReactElement {
  const slots = listRowVariants({ density, clickable });
  const rootRef = useRef<HTMLDivElement>(null);
  const collapsed = useCollapsedBelow(
    rootRef,
    renderActions === undefined ? undefined : collapseBelow,
  );
  const resolvedActions = renderActions !== undefined ? renderActions(collapsed) : actions;
  return (
    <div className={slots.root({ className })} data-slot="list-row-root" ref={rootRef}>
      <ListRowBody
        clickable={clickable}
        disabled={disabled}
        onClick={onClick}
        selected={selected}
        slots={slots}
      >
        <ListRowContent
          leading={leading}
          slots={slots}
          subtitle={subtitle}
          subtitleReveal={subtitleReveal}
          title={title}
        />
      </ListRowBody>
      {resolvedActions === undefined ? null : (
        <div className={slots.actions()} data-slot="list-row-actions">
          {resolvedActions}
        </div>
      )}
    </div>
  );
}
