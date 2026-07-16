// PREBUILT[for:automation-design/03-actions.md] — no current consumer; sealed for the workloads/
// automation run-status chips (statuses `idle`/`running`/`succeeded`/`failed` mirror the workloads
// run lifecycle, `workloads-deferred-designs.md` §"status"). Delete this marker (and re-check for
// consumers) if that plan is ever dropped instead of built.
import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn } from "#lib";
import type { BadgeProps } from "#primitives/badge";
import { Badge } from "#primitives/badge";
import { Button } from "#primitives/button";
import type { LucideIcon } from "#primitives/icons";
import { AlertTriangle, Check, Icon } from "#primitives/icons";
import { Spinner } from "#primitives/spinner";
import { statusChipVariants } from "./variants";

const STATUS_CHIP_STATUSES = ["idle", "running", "succeeded", "failed"] as const;
export type StatusChipStatus = (typeof STATUS_CHIP_STATUSES)[number];

interface StatusMeta {
  readonly label: string;
  readonly intent: NonNullable<BadgeProps["intent"]>;
}

const STATUS_META: Record<StatusChipStatus, StatusMeta> = {
  idle: { label: "Idle", intent: "neutral" },
  running: { label: "Running", intent: "info" },
  succeeded: { label: "Succeeded", intent: "success" },
  failed: { label: "Failed", intent: "danger" },
};

// Only failed/succeeded carry a glyph; idle/running already read fine from the label/spinner alone.
const STATUS_ICON: Partial<Record<StatusChipStatus, LucideIcon>> = {
  succeeded: Check,
  failed: AlertTriangle,
};

export interface StatusChipProps extends Omit<ComponentProps<"div">, "children">, VariantProps<typeof statusChipVariants> {
  status: StatusChipStatus;
  /** Optional detail text, e.g. "3 of 5 files". */
  summary?: string;
  /** Pre-formatted display string — ui takes a string, never a Date/epoch. */
  timestamp?: string;
  /** Renders a real `<Button>` retry affordance on the failed state. Omit for no retry affordance. */
  onRetry?: () => void;
  /** @defaultValue "Retry" */
  retryLabel?: string;
}

/** Background-job state chip. The root is `role="status"`/`aria-live="polite"` so a transition is announced. */
export function StatusChip({ className, status, summary, timestamp, onRetry, retryLabel = "Retry", size, ...rest }: StatusChipProps): ReactElement {
  const meta = STATUS_META[status];
  const glyph = STATUS_ICON[status];
  const slots = statusChipVariants({ size });

  return (
    <div {...rest} aria-live="polite" className={cn(slots.root(), className)} data-slot="status-chip-root" role="status">
      <Badge data-slot="status-chip-badge" intent={meta.intent} size={size}>
        {status === "running" ? (
          <Spinner label={meta.label} size="sm" />
        ) : (
          <>
            {glyph === undefined ? null : <Icon icon={glyph} size="xs" />}
            {meta.label}
          </>
        )}
      </Badge>
      {summary === undefined ? null : (
        <span className={slots.summary()} data-slot="status-chip-summary">
          {summary}
        </span>
      )}
      {timestamp === undefined ? null : (
        <span className={slots.timestamp()} data-slot="status-chip-timestamp">
          {timestamp}
        </span>
      )}
      {status === "failed" && onRetry !== undefined ? (
        <Button data-slot="status-chip-retry" intent="secondary" onClick={onRetry} size="sm" type="button">
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
