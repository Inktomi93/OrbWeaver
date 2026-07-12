import type { MouseEventHandler, ReactElement, ReactNode, RefObject } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { listRowVariants } from "./variants";

export interface ListRowProps {
  /** Leading slot — avatar/icon, rendered before the title/subtitle stack. */
  leading?: ReactNode;
  /**
   * The row's primary label. Typed as a plain string (not `ReactNode`) because it does double
   * duty: it backs the native `title=` attribute that recovers the ellipsized text on hover, and
   * — when `clickable` — it is the row's accessible name (computed from the body's text content).
   * A `ReactNode` could satisfy neither reliably.
   */
  title: string;
  /** Optional secondary line (subtitle/meta — one slot, caller's call which it means). */
  subtitle?: string;
  /**
   * Optional hover/:focus-within reveal that DISPLAY-SWAPS the `subtitle` on the same content-column line
   * (progressive disclosure of secondary metadata — e.g. a handle · token-size line). Lives in the content
   * column (never `actions`), so a wide reveal never contends with the trailing buttons for width; it
   * truncates within the column. Requires `subtitle` to swap against. Mono (data accent).
   */
  subtitleReveal?: string;
  /**
   * Trailing actions (typically `@orb/ui/button` `<Button>`s). Rendered as a SIBLING of the
   * clickable body, never nested inside it — see the component doc-comment for why. Ignored when
   * `renderActions` is supplied (the collapse-aware form below).
   */
  actions?: ReactNode;
  /**
   * The collapse-aware actions form: a render fn given `collapsed` — `true` once the row's own width drops
   * below `collapseBelow` (a ResizeObserver on the root, so it tracks the LIST panel's width, not the
   * viewport). The consumer folds its SECONDARY actions into a kebab when `collapsed` (keeping the visible
   * targets at their intrinsic ≥32px width instead of clipping) and shows them inline when not — the
   * overflow→kebab mechanism (owner spec), measured here so the DOM stays a single source of truth. Wins
   * over `actions` when both are set. No-op collapse (always `false`) when `collapseBelow` is omitted.
   */
  renderActions?: (collapsed: boolean) => ReactNode;
  /** The row width (px) at/below which `renderActions` receives `collapsed=true`. Required to arm the
   *  measured collapse; without it `renderActions` always gets `false` (renders its expanded form). */
  collapseBelow?: number;
  /**
   * Renders the row's body as a native `<button>` (a real button, not a `role="button"` div — the
   * side-eye item-13 ruling): free Enter/Space activation + form-control semantics, with the `actions`
   * slot kept a SIBLING so nothing interactive nests inside it. The body's children are all phrasing
   * content (span wrappers + span title/subtitle, a span-based `<Avatar>`) so a native `<button>` is
   * valid.
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
 * ListRow — the slot-based entity row every list surface composes (library, presets, rules,
 * plugins, databank docs, rosters): leading slot → title/subtitle stack → trailing actions.
 * Domain-agnostic — slots + props only, no domain knowledge (ui-package-design §12).
 *
 * **A11y-critical:** when `clickable`, the row's BODY (leading + title/subtitle) is ONE native
 * `<button>` element — `actions` renders as a SIBLING outside that body, never nested inside it.
 * Nested interactive content inside a button is invalid (unreachable/inconsistent for assistive
 * tech), so keeping `actions` a sibling makes every action its own independent tab stop with its own
 * accessible name, outside the row's accessible name (which is computed from the body's text content
 * alone). The body's own children are strictly phrasing content — `<span>` wrappers, `<span>`
 * title/subtitle, and a span-based `<Avatar>` — so the native `<button>` is valid HTML.
 *
 * Usage:
 * ```tsx
 * <ListRow leading={<Avatar .../>} title="Elara" subtitle="Last used 2h ago" clickable
 *   selected={activeId === id} onClick={() => select(id)} actions={<Button size="sm">Edit</Button>} />
 * ```
 */
type Slots = ReturnType<typeof listRowVariants>;

/** The body's inner content — strictly phrasing content (spans + a span-based `<Avatar>`) so it is
 *  valid inside the native `<button>` the clickable branch renders. */
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
  // When a reveal is present the subtitle HIDES on hover/focus so the reveal takes its exact line — the
  // swap is applied only then, so a plain subtitle row still shows its subtitle on hover.
  const subtitleSwap =
    subtitleReveal === undefined ? "" : "group-hover:hidden group-focus-within:hidden";
  return (
    <>
      {leading === undefined ? null : (
        // The leading slot (avatar/icon) is DECORATIVE in the row contract — the title/subtitle are
        // the row's accessible name. `aria-hidden` keeps a fallback avatar's initials (or an image's
        // alt) from leaking into the name (a chat row was announcing "UC Untitled chat owner, Niko"
        // instead of "Untitled chat, owner Niko"). Leading never holds its own interactive content
        // (that would nest inside the <button> body — the a11y footgun this seal avoids).
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

/** The body wrapper: a native `<button>` when `clickable` (the side-eye item-13 ruling — free
 *  keyboard + form-control semantics), else a static `<div>`. Split out of `ListRow` so the
 *  clickable/selected/disabled branching does not stack onto the composition root's complexity. */
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
    // Non-clickable rows are a static <div> body — no role, no tab stop. A static row wired to a click
    // handler without button semantics is exactly the a11y footgun `clickable` exists to prevent
    // (biome's noStaticElementInteractions catches it too), so `onClick` is honored only when clickable.
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
  // `aria-disabled` (not the native `disabled` attribute) keeps a disabled row focusable + announced;
  // dropping the `onClick` handler is what actually neutralizes activation (Enter/Space still dispatch a
  // click, but with no handler it is a no-op), so no pointer-events CSS trick is needed.
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

/** Track whether the observed element's width has dropped at/below `threshold` — the row's measured
 *  collapse signal (`renderActions`). Disarmed (`null` threshold) ⇒ never collapses. `useLayoutEffect` +
 *  ResizeObserver so the collapse settles before paint (no flash of the un-collapsed cluster). */
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
