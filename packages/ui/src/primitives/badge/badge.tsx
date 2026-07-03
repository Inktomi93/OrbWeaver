import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn } from "#lib";
import { badgeVariants } from "./variants";

export interface BadgeProps extends ComponentProps<"span">, VariantProps<typeof badgeVariants> {}

/**
 * Badge — a small status/label pill. This IS the chip/pill: "chip" and "pill" are aliases for the
 * same primitive, so features never re-author them. Compose a leading `<Icon>` from
 * `@orb/ui/icons` as the first child for an icon+label chip (ui-package-design §6.1).
 *
 * Usage: `<Badge intent="success" size="sm">Active</Badge>`.
 */
export function Badge({ className, intent, size, ...props }: BadgeProps): ReactElement {
  return (
    <span data-slot="badge" {...props} className={cn(badgeVariants({ intent, size }), className)} />
  );
}
