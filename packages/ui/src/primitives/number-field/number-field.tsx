import type { NumberFieldRootProps } from "@base-ui/react/number-field";
import { NumberField as BaseNumberField } from "@base-ui/react/number-field";
import type { ReactElement, ReactNode } from "react";
import { cn } from "#lib";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc + vite resolve Icon/Minus/MoveHorizontal/Plus fine.
import { Icon, Minus, MoveHorizontal, Plus } from "#primitives/icons";
import { numberFieldVariants } from "./variants";

const DECREMENT_LABEL = "Decrease";
const INCREMENT_LABEL = "Increase";

const slots = numberFieldVariants();

// The scrub cursor glyph — a horizontal double-arrow shown during pointer lock while dragging. Base
// UI ships the ScrubAreaCursor container, not the mark (the lucide seal, not hand-SVG).
const SCRUB_CURSOR_ICON: ReactElement = <Icon icon={MoveHorizontal} size="xs" />;

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
          <Icon icon={Minus} size="xs" />
        </BaseNumberField.Decrement>
        <BaseNumberField.Input className={slots.input()} />
        <BaseNumberField.Increment aria-label={INCREMENT_LABEL} className={slots.increment()}>
          <Icon icon={Plus} size="xs" />
        </BaseNumberField.Increment>
      </BaseNumberField.Group>
    </BaseNumberField.Root>
  );
}
