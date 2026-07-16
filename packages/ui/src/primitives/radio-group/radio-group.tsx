import type { RadioRootProps } from "@base-ui/react/radio";
import { Radio } from "@base-ui/react/radio";
import type { RadioGroupProps as BaseRadioGroupProps } from "@base-ui/react/radio-group";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import type { ReactElement, ReactNode } from "react";
import { cn } from "#lib";
import { Icon, Lock } from "#primitives/icons";
import { radioGroupVariants } from "./variants";

const slots = radioGroupVariants();

export interface RadioGroupProps extends BaseRadioGroupProps {
  className?: string;
}

export interface RadioGroupItemProps extends RadioRootProps {
  className?: string;
  /** The visible option label, rendered beside the control inside the associated `<label>`. */
  children?: ReactNode;
}

export function RadioGroup({ className, ...rest }: RadioGroupProps): ReactElement {
  return <BaseRadioGroup className={cn(slots.root(), className)} data-slot="radio-group-root" {...rest} />;
}

// `readOnly` renders distinctly from `disabled`: the circle keeps its normal token colors and a Lock
// glyph replaces the selected dot as the non-color "you can't touch this" signal.
export function RadioGroupItem({ className, children, ...rest }: RadioGroupItemProps): ReactElement {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the Radio.Root control is nested inside.
    <label className={slots.label()} data-slot="radio-group-item-label">
      <Radio.Root className={cn(slots.item(), className)} data-slot="radio-group-item" {...rest}>
        <Radio.Indicator className={slots.indicator()} data-slot="radio-group-item-indicator" keepMounted={true}>
          <span className={slots.dot()} />
          <Icon className={slots.readOnlyIcon()} icon={Lock} size="xs" />
        </Radio.Indicator>
      </Radio.Root>
      {children}
    </label>
  );
}
