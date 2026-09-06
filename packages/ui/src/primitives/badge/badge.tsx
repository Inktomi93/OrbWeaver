import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { variantProps } from "#lib";
import { badgeVariants } from "./variants.ts";

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
 *
 * `size="inline"` is the IN-FLOW arm — a chip rendered inside a run of prose (a `{{macro}}` token in a
 * preview), which must not perturb the line box it lives in. See the variant's own note.
 *
 * `size="dot"` is the INDICATOR arm — a CHILDLESS 6px circle meaning "something is here", with no number
 * in it (#1798). Render it with no children and `aria-hidden`; the fact it marks belongs in the host
 * control's accessible name, and its POSITION belongs to the call site. See the variant's own note.
 */
export function Badge({ className, intent, tone, size, ...props }: BadgeProps): ReactElement {
  // The className AND the `data-intent`/`data-tone`/`data-size` axis stamp, from ONE selection object (#1080).
  return <span data-slot="badge" {...props} {...variantProps(badgeVariants, { intent, tone, size }, className)} />;
}
