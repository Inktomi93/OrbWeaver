import type { ReactElement, ReactNode } from "react";
import { emptyState } from "./variants";

export interface EmptyStateProps {
  /** Optional glyph slot — an `@orb/ui/icons` `<Icon>`, or the brand Weave glyph. */
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
 * Usage: `<EmptyState icon={<Icon icon={Search} size="lg" />} title="No characters yet"
 *   description="Weave your first one to begin." action={<Button>New character</Button>} />`.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps): ReactElement {
  const slots = emptyState();
  return (
    <div className={slots.root({ className })}>
      {icon === undefined ? null : <div className={slots.icon()}>{icon}</div>}
      <p className={slots.title()}>{title}</p>
      {description === undefined ? null : <p className={slots.description()}>{description}</p>}
      {action === undefined ? null : <div className={slots.action()}>{action}</div>}
    </div>
  );
}
