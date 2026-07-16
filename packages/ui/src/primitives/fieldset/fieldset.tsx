import type { FieldsetLegendProps as BaseLegendProps, FieldsetRootProps as BaseRootProps } from "@base-ui/react/fieldset";
import { Fieldset as BaseFieldset } from "@base-ui/react/fieldset";
import type { ReactElement } from "react";
import { cn } from "#lib";
import { fieldsetVariants } from "./variants";

const slots = fieldsetVariants();

export interface FieldsetProps extends Omit<BaseRootProps, "className"> {
  className?: string;
}

export interface FieldsetLegendProps extends Omit<BaseLegendProps, "className"> {
  className?: string;
}

/**
 * Renders a real `<fieldset>` and wires `aria-labelledby` to its `<FieldsetLegend>`, giving a
 * RadioGroup/CheckboxGroup an accessible group name. The sanctioned way to name a control group.
 */
export function Fieldset(props: FieldsetProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseFieldset.Root className={cn(slots.root(), className)} data-slot="fieldset-root" {...rest} />;
}

export function FieldsetLegend(props: FieldsetLegendProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseFieldset.Legend className={cn(slots.legend(), className)} data-slot="fieldset-legend" {...rest} />;
}
