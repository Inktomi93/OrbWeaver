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
 * Usage: `<Badge tone="success">Active</Badge>` is the tinted status chip (the tone's tint, its edge and its
 * on-tint ink). `variant="solid"` fills the pill; `variant="outline"` drops the fill (the edge and the tone's text
 * ink) for chips that must stay quieter than the surface's focal element no matter how many of them render. A status
 * pill whose tone is computed takes its style from `STATUS_PILL_VARIANT`.
 *
 * `size="inline"` is the IN-FLOW arm — a chip rendered inside a run of prose (a `{{macro}}` token in a
 * preview), which must not perturb the line box it lives in. See the variant's own note.
 *
 * `size="dot"` is the INDICATOR arm — a CHILDLESS 6px circle meaning "something is here", with no number
 * in it. Render it with no children and `aria-hidden`; the fact it marks belongs in the host
 * control's accessible name, and its POSITION belongs to the call site. See the variant's own note.
 */
export function Badge({ className, variant, tone, edge, size, touchFloor, face, sentenceCase, ...props }: BadgeProps): ReactElement {
  // The className, the axis stamp and the D336 tone scope, from ONE selection object.
  return (
    <span
      data-slot="badge"
      {...props}
      {...variantProps(badgeVariants, { variant, tone, edge, size, touchFloor, face, sentenceCase }, className, tone ?? "neutral")}
    />
  );
}
