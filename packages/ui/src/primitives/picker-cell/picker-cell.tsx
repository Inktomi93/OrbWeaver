// picker-cell — the presentation frame every single-choice PICTURE picker wears (#929 E6). See
// `variants.ts` for the measured defect this exists to close and for why the geometry is state-stable.
//
// PRESENTATION ONLY, AND THAT IS THE WHOLE CONTRACT. It renders a box, an art aperture, a label, an
// optional trailing datum and an optional description. It knows nothing about themes, skins, elevation or
// density; the ART is a `ReactNode` the feature supplies, and every INTERACTION is the host's.
//
// THE HOST WEARS IT THROUGH BASE UI'S OWN `render` PROP. `RadioGroupPickerItem` passes
// `render={<PickerCell … />}` to `Radio.Root`, so the radio's role/tabIndex/`data-checked`/handlers and
// this skin land on ONE element — no wrapper, no second box, and `data-checked:` in the recipe styles the
// real checked state rather than a prop that could drift from it. `children` is rendered last so the host
// can drop its own indicator (Base UI's `Radio.Indicator`) into the frame.

import type { ComponentProps, ReactElement, ReactNode } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn } from "#lib";
import { Text } from "#primitives/text";
import { pickerCellVariants } from "./variants.ts";

export interface PickerCellProps extends ComponentProps<"span"> {
  /** The feature-supplied picture. Decorative by construction — the label is what names the choice. */
  readonly art?: ReactNode | undefined;
  /** The visible option name. The host points its own `aria-labelledby` at `labelId`. */
  readonly label: string;
  /** The quiet second line: what picking this does. Set at the label step, muted (never 10.5px gloss). */
  readonly description?: string | undefined;
  /** A short trailing datum on the label row ("current", an age) — visual, never part of the name. */
  readonly meta?: ReactNode | undefined;
  /** The art aperture's aspect, derived from the shared cell recipe. */
  readonly shape?: VariantProps<typeof pickerCellVariants>["shape"];
  /** DOM id for the label span — the host's `aria-labelledby` target (N1: the name is the visible text). */
  readonly labelId?: string | undefined;
  /** DOM id for the description — the host's `aria-describedby` target. */
  readonly descriptionId?: string | undefined;
}

export function PickerCell({ art, label, description, meta, shape, labelId, descriptionId, className, children, ...rest }: PickerCellProps): ReactElement {
  const slots = pickerCellVariants({ shape });
  return (
    <span {...rest} className={cn(slots.frame(), className)} data-slot="picker-cell">
      {/* The aperture renders even when the feature hands no art, so a mixed grid keeps one geometry. */}
      <span aria-hidden={true} className={slots.art()} data-slot="picker-cell-art">
        {art}
      </span>
      <span className={slots.body()} data-slot="picker-cell-body">
        <span className={slots.titleRow()}>
          <Text as="span" className={slots.label()} id={labelId} voice="label">
            {label}
          </Text>
          {meta === undefined ? null : (
            <Text as="span" className={slots.meta()} data-slot="picker-cell-meta" voice="datum">
              {meta}
            </Text>
          )}
        </span>
        {description === undefined ? null : (
          <Text as="span" className={slots.description()} data-slot="picker-cell-description" id={descriptionId} size="label" tone="muted">
            {description}
          </Text>
        )}
      </span>
      {children}
    </span>
  );
}
