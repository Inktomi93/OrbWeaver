import type { MouseEventHandler, ReactElement, ReactNode, RefObject } from "react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { listRowVariants } from "./variants";

export interface ListRowProps {
  /** Leading slot — avatar/icon, rendered before the title/subtitle stack. */
  leading?: ReactNode;
  /**
   * The row's primary label. Typed as a plain string (not `ReactNode`) because it backs the
   * native `title=` attribute and — when `clickable` — the row's accessible name.
   */
  title: string;
  /**
   * The UNABBREVIATED title, for the native `title=` tooltip only — pass it when `title` is a deliberate
   * short form (a nav row whose full section name does not fit its column). Defaults to `title`. It never
   * touches the accessible name, which stays the VISIBLE `title` (WCAG 2.5.3 label-in-name: a spoken name
   * that doesn't contain the read label breaks voice control).
   */
  fullTitle?: string;
  /** Optional secondary line (subtitle/meta — one slot, caller's call which it means). */
  subtitle?: string;
  /**
   * WHERE the subtitle sits. `block` (default) is the two-line entity row. `inline` puts it on the TITLE
   * LINE after the name — the instrument-row grammar (the preset rack's name + scent, the Actions list's
   * name + fires gloss), where the subtitle takes the flexing column and the title keeps a width floor so
   * the identifier can never be squeezed to nothing.
   */
  subtitlePlacement?: "block" | "inline";
  /**
   * Drops the subtitle out of the accessible tree (`aria-hidden`, and out of `aria-describedby`). For a
   * subtitle that is a DECORATIVE echo of content the row already announces or that a screen reader has no
   * use for — e.g. a truncated mono preview of a 600-character template body, which otherwise gets read out
   * whole as the row's description. The subtitle stays visible; only the announcement drops.
   */
  subtitleDecorative?: boolean;
  /**
   * Lets a GLOSS subtitle wrap to two clamped lines instead of truncating to one. For rows whose
   * subtitle is a sentence (the home jump grid's per-section teaching copy); leave it off for dense
   * list panes, where one scannable line per row is the point.
   */
  subtitleWrap?: boolean;
  /**
   * Optional trailing meta on the title line (e.g. a relative-time stamp) — rendered INSIDE the row's
   * accessible content so screen readers keep it, unlike a stamp stranded in the `actions` sibling. Part
   * of the row's `aria-describedby`, never its name (the name stays the `title` alone).
   */
  meta?: string;
  /**
   * Rest-VISIBLE state markers (a game glyph, a pressed star, an "Archived" badge) — rendered on the TITLE
   * LINE beside `meta`, inside the content column. That is what lets a row whose CONTROLS are all
   * hover-revealed float its whole `actions` cluster (`actionsFloat`) unconditionally: markers earn their
   * width where the text already is, instead of pinning an in-flow trailing cluster the controls hide in.
   * Their labels ride the row's `aria-describedby` (like `subtitle`/`meta`), so the datum survives for a
   * screen reader even though the body's accessible NAME stays the `title` alone. Glyph-scale content only.
   */
  markers?: ReactNode;
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
   * Lifts the `actions` cluster OUT OF FLOW at the row's inline end (fine pointers only), so a cluster
   * that is HIDDEN at rest stops reserving width the title/subtitle need. Pass it for a row whose
   * trailing controls are ALL hover-revealed; a rest-VISIBLE marker (a pressed star, a badge) belongs in
   * flow, where it can't sit on top of the text. Requires the row root to carry `group` (the reveal +
   * this slot's backdrop both key on it).
   */
  actionsFloat?: boolean;
  /**
   * Renders the row's body as a native `<button>`, with the `actions` slot kept a sibling so
   * nothing interactive nests inside it. The body's children are all phrasing content, so a
   * native `<button>` is valid.
   */
  clickable?: boolean;
  /** Marks the row as the current selection (`data-selected` skin + `aria-current`). */
  selected?: boolean;
  /**
   * Marks a clickable row as a DISCLOSURE header (`aria-expanded`) — the row owns a group of child rows
   * that render below it while open. Use it INSTEAD OF `selected` on a parent whose children carry the
   * "you are here" marker: `aria-current` on both a parent and its child announces two current items for
   * one location (side-eye 2026-08-01, the settings nav). Ignored on a non-clickable row (a static div
   * has nothing to expand).
   */
  expanded?: boolean;
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

/** The DOM ids of the row's describing spans (subtitle · meta · markers), for the body's
 *  `aria-describedby`. Undefined-when-absent so callers space-join only the present ones (empty string ⇒
 *  omit the attr). */
interface ListRowDescriptors {
  subtitleId: string | undefined;
  metaId: string | undefined;
  markersId: string | undefined;
}

/** The body's inner content — strictly phrasing content so it's valid inside the clickable button. The
 *  title is `aria-hidden` because it backs the body's `aria-label` (repeating it as content would double
 *  the name); subtitle + meta stay visible AND carry ids the body's `aria-describedby` points at, so a
 *  screen reader hears "<title>, <subtitle> <meta>" — the name is the title alone, the rest a description. */
function ListRowContent({
  slots,
  leading,
  title,
  fullTitle,
  subtitle,
  subtitleReveal,
  subtitleInline,
  subtitleDecorative,
  meta,
  markers,
  ids,
}: {
  slots: Slots;
  leading: ReactNode;
  title: string;
  fullTitle: string | undefined;
  subtitle: string | undefined;
  subtitleReveal: string | undefined;
  subtitleInline: boolean;
  subtitleDecorative: boolean;
  meta: string | undefined;
  markers: ReactNode;
  ids: ListRowDescriptors;
}): ReactElement {
  // The subtitle hides on hover/focus only when a reveal is present, so it takes the exact line.
  const subtitleSwap = subtitleReveal === undefined ? "" : "group-hover:hidden group-focus-within:hidden";
  const subtitleSpan =
    subtitle === undefined ? null : (
      <span
        aria-hidden={subtitleDecorative ? true : undefined}
        className={slots.subtitle({ className: subtitleSwap })}
        data-slot="list-row-subtitle"
        id={ids.subtitleId}
        title={subtitle}
      >
        {subtitle}
      </span>
    );
  // ONE span, TWO possible parents (the `inline` arm puts it on the title line). Resolved to two nullable
  // nodes here so each render site is a bare expression, never a ternary whose alternate is a variable.
  const inlineSubtitle = subtitleInline ? subtitleSpan : null;
  const blockSubtitle = subtitleInline ? null : subtitleSpan;
  return (
    <>
      {leading === undefined ? null : (
        // Decorative — the title backs the accessible name. aria-hidden keeps a fallback avatar's
        // initials (or an image's alt) from leaking into the name.
        <span className={slots.leading()} data-slot="list-row-leading" aria-hidden={true}>
          {leading}
        </span>
      )}
      <span className={slots.content()} data-slot="list-row-content">
        <span className={slots.titleRow()} data-slot="list-row-title-row">
          <span aria-hidden={true} className={slots.title()} data-slot="list-row-title" title={fullTitle ?? title}>
            {title}
          </span>
          {/* INLINE: the scent rides the title line, taking the flexing column so the NAME keeps its floor. */}
          {inlineSubtitle}
          {markers === undefined ? null : (
            <span className={slots.markers()} data-slot="list-row-markers" id={ids.markersId}>
              {markers}
            </span>
          )}
          {meta === undefined ? null : (
            <span className={slots.meta()} data-slot="list-row-meta" id={ids.metaId}>
              {meta}
            </span>
          )}
        </span>
        {blockSubtitle}
        {subtitleReveal === undefined ? null : (
          <span aria-hidden={true} className={slots.subtitleReveal()} data-slot="list-row-subtitle-reveal" title={subtitleReveal}>
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
  expanded,
  disabled,
  onClick,
  ariaLabel,
  ariaDescribedBy,
  children,
}: {
  slots: Slots;
  clickable: boolean;
  selected: boolean;
  expanded: boolean | undefined;
  disabled: boolean;
  onClick: MouseEventHandler<HTMLButtonElement> | undefined;
  /** The row's accessible name — the `title` alone (set only on the clickable button body). */
  ariaLabel: string;
  /** Space-joined subtitle/meta ids, or undefined when the row has neither descriptor. */
  ariaDescribedBy: string | undefined;
  children: ReactNode;
}): ReactElement {
  const ariaCurrent = selected ? "true" : undefined;
  if (!clickable) {
    // Non-clickable rows are a static <div> body — no role, no tab stop, no name/description (the visible
    // title/subtitle text stands on its own); onClick is honored only when clickable.
    return (
      <div aria-current={ariaCurrent} className={slots.body()} data-selected={selected ? "" : undefined} data-slot="list-row-body">
        {children}
      </div>
    );
  }
  // aria-disabled (not the native disabled attribute) keeps a disabled row focusable + announced;
  // dropping onClick neutralizes activation with no pointer-events CSS trick needed. aria-label pins the
  // name to the title (the title span is aria-hidden), and aria-describedby carries the subtitle + meta so
  // they survive for SR users without polluting the name (the whole point of finding #1).
  return (
    <button
      aria-current={ariaCurrent}
      aria-describedby={ariaDescribedBy}
      aria-disabled={disabled ? true : undefined}
      aria-expanded={expanded}
      aria-label={ariaLabel}
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
function useCollapsedBelow(ref: RefObject<HTMLElement | null>, threshold: number | undefined): boolean {
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
  fullTitle,
  subtitle,
  subtitleReveal,
  subtitleWrap = false,
  subtitlePlacement = "block",
  subtitleDecorative = false,
  meta,
  markers,
  actions,
  renderActions,
  collapseBelow,
  actionsFloat = false,
  clickable = false,
  selected = false,
  expanded,
  disabled = false,
  density = "default",
  onClick,
  className,
}: ListRowProps): ReactElement {
  const slots = listRowVariants({ density, clickable, float: actionsFloat, subtitleWrap, subtitlePlacement });
  const rootRef = useRef<HTMLDivElement>(null);
  const collapsed = useCollapsedBelow(rootRef, renderActions === undefined ? undefined : collapseBelow);
  const resolvedActions = renderActions !== undefined ? renderActions(collapsed) : actions;
  // Stable per-row id base for the describedby wiring; the subtitle/meta ids only attach where the slot renders.
  const baseId = useId();
  const subtitleId = subtitle === undefined || subtitleDecorative ? undefined : `${baseId}-subtitle`;
  const metaId = meta === undefined ? undefined : `${baseId}-meta`;
  const markersId = markers === undefined ? undefined : `${baseId}-markers`;
  const describedBy = [subtitleId, metaId, markersId].filter((id) => id !== undefined).join(" ") || undefined;
  return (
    <div className={slots.root({ className })} data-slot="list-row-root" ref={rootRef}>
      <ListRowBody
        ariaDescribedBy={describedBy}
        ariaLabel={title}
        clickable={clickable}
        disabled={disabled}
        expanded={expanded}
        onClick={onClick}
        selected={selected}
        slots={slots}
      >
        <ListRowContent
          fullTitle={fullTitle}
          ids={{ subtitleId, metaId, markersId }}
          leading={leading}
          markers={markers}
          meta={meta}
          slots={slots}
          subtitle={subtitle}
          subtitleDecorative={subtitleDecorative}
          subtitleInline={subtitlePlacement === "inline"}
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
