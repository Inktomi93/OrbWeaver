import type { NumberFieldRootProps } from "@base-ui/react/number-field";
import { NumberField as BaseNumberField } from "@base-ui/react/number-field";
import type { ReactElement, ReactNode } from "react";
import { cn } from "#lib";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc + vite resolve Icon/Lock/Minus/MoveHorizontal/Plus fine.
import { Icon, Lock, Minus, MoveHorizontal, Plus } from "#primitives/icons";
import { numberFieldVariants } from "./variants";

const DECREMENT_LABEL = "Decrease";
const INCREMENT_LABEL = "Increase";

const slots = numberFieldVariants();

const SCRUB_CURSOR_ICON: ReactElement = <Icon icon={MoveHorizontal} size="xs" />;

export interface NumberFieldProps extends NumberFieldRootProps {
  className?: string;
  /** Renders a drag-to-scrub label above the steppers — click-drag to change the value. Omit to hide. */
  scrubLabel?: ReactNode;
  /** @defaultValue "horizontal" */
  scrubDirection?: "horizontal" | "vertical";
}

/**
 * Numeric stepper input. `readOnly` renders distinctly from `disabled`: the group/steppers keep their
 * normal token colors and the +/− glyphs swap to a Lock glyph as a non-color "you can't touch this" signal.
 */
export function NumberField(props: NumberFieldProps): ReactElement {
  const { className, scrubLabel, scrubDirection = "horizontal", ...rest } = props;
  const hasScrub = scrubLabel !== undefined && scrubLabel !== null;
  return (
    <BaseNumberField.Root
      className={cn(slots.root(), className)}
      data-slot="number-field-root"
      {...rest}
    >
      {hasScrub ? (
        <BaseNumberField.ScrubArea
          className={slots.scrubArea()}
          data-slot="number-field-scrub-area"
          direction={scrubDirection}
        >
          {scrubLabel}
          <BaseNumberField.ScrubAreaCursor
            className={slots.scrubCursor()}
            data-slot="number-field-scrub-cursor"
          >
            {SCRUB_CURSOR_ICON}
          </BaseNumberField.ScrubAreaCursor>
        </BaseNumberField.ScrubArea>
      ) : null}
      <BaseNumberField.Group className={slots.group()} data-slot="number-field-group">
        <BaseNumberField.Decrement
          aria-label={DECREMENT_LABEL}
          className={slots.decrement()}
          data-slot="number-field-decrement"
        >
          <Icon className={slots.stepIcon()} icon={Minus} size="xs" />
          <Icon className={slots.stepReadOnlyIcon()} icon={Lock} size="xs" />
        </BaseNumberField.Decrement>
        <BaseNumberField.Input className={slots.input()} data-slot="number-field-input" />
        <BaseNumberField.Increment
          aria-label={INCREMENT_LABEL}
          className={slots.increment()}
          data-slot="number-field-increment"
        >
          <Icon className={slots.stepIcon()} icon={Plus} size="xs" />
          <Icon className={slots.stepReadOnlyIcon()} icon={Lock} size="xs" />
        </BaseNumberField.Increment>
      </BaseNumberField.Group>
    </BaseNumberField.Root>
  );
}
