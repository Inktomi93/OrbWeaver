import type {
  FieldsetLegendProps as BaseLegendProps,
  FieldsetRootProps as BaseRootProps,
} from "@base-ui/react/fieldset";
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
 * The grouped-controls primitive — Base UI Fieldset.Root sealed behind the token skin. Renders a real
 * `<fieldset>` (role `group`) and wires `aria-labelledby` to its `<FieldsetLegend>`, giving a
 * `RadioGroup`/`CheckboxGroup` (which have no intrinsic label) an accessible group name. This is the
 * sanctioned way to name a control group — do NOT hand-roll an `aria-label` on the group.
 *
 * Usage: `<Fieldset><FieldsetLegend>Difficulty</FieldsetLegend><RadioGroup>…</RadioGroup></Fieldset>`
 * Spec: ui-package-design §13 R2 — full native part surface (Root + Legend).
 */
export function Fieldset(props: FieldsetProps): ReactElement {
  const { className, ...rest } = props;
  return (
    <BaseFieldset.Root
      className={cn(slots.root(), className)}
      data-slot="fieldset-root"
      {...rest}
    />
  );
}

/**
 * The fieldset's accessible label — Base UI auto-associates it with the enclosing `<Fieldset>`
 * (renders a `<div>` that the fieldset points to via `aria-labelledby`, not a native `<legend>`).
 * `<FieldsetLegend>Difficulty</FieldsetLegend>`
 */
export function FieldsetLegend(props: FieldsetLegendProps): ReactElement {
  const { className, ...rest } = props;
  return (
    <BaseFieldset.Legend
      className={cn(slots.legend(), className)}
      data-slot="fieldset-legend"
      {...rest}
    />
  );
}
