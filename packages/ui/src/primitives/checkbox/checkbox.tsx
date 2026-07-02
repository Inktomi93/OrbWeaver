import type { CheckboxRootProps } from "@base-ui/react/checkbox";
import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import type { ReactElement } from "react";
import { cn } from "#lib";
import { checkbox } from "./variants";

export interface CheckboxProps extends CheckboxRootProps {
  className?: string;
}

/**
 * The checkbox — Base UI Checkbox (Root + Indicator) sealed behind the token skin; checked and
 * indeterminate both flip to the primary token with a glyph, and the hit area meets the ≥44px touch
 * floor. Controlled-capable via `checked`/`onCheckedChange` passthrough (D42 §2 — Base UI seal).
 *
 * Usage: `<Checkbox aria-label="Remember me" checked={on} onCheckedChange={setOn} />`
 */
export function Checkbox({ className, ...rest }: CheckboxProps): ReactElement {
  const slots = checkbox();
  return (
    <BaseCheckbox.Root className={cn(slots.root(), className)} {...rest}>
      <BaseCheckbox.Indicator className={slots.indicator()} keepMounted={true}>
        <svg
          aria-hidden="true"
          className={slots.check()}
          fill="none"
          height="12"
          viewBox="0 0 12 12"
          width="12"
        >
          <path
            d="m2.5 6.5 2.5 2.5 4.5-5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </svg>
        <svg
          aria-hidden="true"
          className={slots.dash()}
          fill="none"
          height="12"
          viewBox="0 0 12 12"
          width="12"
        >
          <path d="M2.5 6h7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
        </svg>
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}
