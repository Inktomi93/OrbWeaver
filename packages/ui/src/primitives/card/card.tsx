import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn } from "#lib";
import { card } from "./variants";

export interface CardProps extends ComponentProps<"div">, VariantProps<typeof card> {}

/**
 * Card — the base surface container features compose (character cards, config panels). A styled
 * panel, NOT a domain card: `bg-card` + `border-border` + `rounded-card`. `padding` rides the
 * spacing-intent scale; `interactive` adds the hover + focus-ring affordance for clickable cards
 * (ui-package-design §6.1). The caller owns the semantics (add `role`/`onClick` for a click target).
 *
 * Usage: `<Card padding="section" interactive onClick={open}>…</Card>`.
 */
export function Card({ className, padding, interactive, ...props }: CardProps): ReactElement {
  return <div {...props} className={cn(card({ padding, interactive }), className)} />;
}
