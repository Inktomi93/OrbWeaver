import type { KeyboardEvent, MouseEventHandler, ReactElement, ReactNode } from "react";
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
   * Trailing actions (typically `@orb/ui/button` `<Button>`s). Rendered as a SIBLING of the
   * clickable body, never nested inside it — see the component doc-comment for why.
   */
  actions?: ReactNode;
  /**
   * Renders the row's body as one `role="button"` element with a focus ring + Enter/Space
   * activation (mirrors `@orb/ui/card`'s `interactive` — div + keyboard synth, not a real
   * `<button>`, since the row also hosts the sibling `actions` slot outside it).
   */
  clickable?: boolean;
  /** Marks the row as the current selection (`data-selected` skin + `aria-current`). */
  selected?: boolean;
  /** Disables the click affordance: removed from tab order, `aria-disabled`, dimmed. */
  disabled?: boolean;
  /** `compact` tightens the row to the sm control height for dense surfaces. */
  density?: "default" | "compact";
  onClick?: MouseEventHandler<HTMLDivElement>;
  className?: string;
}

// A div is not natively operable — mirrors card.tsx's activateOnKey (Enter/Space synthesizes the
// click the caller already wired to onClick).
function activateOnKey(event: KeyboardEvent<HTMLDivElement>): void {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.currentTarget.click();
  }
}

/**
 * ListRow — the slot-based entity row every list surface composes (library, presets, rules,
 * plugins, databank docs, rosters): leading slot → title/subtitle stack → trailing actions.
 * Domain-agnostic — slots + props only, no domain knowledge (ui-package-design §12).
 *
 * **A11y-critical:** when `clickable`, the row's BODY (leading + title/subtitle) is ONE
 * `role="button"` element — `actions` renders as a SIBLING outside that body, never nested inside
 * it. Nested interactive content inside a button is invalid (unreachable/inconsistent for
 * assistive tech), so keeping `actions` a sibling makes every action its own independent tab stop
 * with its own accessible name, outside the row's accessible name (which is computed from the
 * body's text content alone).
 *
 * Usage:
 * ```tsx
 * <ListRow leading={<Avatar .../>} title="Elara" subtitle="Last used 2h ago" clickable
 *   selected={activeId === id} onClick={() => select(id)} actions={<Button size="sm">Edit</Button>} />
 * ```
 */
export function ListRow({
  leading,
  title,
  subtitle,
  actions,
  clickable = false,
  selected = false,
  disabled = false,
  density = "default",
  onClick,
  className,
}: ListRowProps): ReactElement {
  const slots = listRowVariants({ density, clickable });
  // Non-clickable rows accept no onClick at all — a static row wired to a click handler without
  // the button semantics is exactly the a11y footgun `clickable` exists to prevent (biome's
  // noStaticElementInteractions/useKeyWithClickEvents catch this at the type-blind JSX level too).
  const keyboardA11y = clickable
    ? {
        role: "button" as const,
        tabIndex: disabled ? -1 : 0,
        onKeyDown: activateOnKey,
        onClick: disabled ? undefined : onClick,
      }
    : {};
  return (
    <div className={slots.root({ className })} data-slot="list-row-root">
      <div
        {...keyboardA11y}
        aria-current={selected ? "true" : undefined}
        aria-disabled={disabled ? true : undefined}
        className={slots.body()}
        data-disabled={disabled ? "" : undefined}
        data-selected={selected ? "" : undefined}
        data-slot="list-row-body"
      >
        {leading === undefined ? null : (
          // The leading slot (avatar/icon) is DECORATIVE in the row contract — the title/subtitle are
          // the row's accessible name. `aria-hidden` keeps a fallback avatar's initials (or an image's
          // alt) from leaking into the name (a chat row was announcing "UC Untitled chat owner, Niko"
          // instead of "Untitled chat, owner Niko"). Leading never holds its own interactive content
          // (that would nest inside the role="button" body — the a11y footgun this seal avoids).
          <div className={slots.leading()} data-slot="list-row-leading" aria-hidden={true}>
            {leading}
          </div>
        )}
        <div className={slots.content()} data-slot="list-row-content">
          <p className={slots.title()} data-slot="list-row-title" title={title}>
            {title}
          </p>
          {subtitle === undefined ? null : (
            <p className={slots.subtitle()} data-slot="list-row-subtitle" title={subtitle}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions === undefined ? null : (
        <div className={slots.actions()} data-slot="list-row-actions">
          {actions}
        </div>
      )}
    </div>
  );
}
