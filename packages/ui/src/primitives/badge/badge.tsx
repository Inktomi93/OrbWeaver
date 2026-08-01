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
 * Usage: `<Badge intent="success" size="sm">Active</Badge>`. `tone="soft"` swaps the filled pill for a
 * tinted variant (15% background + intent-colored text + hairline border) — the status-chip look;
 * `tone="ghost"` drops the fill entirely (hairline outline + intent text) for chips that must stay
 * quieter than the surface's focal element no matter how many of them render.
 */
export function Badge({ className, intent, tone, size, ...props }: BadgeProps): ReactElement {
  return <span data-slot="badge" {...props} className={cn(badgeVariants({ intent, tone, size }), className)} />;
}
