import type { CheckboxRootProps } from "@base-ui/react/checkbox";
import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import type { ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn, variantAttrs } from "#lib";
import { Check, Icon, Lock, Minus } from "#primitives/icons";
import { checkboxVariants } from "./variants.ts";

export interface CheckboxProps extends CheckboxRootProps, VariantProps<typeof checkboxVariants> {
  className?: string;
}

// `readOnly` renders distinctly from `disabled`: border/fill keep their normal token colors and a
// Lock glyph replaces the check/dash mark as the non-color "you can't touch this" signal.
//
// `tone` rations the checked accent (default `accent` = ember; `quiet` = the neutral bulk-default arm
// a group selects for ALL of its rows at once — variants.ts header, #1110).
export function Checkbox({ className, tone, ...rest }: CheckboxProps): ReactElement {
  const slots = checkboxVariants({ tone });
  return (
    // STAMP SITE (#1080): the ROOT. The root IS the checkbox (role=checkbox, the tap target) and the only
    // slot `tone` paints; the AUTHORED `data-tone` sits beside Base UI's RUNTIME `data-checked` without
    // shadowing it.
    <BaseCheckbox.Root className={cn(slots.root(), className)} data-slot="checkbox-root" {...variantAttrs(checkboxVariants, { tone })} {...rest}>
      <BaseCheckbox.Indicator className={slots.indicator()} data-slot="checkbox-indicator" keepMounted={true}>
        <Icon className={slots.check()} icon={Check} size="xs" />
        <Icon className={slots.dash()} icon={Minus} size="xs" />
        <Icon className={slots.readOnlyIcon()} icon={Lock} size="xs" />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}
