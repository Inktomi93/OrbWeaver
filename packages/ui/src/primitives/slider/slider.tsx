import type { SliderRootProps } from "@base-ui/react/slider";
import { Slider as BaseSlider } from "@base-ui/react/slider";
import type { ReactElement, ReactNode } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn } from "#lib";
import { sliderVariants } from "./variants";

// A range slider carries an array value → one thumb per entry; a single slider carries a scalar.
function thumbCount(value: number | readonly number[] | null | undefined): number {
  return Array.isArray(value) ? value.length : 1;
}

// `orientation` is narrowed OUT: Base UI accepts "vertical" but the variants ship no vertical CSS branch.
export interface SliderProps<Value extends number | readonly number[] = number>
  extends Omit<SliderRootProps<Value>, "orientation">,
    VariantProps<typeof sliderVariants> {
  className?: string;
  /** Visible, auto-associated label. A plain string also seeds the thumb `aria-label` for the single-thumb case. */
  label?: ReactNode;
  /** Accessible names per thumb (index-aligned) — use for range endpoints ("Minimum"/"Maximum"). */
  thumbLabels?: readonly string[];
  /**
   * Description id(s) for the THUMB — the element that actually carries the value for assistive tech (Base
   * UI's thumb wraps the real range input; a spread on the Root lands on a wrapper `<div>` that describes
   * nothing, the same footgun `NumberField` documents). Use it to attach a provenance/clamp gloss rendered
   * beside the control, so the line belongs to its own row instead of fusing with its neighbours' text.
   */
  thumbDescribedBy?: string | undefined;
  showValue?: boolean;
  formatValue?: (formattedValues: readonly string[], values: readonly number[]) => ReactNode;
}

/**
 * Single or range: pass a scalar for one thumb, or an array (`value={[lo, hi]}`) for a range.
 *
 * `tone` picks the KnobRow arm: `neutral` = EXPLICIT (a weight fill, no accent), `ghost` = INHERITED
 * (NO fill, muted thumb — the thumb still sits at the resolved effective value, so the datum is never
 * hidden, but a bare rail makes no magnitude claim about a value you did not set; §4.1).
 */
export function Slider<Value extends number | readonly number[] = number>(props: SliderProps<Value>): ReactElement {
  const { className, label, thumbLabels, thumbDescribedBy, showValue = false, formatValue, tone, ...rootProps } = props;
  const slots = sliderVariants({ tone });
  const count = thumbCount(rootProps.value ?? rootProps.defaultValue);
  const isRange = count > 1;
  const singleAriaLabel = typeof label === "string" ? label : thumbLabels?.[0];
  const hasLabel = label !== undefined && label !== null;

  return (
    <BaseSlider.Root className={cn(slots.root(), className)} data-slot="slider-root" {...rootProps}>
      {hasLabel || showValue ? (
        <div className={slots.header()} data-slot="slider-header">
          {hasLabel ? (
            <BaseSlider.Label className={slots.label()} data-slot="slider-label">
              {label}
            </BaseSlider.Label>
          ) : null}
          {showValue ? (
            <BaseSlider.Value className={slots.value()} data-slot="slider-value">
              {formatValue ?? null}
            </BaseSlider.Value>
          ) : null}
        </div>
      ) : null}
      <BaseSlider.Control className={slots.control()} data-slot="slider-control">
        <BaseSlider.Track className={slots.track()} data-slot="slider-track">
          <BaseSlider.Indicator className={slots.indicator()} data-slot="slider-indicator" />
          {Array.from({ length: count }, (_unused, index) => (
            <BaseSlider.Thumb
              aria-describedby={thumbDescribedBy}
              aria-label={isRange ? thumbLabels?.[index] : singleAriaLabel}
              className={slots.thumb()}
              data-slot="slider-thumb"
              index={isRange ? index : undefined}
              // biome-ignore lint/suspicious/noArrayIndexKey: thumbs are a fixed positional set (one per value slot), never reordered.
              key={index}
            />
          ))}
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
}
