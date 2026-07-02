import type { SliderRootProps } from "@base-ui/react/slider";
import { Slider as BaseSlider } from "@base-ui/react/slider";
import type { ReactElement } from "react";
import { cn } from "#lib";
import { slider } from "./variants";

export interface SliderProps extends SliderRootProps<number> {
  className?: string;
  /** Accessible name for the thumb — required unless composed under a labeled `<Field>`. */
  label?: string;
}

/**
 * The single-value slider — Base UI Slider (Root/Control/Track/Indicator/Thumb) sealed behind the
 * token skin; controlled-capable via `value`/`onValueChange` passthrough (D42 §2 — Base UI seal).
 *
 * Usage: `<Slider label="Temperature" max={2} min={0} step={0.05} value={t} onValueChange={setT} />`
 */
export function Slider({ className, label, ...rest }: SliderProps): ReactElement {
  const slots = slider();
  return (
    <BaseSlider.Root className={cn(slots.root(), className)} {...rest}>
      <BaseSlider.Control className={slots.control()}>
        <BaseSlider.Track className={slots.track()}>
          <BaseSlider.Indicator className={slots.indicator()} />
          <BaseSlider.Thumb aria-label={label} className={slots.thumb()} />
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
}
