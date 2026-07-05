import type { ReactElement, ReactNode } from "react";
import { emptyStateVariants } from "./variants";

export interface EmptyStateProps {
  /**
   * Brand-glyph slot (D62) — the client fills it with the Weave glyph for the teaching moment. Renders
   * UNSTYLED (keeps its own color) and, when supplied, takes the head slot INSTEAD of `icon`.
   */
  decoration?: ReactNode;
  /** Optional muted glyph slot — an `@orb/ui/icons` `<Icon>`. Superseded by `decoration` when both set. */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Trailing action slot — typically an `@orb/ui/button` `<Button>`. */
  action?: ReactNode;
  className?: string;
}

/**
 * EmptyState — the teaching empty-state pattern (icon → title → description → action, centered on
 * the section rhythm). Domain-agnostic: the copy is the caller's; the intent is the DESIGN.md
 * "Weave" teaching moment (ui-package-design §6.1).
 *
 * Usage:
 * ```tsx
 * <EmptyState decoration={<WeaveGlyph size={48} />} title="No characters yet"
 *   description="Weave your first one to begin." action={<Button>New character</Button>} />
 * ```
 */
export function EmptyState({
  decoration,
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps): ReactElement {
  const slots = emptyStateVariants();
  // The head slot: `decoration` (brand glyph, unstyled) WINS over `icon` (muted chrome) when both set.
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
