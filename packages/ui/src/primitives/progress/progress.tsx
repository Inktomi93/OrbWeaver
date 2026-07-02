import type { ProgressRootProps as BaseRootProps } from "@base-ui/react/progress";
import { Progress as BaseProgress } from "@base-ui/react/progress";
import type { ReactElement } from "react";
import { progressVariants } from "./variants";

const slots = progressVariants();

export interface ProgressProps extends Omit<BaseRootProps, "className"> {
  className?: string;
  /** Class for the inner track element. */
  trackClassName?: string;
}

/**
 * A determinate/indeterminate loading bar — seals Base UI Progress (Root/Track/Indicator; renders
 * `role="progressbar"` + `aria-valuenow/min/max` and sizes the indicator from `value`). Bundles the
 * three parts so the anatomy cannot be mis-assembled. `value={n}` is determinate; `value={null}` is
 * indeterminate (no `aria-valuenow`, pulsing bar). NOT `<Meter>` — this is task completion, not a
 * magnitude readout.
 * `<Progress value={72} aria-label="Uploading" />` · `<Progress value={null} aria-label="Working" />`
 * Spec: ui-package-design §6.1 — determinate/indeterminate bar, bg-muted track, bg-primary indicator.
 */
export function Progress(props: ProgressProps): ReactElement {
  const { className, trackClassName, ...rest } = props;
  return (
    <BaseProgress.Root className={slots.root({ className })} data-slot="progress-root" {...rest}>
      <BaseProgress.Track
        className={slots.track({ className: trackClassName })}
        data-slot="progress-track"
      >
        <BaseProgress.Indicator className={slots.indicator()} data-slot="progress-indicator" />
      </BaseProgress.Track>
    </BaseProgress.Root>
  );
}
