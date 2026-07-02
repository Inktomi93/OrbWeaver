import type { SliderRootProps } from "@base-ui/react/slider";
import { Slider as BaseSlider } from "@base-ui/react/slider";
import type { ReactElement, ReactNode } from "react";
import { cn } from "#lib";
import { sliderVariants } from "./variants";

const slots = sliderVariants();

// A range slider carries an array value → one thumb per entry; a single slider carries a scalar.
function thumbCount(value: number | readonly number[] | null | undefined): number {
  return Array.isArray(value) ? value.length : 1;
}

// `orientation` is narrowed OUT: Base UI accepts "vertical" but the variants ship no vertical CSS
// branch, so exposing it would promise a silently-broken layout. Vertical support (type + CSS +
// test, together) lands when a real consumer needs it — see ui-primitive-contract BATCH 1.
export interface SliderProps<Value extends number | readonly number[] = number>
  extends Omit<SliderRootProps<Value>, "orientation"> {
  className?: string;
  /**
   * Visible, auto-associated label — renders `Slider.Label` (aria-labelledby on every thumb).
   * A plain string also seeds the thumb `aria-label` for the single-thumb case.
   */
  label?: ReactNode;
  /** Accessible names per thumb (index-aligned) — use for range endpoints ("Minimum"/"Maximum"). */
  thumbLabels?: readonly string[];
  /** Render the formatted `Slider.Value` readout (defaults to the values joined with " – "). */
  showValue?: boolean;
  /** Custom formatter for `Slider.Value`. */
  formatValue?: (formattedValues: readonly string[], values: readonly number[]) => ReactNode;
}

/**
 * The slider — Base UI Slider (Root → Label/Value → Control/Track/Indicator/Thumb) sealed behind the
 * token skin; controlled-capable via `value`/`onValueChange` passthrough (D42 §2 — Base UI seal).
 *
 * Single or range: pass a scalar for one thumb, or an array (`value={[lo, hi]}`) for a range — the
 * seal renders one keyboard-operable `Slider.Thumb` per entry (each carries its `index` so the range
 * reports `[lo, hi]`). `label` renders the auto-associated `Slider.Label`; `showValue` renders the
 * formatted `Slider.Value` readout.
 *
 * Usage: `<Slider label="Temperature" max={2} min={0} step={0.05} value={t} onValueChange={setT} />`
 * Range: `<Slider label="Range" showValue value={[20, 80]} onValueChange={setRange} />`
 */
export function Slider<Value extends number | readonly number[] = number>(
  props: SliderProps<Value>,
): ReactElement {
  const { className, label, thumbLabels, showValue = false, formatValue, ...rootProps } = props;
  const count = thumbCount(rootProps.value ?? rootProps.defaultValue);
  const isRange = count > 1;
  const singleAriaLabel = typeof label === "string" ? label : thumbLabels?.[0];
  const hasLabel = label !== undefined && label !== null;

  return (
    <BaseSlider.Root className={cn(slots.root(), className)} {...rootProps}>
      {hasLabel || showValue ? (
        <div className={slots.header()}>
          {hasLabel ? <BaseSlider.Label className={slots.label()}>{label}</BaseSlider.Label> : null}
          {showValue ? (
            <BaseSlider.Value className={slots.value()}>{formatValue ?? null}</BaseSlider.Value>
          ) : null}
        </div>
      ) : null}
      <BaseSlider.Control className={slots.control()}>
        <BaseSlider.Track className={slots.track()}>
          <BaseSlider.Indicator className={slots.indicator()} />
          {Array.from({ length: count }, (_unused, index) => (
            <BaseSlider.Thumb
              aria-label={isRange ? thumbLabels?.[index] : singleAriaLabel}
              className={slots.thumb()}
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
