import type { CheckboxRootProps } from "@base-ui/react/checkbox";
import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import type { ReactElement } from "react";
import { cn } from "#lib";
import { Check, Icon, Lock, Minus } from "#primitives/icons";
import { checkboxVariants } from "./variants";

export interface CheckboxProps extends CheckboxRootProps {
  className?: string;
}

// `readOnly` renders distinctly from `disabled`: border/fill keep their normal token colors and a
// Lock glyph replaces the check/dash mark as the non-color "you can't touch this" signal.
export function Checkbox({ className, ...rest }: CheckboxProps): ReactElement {
  const slots = checkboxVariants();
  return (
    <BaseCheckbox.Root className={cn(slots.root(), className)} data-slot="checkbox-root" {...rest}>
      <BaseCheckbox.Indicator className={slots.indicator()} data-slot="checkbox-indicator" keepMounted={true}>
        <Icon className={slots.check()} icon={Check} size="xs" />
        <Icon className={slots.dash()} icon={Minus} size="xs" />
        <Icon className={slots.readOnlyIcon()} icon={Lock} size="xs" />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}
