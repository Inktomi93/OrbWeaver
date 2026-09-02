import type { SliderRootProps } from "@base-ui/react/slider";
import { Slider as BaseSlider } from "@base-ui/react/slider";
import type { ReactElement, ReactNode } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn, variantAttrs } from "#lib";
import { sliderVariants } from "./variants.ts";

// A range slider carries an array value → one thumb per entry; a single slider carries a scalar.
function thumbCount(value: number | readonly number[] | null | undefined): number {
  return Array.isArray(value) ? value.length : 1;
}

// `orientation` is narrowed OUT: Base UI accepts "vertical" but the variants ship no vertical CSS branch.
export interface SliderProps<Value extends number | readonly number[] = number>
  extends Omit<SliderRootProps<Value>, "orientation">,
    VariantProps<typeof sliderVariants> {
  className?: string;
  /** Visible label. When it is rendered it IS the thumb's accessible name (Base UI wires the
   *  association); a single-thumb slider therefore takes no `aria-label` at all — see `thumbLabels`. */
  label?: ReactNode;
  /**
   * Accessible names per thumb (index-aligned) — the range endpoints ("Minimum"/"Maximum"), or the ONE
   * name of a single-thumb slider that renders NO visible `label` (the KnobRow / talkativeness shape,
   * where the name lives in the row beside the rail).
   *
   * IGNORED for a single thumb whenever `label` is rendered, and that is the point (§13.10 N1 — visible
   * text beats `aria-label`). Base UI drops the label association the instant ANY `aria-label` reaches
   * the thumb (`SliderThumb.js`, the aria-labelledby prop falls back to the label id ONLY while
   * aria-label is null), so a seal that passed both shipped two independent name sources over one control —
   * the pixels said one thing and the accessibility tree announced the other, with nothing to keep them
   * in step (#1019). A range keeps its per-thumb names because one visible label cannot name two ends.
   */
  thumbLabels?: readonly string[];
  /**
   * Description id(s) for the THUMB — the element that actually carries the value for assistive tech (Base
   * UI's thumb wraps the real range input; a spread on the Root lands on a wrapper `<div>` that describes
   * nothing, the same footgun `NumberField` documents). Use it to attach a provenance/clamp gloss rendered
   * beside the control, so the line belongs to its own row instead of fusing with its neighbours' text.
   */
  thumbDescribedBy?: string | undefined;
  /**
   * `aria-valuetext` for the THUMB — the human reading of a position whose NUMBER is not the fact.
   *
   * Minted for the KnobRow's inherited arm (side-eye 2026-08-19 P1-2): an unset knob paints no fill and
   * parks its thumb at the resolved effective value — or at `min` when the funnel reports none — while the
   * native range still announced a bare `0`. Eight thumbs then read "everything at minimum" to a screen
   * reader, which is the exact opposite of "inherited". The DISPLAY carried the distinction (bare rail,
   * muted thumb) and the a11y tree did not.
   *
   * Base UI forwards this to the real `<input type=range>` inside the thumb, so it replaces the announced
   * number rather than decorating it. Omit wherever the number IS the fact — a valuetext that restates the
   * value is noise.
   */
  thumbValueText?: string | undefined;
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
  const { className, label, thumbLabels, thumbDescribedBy, thumbValueText, showValue = false, formatValue, tone, ...rootProps } = props;
  const slots = sliderVariants({ tone });
  const count = thumbCount(rootProps.value ?? rootProps.defaultValue);
  const isRange = count > 1;
  const hasLabel = label !== undefined && label !== null;
  // ONE NAMING PATH (§13.10 N1, #1019): a rendered <Slider.Label> names the single thumb through Base UI's
  // own association, so the string form is passed ONLY where no label is rendered. A range always names its
  // endpoints itself — one label cannot say "minimum" and "maximum".
  const thumbAriaLabels = isRange || !hasLabel ? thumbLabels : undefined;

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
        </BaseSlider.Track>
        {/* THUMBS ARE SIBLINGS OF THE TRACK, never children of it. The track clips (`overflow-hidden`, so
            the rail's rounded caps trim the Indicator's square fill); a `size-slider-thumb` (24px) knob
            nested inside that 6px rail was clipped to a 6px sliver — a flat rectangle where the knob should
            be, and a hit area 6px tall while its border box still measured a full 24×24 (design-audit
            `clipped-overflow` ×8 on the appearance pane, #86 lead 2; the box is why a rect-based census
            never saw it). Base UI positions each thumb `position:absolute` at `insetInlineStart: <pct>` /
            `top: 50%` against its nearest positioned ancestor — the Control (`relative` in variants.ts),
            whose content box is exactly the track's box, so the geometry is unchanged. */}
        {/* STAMP SITE (#1097): the THUMB. `tone` repaints the indicator AND the thumb, and the thumb is
            the interactive element (role=slider, the knob the tap-target census targets) — the indicator
            is decorative fill no census keys on. */}
        {Array.from({ length: count }, (_unused, index) => (
          <BaseSlider.Thumb
            aria-describedby={thumbDescribedBy}
            aria-label={thumbAriaLabels?.[index]}
            aria-valuetext={thumbValueText}
            className={slots.thumb()}
            data-slot="slider-thumb"
            {...variantAttrs(sliderVariants, { tone })}
            index={isRange ? index : undefined}
            // biome-ignore lint/suspicious/noArrayIndexKey: thumbs are a fixed positional set (one per value slot), never reordered.
            key={index}
          />
        ))}
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
}
