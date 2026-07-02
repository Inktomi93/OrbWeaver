import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn } from "#lib";
import type { BadgeProps } from "#primitives/badge";
import { Badge } from "#primitives/badge";
import { Button } from "#primitives/button";
// biome-ignore lint/correctness/noUnresolvedImports: same #primitives/icons resolver gap as above — tsc + vite resolve LucideIcon fine.
import type { LucideIcon } from "#primitives/icons";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc + vite resolve AlertTriangle/Check/Icon fine (the spinner.tsx precedent).
import { AlertTriangle, Check, Icon } from "#primitives/icons";
import { Spinner } from "#primitives/spinner";
import { statusChipVariants } from "./variants";

// The status AXIS declared once as a tuple + derived (§7.5 no-inline-union-redecl) — mirrors
// log-viewer's LOG_LEVELS precedent. Not exported (component-export-only-modules): the type below
// is the public surface.
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

// Only failed/succeeded carry a glyph — failed's is the contract's MANDATORY non-color signal;
// idle/running already read fine from the label/spinner alone (no icon invented just to have one).
const STATUS_ICON: Partial<Record<StatusChipStatus, LucideIcon>> = {
  succeeded: Check,
  failed: AlertTriangle,
};

export interface StatusChipProps
  extends Omit<ComponentProps<"div">, "children">,
    VariantProps<typeof statusChipVariants> {
  status: StatusChipStatus;
  /** Optional detail text, e.g. "3 of 5 files". */
  summary?: string;
  /** Pre-formatted display string — ui takes a string, never a Date/epoch (no Intl/time logic in ui). */
  timestamp?: string;
  /** Renders a real `<Button>` retry affordance on the failed state. Omit for no retry affordance. */
  onRetry?: () => void;
  /** @default "Retry" */
  retryLabel?: string;
}

/**
 * StatusChip — a background-job state chip (idle/running/succeeded/failed): composes `<Badge>` +
 * `<Spinner>` (never a hand-rolled spinner/glyph — R3). The root is a `role="status"`
 * `aria-live="polite"` region so a status TRANSITION is announced to assistive tech; `failed`
 * additionally carries an icon (never color alone) and an optional real `<Button>` retry slot.
 *
 * Usage: `<StatusChip status="failed" summary="2 of 5 files" timestamp="2m ago" onRetry={retry} />`
 * Consumers: chat-crew member/guide chips, expressions generation progress, plugin status.
 */
export function StatusChip({
  className,
  status,
  summary,
  timestamp,
  onRetry,
  retryLabel = "Retry",
  size,
  ...rest
}: StatusChipProps): ReactElement {
  const meta = STATUS_META[status];
  const glyph = STATUS_ICON[status];
  const slots = statusChipVariants({ size });

  return (
    <div
      {...rest}
      aria-live="polite"
      className={cn(slots.root(), className)}
      data-slot="status-chip-root"
      role="status"
    >
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
        <Button
          data-slot="status-chip-retry"
          intent="secondary"
          onClick={onRetry}
          size="sm"
          type="button"
        >
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
