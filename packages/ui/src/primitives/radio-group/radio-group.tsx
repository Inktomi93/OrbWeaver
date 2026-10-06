import type { RadioRootProps } from "@base-ui/react/radio";
import { Radio } from "@base-ui/react/radio";
import type { RadioGroupProps as BaseRadioGroupProps } from "@base-ui/react/radio-group";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import type { ReactElement, ReactNode } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn } from "#lib";
import { Check, Icon, Lock } from "#primitives/icons";
// SIBLING-PRIMITIVE COMPOSITION BY RELATIVE PATH (§13.7 — `index.ts` never re-exports `./variants`, and a
// sibling reaches a recipe through the file, never the public subpath). The picker item wears the SHARED
// cell frame so the app has ONE picture-choice anatomy; only the ARIA composite lives here.
import type { PickerCellProps } from "../picker-cell/picker-cell.tsx";
import { PickerCell } from "../picker-cell/picker-cell.tsx";
import { pickerCellVariants } from "../picker-cell/variants.ts";
import { radioGroupVariants } from "./variants.ts";

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

export interface RadioGroupPickerProps extends BaseRadioGroupProps, Pick<VariantProps<typeof pickerCellVariants>, "detail"> {
  className?: string;
}

/**
 * THE PICTURE PICKER (#929 E6 / #981 F20). A single-choice collection whose options are SEEN, not read —
 * theme, chat style, elevation, density. It is the same Base UI `RadioGroup` as the circular anatomy
 * above, laid out as the shared picker-cell grid: ONE group tab stop, roving focus, arrows change
 * selection, the checked value can never empty. That is the whole reason it exists — the surface shipped
 * five of these as N independent `aria-pressed` buttons, so a keyboard user paid 8 tab stops to reach the
 * option after the one they wanted (F20), and nothing announced the set as a choice.
 *
 * NOT for a genuine multi-select or a real grid selector: Appearance's background thumbnails stay a
 * `MediaGrid` with `gridcell` semantics and its own roving arrows (#981's scope correction) — one VISUAL
 * family does not mean one SEMANTIC model.
 */
export function RadioGroupPicker({ className, detail, ...rest }: RadioGroupPickerProps): ReactElement {
  return <BaseRadioGroup className={cn(pickerCellVariants({ detail }).grid(), className)} data-slot="radio-group-picker" {...rest} />;
}

export interface RadioGroupPickerItemProps extends Omit<RadioRootProps, "children"> {
  className?: string;
  /** The feature-supplied picture — decorative; the label names the choice. */
  readonly art?: ReactNode | undefined;
  /** The visible option name, and (through `aria-labelledby`) the accessible name. */
  readonly label: string;
  /** The quiet second line, wired as `aria-describedby` — a DESCRIPTION, never part of the name. */
  readonly description?: string | undefined;
  /** A short trailing datum on the label row ("current"). Visual only. */
  readonly meta?: ReactNode | undefined;
  readonly shape?: PickerCellProps["shape"];
  /** DOM id prefix for the label/description targets — the caller owns the id space (one `useId` per group). */
  readonly idPrefix: string;
}

/**
 * One card-shaped radio. The Base UI `Radio.Root` renders AS the shared `PickerCell` through Base UI's own
 * `render` prop, so role/tabIndex/`data-checked`/keyboard handling and the cell skin land on ONE element:
 * the recipe's `data-checked:` selectors style the REAL checked state rather than a prop that could drift
 * from the group's value.
 *
 * NAMING (§13.10 N1): the name is the VISIBLE label via `aria-labelledby`, and the gloss is
 * `aria-describedby` — never an `aria-label` that silently overrides the pixels. That is the same wiring
 * the chat-style cards were corrected to in #1022, preserved here.
 */
export function RadioGroupPickerItem({ className, art, label, description, meta, shape, idPrefix, ...rest }: RadioGroupPickerItemProps): ReactElement {
  const labelId = `${idPrefix}-label`;
  const descriptionId = `${idPrefix}-description`;
  return (
    // NO `data-slot` here: the rendered element is the `PickerCell` span and it stamps `picker-cell` itself.
    // A second name passed through `render` would be silently dropped — one element, one slot name.
    <Radio.Root
      aria-labelledby={labelId}
      {...(description === undefined ? {} : { "aria-describedby": descriptionId })}
      render={
        <PickerCell
          art={art}
          className={className}
          descriptionId={descriptionId}
          label={label}
          labelId={labelId}
          meta={meta}
          shape={shape}
          {...(description === undefined ? {} : { description })}
        />
      }
      {...rest}
    >
      {/* The native indicator, not a hand-rolled tick (§13.8 R3) — it mounts only while checked. */}
      <Radio.Indicator className={pickerCellVariants().check()} data-slot="radio-group-picker-item-check" render={<span />}>
        <Icon icon={Check} size="xs" />
      </Radio.Indicator>
    </Radio.Root>
  );
}
