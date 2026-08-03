import type { ReactElement, ReactNode } from "react";
import { Button } from "#primitives/button";
import { optionStripVariants } from "./variants.ts";

/**
 * One offer in the strip. Domain-agnostic — the container knows nothing of what a row MEANS; a caller maps
 * its own model onto these slots and owns the id space (the same ids it points a driving control's
 * `aria-activedescendant` at). `disabled` uses aria-disabled (not the native attr) so the row stays
 * hoverable and its `title` reason surfaces — activation is refused, never hidden.
 */
export interface OptionStripItem {
  /** DOM id — unique within the strip, and what an external control names via `aria-activedescendant`. */
  readonly id: string;
  /** The row's primary label (the offer text). */
  readonly label: string;
  // The optional slots are `T | undefined` (not bare `?`) so a caller MAPPING its own model onto items can
  // pass `x ?? undefined` freely under exactOptionalPropertyTypes — the natural shape of a derived value.
  /** Optional secondary muted line on the same row (e.g. a description). */
  readonly description?: string | undefined;
  /** Optional leading slot (an icon), rendered before the label. Decorative (aria-hidden). */
  readonly leading?: ReactNode | undefined;
  /** Marks the row aria-disabled + refuses activation; still shown + hoverable (its `title` surfaces). */
  readonly disabled?: boolean | undefined;
  /** The hover/disabled reason, surfaced as the native `title` (a disabled row must explain itself). */
  readonly title?: string | undefined;
  /** The keyboard-driven highlight (aria-selected + the accent skin). At most one row is highlighted. */
  readonly highlighted?: boolean | undefined;
}

export interface OptionStripProps {
  /** The listbox's accessible name. */
  readonly "aria-label": string;
  /** The listbox's DOM id — what an external control names via `aria-controls`. */
  readonly id: string;
  readonly items: readonly OptionStripItem[];
  /** Pointer activation of a row. Called even for a disabled row's forced click? No — the button's
   *  `disabled` blocks it; a caller re-checks availability on its own keyboard path. */
  readonly onSelect: (item: OptionStripItem) => void;
  readonly className?: string;
}

/**
 * OptionStrip — an INLINE (never-popover) listbox: an in-flow `role="listbox"` whose rows are
 * `role="option"` buttons. Focus stays on a SEPARATE control (the strip's rows are tabIndex=-1 via the
 * Button's `focusableWhenDisabled=false` default + the explicit tabIndex below); that control moves the
 * `highlighted` row and mirrors it into its own `aria-activedescendant`. This is the macro-textarea
 * suggestion-list pattern extracted for reuse: a completion strip that must NOT steal the caret.
 *
 * Domain-agnostic — slots + ids only. The caller owns what a row means, the id space, and (for a keyboard
 * pick) the availability re-check; the strip owns the ARIA shape and the highlight/hover skin.
 */
export function OptionStrip({ "aria-label": ariaLabel, id, items, onSelect, className }: OptionStripProps): ReactElement {
  const slots = optionStripVariants();
  return (
    <div aria-label={ariaLabel} className={slots.listbox({ className })} data-slot="option-strip" id={id} role="listbox">
      {items.map((item) => {
        const styled = optionStripVariants({ highlighted: item.highlighted ?? false });
        return (
          <Button
            key={item.id}
            id={item.id}
            type="button"
            intent="ghost"
            role="option"
            aria-selected={item.highlighted ?? false}
            // aria-disabled (not native `disabled`) so the row stays hoverable and its reason surfaces.
            disabled={item.disabled ?? false}
            focusableWhenDisabled={true}
            title={item.title}
            // The rows are NOT a tab stop — the driving control is the one tab stop; highlight moves via that
            // control's arrows and rides `aria-activedescendant`. Pointer activation is unaffected.
            tabIndex={-1}
            // preventDefault stops the driving control from blurring across the click, so the strip can't
            // unmount out from under the pointer (the completion-strip caret-keeping trick).
            onMouseDown={(event): void => event.preventDefault()}
            onClick={(): void => onSelect(item)}
            className={styled.item()}
          >
            {item.leading === undefined ? null : (
              <span aria-hidden={true} className={slots.leading()} data-slot="option-strip-leading">
                {item.leading}
              </span>
            )}
            <span className={slots.body()} data-slot="option-strip-body">
              <span className={slots.label()} data-slot="option-strip-label">
                {item.label}
              </span>
              {item.description === undefined ? null : (
                <span className={slots.description()} data-slot="option-strip-description">
                  {item.description}
                </span>
              )}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
