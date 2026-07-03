import type { RadioRootProps } from "@base-ui/react/radio";
import { Radio } from "@base-ui/react/radio";
import type { RadioGroupProps as BaseRadioGroupProps } from "@base-ui/react/radio-group";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import type { ReactElement, ReactNode } from "react";
import { cn } from "#lib";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc + vite resolve Icon/Lock fine.
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

/**
 * The radio group — Base UI RadioGroup providing single-select state to its `RadioGroupItem`
 * children (arrow-key roving + one-of-many selection come free). Controlled-capable via
 * `value`/`onValueChange` passthrough (D42 §2 — Base UI seal).
 *
 * Usage: `<RadioGroup value={gm} onValueChange={setGm}><RadioGroupItem value="ai">AI</RadioGroupItem></RadioGroup>`
 */
export function RadioGroup({ className, ...rest }: RadioGroupProps): ReactElement {
  return (
    <BaseRadioGroup
      className={cn(slots.root(), className)}
      data-slot="radio-group-root"
      {...rest}
    />
  );
}

/**
 * One labeled option — Base UI Radio (Root + Indicator) wrapped in a `<label>` so the text toggles
 * the control. `value` identifies it within the group.
 *
 * `readOnly` (set on the enclosing `RadioGroup`, or per-item — Base UI passthrough) renders
 * DISTINCTLY from `disabled`: the circle keeps its normal token colors (never the `data-disabled`
 * grey-out) and a Lock glyph replaces the selected dot as the non-color "you can't touch this"
 * signal (mirrors `Switch`/`Checkbox`'s treatment — ui-package-design work-order A3).
 *
 * Usage: `<RadioGroupItem value="human">A human GM</RadioGroupItem>`
 */
export function RadioGroupItem({
  className,
  children,
  ...rest
}: RadioGroupItemProps): ReactElement {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the Radio.Root control is nested inside.
    <label className={slots.label()} data-slot="radio-group-item-label">
      <Radio.Root className={cn(slots.item(), className)} data-slot="radio-group-item" {...rest}>
        <Radio.Indicator
          className={slots.indicator()}
          data-slot="radio-group-item-indicator"
          keepMounted={true}
        >
          <span className={slots.dot()} />
          <Icon className={slots.readOnlyIcon()} icon={Lock} size="xs" />
        </Radio.Indicator>
      </Radio.Root>
      {children}
    </label>
  );
}
