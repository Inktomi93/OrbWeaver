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

/**
 * Card — the base surface container features compose (character cards, config panels). A styled
 * panel, NOT a domain card: `bg-card` + `border-border` + `rounded-card`. `padding` rides the
 * spacing-intent scale; `interactive` adds the hover + focus-ring affordance for clickable cards
 * (ui-package-design §6.1). The caller owns the semantics (add `onClick` for a click target).
 *
 * When `interactive`, the div also gets keyboard operability (`role="button"` + `tabIndex={0}` +
 * Enter/Space activation) so the focus ring is not a lie — the caller can override any of
 * `role`/`tabIndex`/`onKeyDown` to take back the semantics (e.g. `role="link"`, a real anchor child).
 *
 * Usage: `<Card padding="section" interactive onClick={open}>…</Card>`.
 */
export function Card({ className, padding, interactive, ...props }: CardProps): ReactElement {
  const a11y =
    interactive === true
      ? {
          role: props.role ?? "button",
          tabIndex: props.tabIndex ?? 0,
          onKeyDown: props.onKeyDown ?? activateOnKey,
        }
      : undefined;
  return (
    <div {...props} {...a11y} className={cn(cardVariants({ padding, interactive }), className)} />
  );
}
