import type { ProgressRootProps as BaseRootProps } from "@base-ui/react/progress";
import { Progress as BaseProgress } from "@base-ui/react/progress";
import type { ReactElement, ReactNode } from "react";
import { progressVariants } from "./variants.ts";

const slots = progressVariants();

export interface ProgressProps extends Omit<BaseRootProps, "className"> {
  className?: string;
  trackClassName?: string;
  /** Visible, auto-associated label — renders `Progress.Label`. */
  label?: ReactNode;
  /** Render the formatted "72%" readout (`Progress.Value`); hidden while indeterminate. @defaultValue false */
  showValue?: boolean;
  /** Custom formatter for `Progress.Value` (receives Base UI's formatted string + raw value). */
  formatValue?: (formattedValue: string | null, value: number | null) => ReactNode;
}

/**
 * Determinate/indeterminate loading bar — seals Base UI Progress. `value={null}` is indeterminate
 * (pulsing bar, no readout). NOT `<Meter>` — this is task completion, not a magnitude readout.
 */
export function Progress(props: ProgressProps): ReactElement {
  const { className, trackClassName, label, showValue = false, formatValue, ...rest } = props;
  const hasLabel = label !== undefined && label !== null;
  // The readout is Base UI's OWN formatted string, never re-derived. Base UI 1.7 (#5095) computes it
  // from `valueToPercent(value, min, max)` clamped to 0–100 — the SAME number that drives the
  // indicator's width — and runs it through Intl. A local `value / max` recompute disagreed with the
  // rendered bar on any custom `min` (min=20/max=100/value=60 → bar 50%, label "60%") and on any
  // out-of-range value (the bar clamps, the label did not). `value === null` is indeterminate: Base UI
  // hands the formatter the literal "indeterminate" here, so the readout blanks off `value`, not text.
  const format = formatValue ?? ((formatted: string | null, value: number | null): ReactNode => (value === null ? null : formatted));

  return (
    <BaseProgress.Root className={slots.root({ className })} data-slot="progress-root" {...rest}>
      {hasLabel || showValue ? (
        <div className={slots.header()} data-slot="progress-header">
          {hasLabel ? (
            <BaseProgress.Label className={slots.label()} data-slot="progress-label">
              {label}
            </BaseProgress.Label>
          ) : null}
          {showValue ? (
            <BaseProgress.Value className={slots.value()} data-slot="progress-value">
              {format}
            </BaseProgress.Value>
          ) : null}
        </div>
      ) : null}
      <BaseProgress.Track className={slots.track({ className: trackClassName })} data-slot="progress-track">
        <BaseProgress.Indicator className={slots.indicator()} data-slot="progress-indicator" />
      </BaseProgress.Track>
    </BaseProgress.Root>
  );
}
