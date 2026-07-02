import type { ProgressRootProps as BaseRootProps } from "@base-ui/react/progress";
import { Progress as BaseProgress } from "@base-ui/react/progress";
import type { ReactElement, ReactNode } from "react";
import { progressVariants } from "./variants";

const slots = progressVariants();

// The percentage scale + the default max, so the readout formatter has no bare literals.
const PERCENT_SCALE = 100;
const DEFAULT_MAX = 100;

export interface ProgressProps extends Omit<BaseRootProps, "className"> {
  className?: string;
  /** Class for the inner track element. */
  trackClassName?: string;
  /** Visible, auto-associated label — renders `Progress.Label`. */
  label?: ReactNode;
  /** Render the formatted "72%" readout (`Progress.Value`); hidden while indeterminate. @default false */
  showValue?: boolean;
  /** Custom formatter for `Progress.Value` (receives Base UI's formatted string + raw value). */
  formatValue?: (formattedValue: string | null, value: number | null) => ReactNode;
}

/**
 * A determinate/indeterminate loading bar — seals Base UI Progress (Root/Label/Track/Indicator/Value;
 * renders `role="progressbar"` + `aria-valuenow/min/max` and sizes the indicator from `value`).
 * Bundles the parts so the anatomy cannot be mis-assembled. `value={n}` is determinate; `value={null}`
 * is indeterminate (no `aria-valuenow`, pulsing bar, and the Value readout renders nothing). NOT
 * `<Meter>` — this is task completion, not a magnitude readout.
 *
 * `label`/`showValue` add the readout row: `<Progress value={72} label="Uploading" showValue />`
 * renders "Uploading … 72%". Spec: ui-package-design §6.1.
 */
export function Progress(props: ProgressProps): ReactElement {
  const { className, trackClassName, label, showValue = false, formatValue, ...rest } = props;
  const maxValue = rest.max ?? DEFAULT_MAX;
  const hasLabel = label !== undefined && label !== null;
  const format =
    formatValue ??
    ((_formatted: string | null, value: number | null): ReactNode =>
      value === null ? null : `${Math.round((value / maxValue) * PERCENT_SCALE)}%`);

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
      <BaseProgress.Track
        className={slots.track({ className: trackClassName })}
        data-slot="progress-track"
      >
        <BaseProgress.Indicator className={slots.indicator()} data-slot="progress-indicator" />
      </BaseProgress.Track>
    </BaseProgress.Root>
  );
}
