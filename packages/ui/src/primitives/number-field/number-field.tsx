import type { NumberFieldRootProps } from "@base-ui/react/number-field";
import { NumberField as BaseNumberField } from "@base-ui/react/number-field";
import type { ReactElement } from "react";
import { cn } from "#lib";
import { numberField } from "./variants";

const DECREMENT_LABEL = "Decrease";
const INCREMENT_LABEL = "Increase";

export interface NumberFieldProps extends NumberFieldRootProps {
  className?: string;
}

/**
 * The numeric stepper input — Base UI NumberField (Root/Group/Decrement/Input/Increment) sealed
 * behind the token skin, steppers at touch-floor size; controlled-capable via
 * `value`/`onValueChange` passthrough (D42 §2 — Base UI seal).
 *
 * Usage: `<NumberField max={10} min={0} value={count} onValueChange={setCount} />`
 */
export function NumberField({ className, ...rest }: NumberFieldProps): ReactElement {
  const slots = numberField();
  return (
    <BaseNumberField.Root className={cn(slots.root(), className)} {...rest}>
      <BaseNumberField.Group className={slots.group()}>
        <BaseNumberField.Decrement aria-label={DECREMENT_LABEL} className={slots.decrement()}>
          <svg aria-hidden="true" fill="none" height="12" viewBox="0 0 12 12" width="12">
            <path d="M2.5 6h7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
          </svg>
        </BaseNumberField.Decrement>
        <BaseNumberField.Input className={slots.input()} />
        <BaseNumberField.Increment aria-label={INCREMENT_LABEL} className={slots.increment()}>
          <svg aria-hidden="true" fill="none" height="12" viewBox="0 0 12 12" width="12">
            <path
              d="M6 2.5v7M2.5 6h7"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.5"
            />
          </svg>
        </BaseNumberField.Increment>
      </BaseNumberField.Group>
    </BaseNumberField.Root>
  );
}
