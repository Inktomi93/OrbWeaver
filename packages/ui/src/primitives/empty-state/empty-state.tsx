import type { ReactElement, ReactNode } from "react";
import { emptyStateVariants } from "./variants.ts";

export interface EmptyStateProps {
  /** Brand-glyph slot, renders unstyled and, when supplied, takes the head slot instead of `icon`. */
  decoration?: ReactNode;
  /** Optional muted glyph slot. Superseded by `decoration` when both set. */
  icon?: ReactNode;
  title: ReactNode;
  /** Promotes a teaching statement one ratified step when it is the surface's focal message. */
  titleStep?: "default" | "focal";
  /**
   * The title's ELEMENT (side-eye 2026-08-22 P3-1 / ARIA rec 3). `p` is right for a state inside a pane
   * that already has a heading above it — a second `h2` there would invent structure. `h2` is for the state
   * that IS its pane's content: a section landing rendering only this block leaves `main` with ZERO headings,
   * so heading navigation dead-ends in the pane the reader is looking at. Opt-in, because the honest answer
   * depends on the host's own heading tree, which this part cannot see.
   */
  titleAs?: "p" | "h2";
  /** The description's reading measure — `wide` (≈60ch) for a focal CONTENT welcome, `default` (≈42.5ch)
   *  for a list-pane or ribbon state. See `variants.ts`. */
  measure?: "default" | "wide";
  description?: ReactNode;
  /** Trailing action slot — typically an `@orb/ui/button` `<Button>`. */
  action?: ReactNode;
  className?: string;
}

/** Teaching empty-state pattern: icon -\> title -\> description -\> action, centered. Copy is the caller's.
 *  The VOICE scales itself to the surface it lands in (a container query on the root — see variants.ts):
 *  CONTENT-tier by default, one type step down inside a narrow LIST pane. No prop, nothing to remember. */
export function EmptyState({
  decoration,
  icon,
  title,
  titleStep = "default",
  titleAs = "p",
  measure = "default",
  description,
  action,
  className,
}: EmptyStateProps): ReactElement {
  const slots = emptyStateVariants({ titleStep, measure });
  let head: ReactElement | null = null;
  if (decoration !== undefined) {
    head = (
      <div className={slots.decoration()} data-slot="empty-state-decoration">
        {decoration}
      </div>
    );
  } else if (icon !== undefined) {
    head = (
      <div className={slots.icon()} data-slot="empty-state-icon">
        {icon}
      </div>
    );
  }
  return (
    <div className={slots.root({ className })} data-slot="empty-state-root">
      {head}
      {/* Two spellings of ONE title, never a dynamic tag: the element is a11y STRUCTURE (see `titleAs`), and
          a computed `as` would let a caller mint any tag it liked. */}
      {titleAs === "h2" ? (
        <h2 className={slots.title()} data-slot="empty-state-title" data-title-step={titleStep === "focal" ? "focal" : undefined}>
          {title}
        </h2>
      ) : (
        <p className={slots.title()} data-slot="empty-state-title" data-title-step={titleStep === "focal" ? "focal" : undefined}>
          {title}
        </p>
      )}
      {description === undefined ? null : (
        <p className={slots.description()} data-slot="empty-state-description">
          {description}
        </p>
      )}
      {action === undefined ? null : (
        <div className={slots.action()} data-slot="empty-state-action">
          {action}
        </div>
      )}
    </div>
  );
}
