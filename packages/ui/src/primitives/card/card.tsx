import type { ComponentProps, KeyboardEvent, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn } from "#lib";
import { cardVariants } from "./variants";

export interface CardProps extends ComponentProps<"div">, VariantProps<typeof cardVariants> {}

// A div is not natively operable — when the card ships the click affordance, mirror a button's
// Enter/Space activation by synthesizing the click the caller already wired to onClick.
function activateOnKey(event: KeyboardEvent<HTMLDivElement>): void {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.currentTarget.click();
  }
}

// When `interactive`, the div gets keyboard operability (role="button" + tabIndex + Enter/Space
// activation) so the focus ring is not a lie; caller can override role/tabIndex/onKeyDown.
//
// There is NO `padding` prop (retired, D7): island padding is resolved from the surface's tier by
// tiers.css, so a feature cannot pick it. `data-elevated` is the attribute the unlayered elevated-radius
// rule keys on — the variant's `rounded-card` utility alone would lose to the tier rule inside a Surface.
export function Card({ className, elevated, interactive, ...props }: CardProps): ReactElement {
  const a11y =
    interactive === true
      ? {
          role: props.role ?? "button",
          tabIndex: props.tabIndex ?? 0,
          onKeyDown: props.onKeyDown ?? activateOnKey,
        }
      : undefined;
  return (
    <div
      {...props}
      {...a11y}
      className={cn(cardVariants({ elevated, interactive }), className)}
      data-elevated={elevated === true ? "" : undefined}
      data-slot="card-root"
    />
  );
}
