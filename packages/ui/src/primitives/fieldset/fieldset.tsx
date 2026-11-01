import type { FieldsetLegendProps as BaseLegendProps, FieldsetRootProps as BaseRootProps } from "@base-ui/react/fieldset";
import { Fieldset as BaseFieldset } from "@base-ui/react/fieldset";
import type { ReactElement } from "react";
import { fieldsetVariants } from "./variants.ts";

const slots = fieldsetVariants();

export type FieldsetProps = Omit<BaseRootProps, "className">;

export type FieldsetLegendProps = Omit<BaseLegendProps, "className">;

/**
 * Renders a real `<fieldset>` and wires `aria-labelledby` to its `<FieldsetLegend>`, giving a
 * RadioGroup/CheckboxGroup an accessible group name. The sanctioned way to name a control group.
 */
export function Fieldset(props: FieldsetProps): ReactElement {
  return <BaseFieldset.Root className={slots.root()} data-slot="fieldset-root" {...props} />;
}

export function FieldsetLegend(props: FieldsetLegendProps): ReactElement {
  return <BaseFieldset.Legend className={slots.legend()} data-slot="fieldset-legend" {...props} />;
}
