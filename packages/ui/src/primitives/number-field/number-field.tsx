import type { NumberFieldRootProps } from "@base-ui/react/number-field";
import { NumberField as BaseNumberField } from "@base-ui/react/number-field";
import type { ReactElement, ReactNode } from "react";
import { cn } from "#lib";
import { numberField } from "./variants";

const DECREMENT_LABEL = "Decrease";
const INCREMENT_LABEL = "Increase";

const slots = numberField();

// The scrub cursor glyph — a horizontal double-arrow shown during pointer lock while dragging. Base
// UI ships the ScrubAreaCursor container, not the mark (inline SVG, the established seal pattern).
const SCRUB_CURSOR_ICON: ReactElement = (
  <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 14 14" width="14">
    <path
      d="M4 4.5 1.5 7 4 9.5M10 4.5 12.5 7 10 9.5M1.5 7h11"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    />
  </svg>
);

export interface NumberFieldProps extends NumberFieldRootProps {
  className?: string;
  /**
   * Renders a drag-to-scrub label (Base UI `NumberField.ScrubArea` + `ScrubAreaCursor`) above the
   * steppers — click-drag the label to change the value (the ST-style numeric ergonomic). Omit to
   * hide the affordance.
   */
  scrubLabel?: ReactNode;
  /** Scrub cursor axis. @default "horizontal" */
  scrubDirection?: "horizontal" | "vertical";
}

/**
 * The numeric stepper input — Base UI NumberField (Root → optional ScrubArea → Group/Decrement/Input/
 * Increment) sealed behind the token skin, steppers at touch-floor size; controlled-capable via
 * `value`/`onValueChange` passthrough (D42 §2 — Base UI seal).
 *
 * Pass `scrubLabel` to expose the drag-to-scrub label (pointer-lock cursor while dragging); the
 * increment/decrement steppers keep clamping to `min`/`max` regardless.
 *
 * Usage: `<NumberField max={10} min={0} value={count} onValueChange={setCount} />`
 * Scrub: `<NumberField scrubLabel="Weight" value={w} onValueChange={setW} />`
 */
export function NumberField(props: NumberFieldProps): ReactElement {
  const { className, scrubLabel, scrubDirection = "horizontal", ...rest } = props;
  const hasScrub = scrubLabel !== undefined && scrubLabel !== null;
  return (
    <BaseNumberField.Root className={cn(slots.root(), className)} {...rest}>
      {hasScrub ? (
        <BaseNumberField.ScrubArea className={slots.scrubArea()} direction={scrubDirection}>
          {scrubLabel}
          <BaseNumberField.ScrubAreaCursor className={slots.scrubCursor()}>
            {SCRUB_CURSOR_ICON}
          </BaseNumberField.ScrubAreaCursor>
        </BaseNumberField.ScrubArea>
      ) : null}
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
