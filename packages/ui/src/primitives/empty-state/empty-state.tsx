import type { ReactElement, ReactNode } from "react";
import { emptyStateVariants } from "./variants";

export interface EmptyStateProps {
  /** Brand-glyph slot, renders unstyled and, when supplied, takes the head slot instead of `icon`. */
  decoration?: ReactNode;
  /** Optional muted glyph slot. Superseded by `decoration` when both set. */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Trailing action slot — typically an `@orb/ui/button` `<Button>`. */
  action?: ReactNode;
  className?: string;
}

/** Teaching empty-state pattern: icon -\> title -\> description -\> action, centered. Copy is the caller's. */
export function EmptyState({
  decoration,
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps): ReactElement {
  const slots = emptyStateVariants();
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
      <p className={slots.title()} data-slot="empty-state-title">
        {title}
      </p>
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
