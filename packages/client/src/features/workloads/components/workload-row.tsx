// One workload row in Settings → Workloads. Anatomy: a ListRow head (kind label · relative created-time
// · owner handle for a foreign row · status badge + Cancel/Retry actions), then a detail line — a live
// progress bar for active rows, a compact result preview for succeeded, the persisted error reason for
// failure terminals.
//
// An active row mounts the workloads.subscribe tail via ActiveWorkloadRow; progress buffers in row-local
// state and every state-changing event invalidates workloads.list. Cancel is confirm-gated; Retry clones
// a fresh queued row (the original stays as audit).

import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Progress } from "@orb/ui/progress";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog } from "#components";
import type { Trpc } from "#data";
import { useInvalidation } from "#data";
import { timeLib } from "#lib";
import { useWorkloadStream } from "../hooks/use-workload-stream";
import { friendlyWorkloadError } from "../lib/workloads-failure-copy";
import type { WorkloadProgressView } from "../lib/workloads-model";
import {
  isActiveWorkloadStatus,
  isRetryableWorkloadStatus,
  WORKLOAD_KIND_LABELS,
  WORKLOAD_STATUS_INTENT,
  WORKLOAD_STATUS_LABELS,
  workloadResultPreview,
} from "../lib/workloads-model";
import { dependencyWaitLabel, isDeferredWorkload, isDependencyFailure, isWaitingOnDependencies } from "../lib/workloads-run-model";

type WorkloadItem = inferOutput<Trpc["workloads"]["list"]>[number];

export interface WorkloadRowProps {
  readonly workload: WorkloadItem;
  /** The owning user's handle for a cross-owner view; `null` = the caller's own row (or unresolved). */
  readonly ownerHandle: string | null;
  readonly onCancel: () => void;
  readonly onRetry: () => void;
}

/** One workload row — active rows additionally tail the live SSE stream. */
export function WorkloadRow(props: WorkloadRowProps): ReactElement {
  return isActiveWorkloadStatus(props.workload.status) ? <ActiveWorkloadRow {...props} /> : <WorkloadRowBody {...props} progress={null} />;
}

/** The live wrapper: mounts the per-row subscription + the row-local progress buffer. */
function ActiveWorkloadRow(props: WorkloadRowProps): ReactElement {
  const invalidation = useInvalidation();
  const [progress, setProgress] = useState<WorkloadProgressView | null>(null);
  useWorkloadStream({
    workloadId: props.workload.id,
    invalidation,
    onProgress: setProgress,
  });
  return <WorkloadRowBody {...props} progress={progress} />;
}

function WorkloadRowBody({
  workload,
  ownerHandle,
  onCancel,
  onRetry,
  progress,
}: WorkloadRowProps & { readonly progress: WorkloadProgressView | null }): ReactElement {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const kindLabel = WORKLOAD_KIND_LABELS[workload.kind];
  const active = isActiveWorkloadStatus(workload.status);
  const deferred = isDeferredWorkload(workload);
  const waiting = isWaitingOnDependencies(workload);
  const depFailed = workload.status === "failed" && isDependencyFailure(workload.error);
  const statusLabel = depFailed ? "Dependency failed" : WORKLOAD_STATUS_LABELS[workload.status];
  const resultPreview = workload.status === "succeeded" ? workloadResultPreview(workload.result) : null;

  const subtitleParts = [timeLib.formatRelative(workload.createdAt)];
  if (ownerHandle !== null) {
    subtitleParts.push(`for ${ownerHandle}`);
  }

  return (
    <Stack gap="field" data-slot="workload-row">
      <ListRow
        title={kindLabel}
        subtitle={subtitleParts.join(" · ")}
        actions={
          <Row align="center" gap="row">
            {workload.mode === "bulk" ? <Badge intent="warning">Bulk</Badge> : null}
            <QueueStateBadges deferred={deferred} waiting={waiting} />
            <Row aria-live="polite" data-slot="workload-status">
              <Badge intent={depFailed ? "warning" : WORKLOAD_STATUS_INTENT[workload.status]}>{statusLabel}</Badge>
            </Row>
            {active ? (
              <Button type="button" intent="ghost" size="sm" aria-label={`Cancel — ${kindLabel}`} onClick={(): void => setConfirmCancel(true)}>
                Cancel
              </Button>
            ) : null}
            {isRetryableWorkloadStatus(workload.status) ? (
              <Button type="button" intent="secondary" size="sm" aria-label={`Retry — ${kindLabel}`} onClick={onRetry}>
                Retry
              </Button>
            ) : null}
          </Row>
        }
      />
      {active && !deferred && !waiting ? (
        <Progress label={progress?.label ?? WORKLOAD_STATUS_LABELS[workload.status]} showValue={true} value={progress?.pct ?? null} />
      ) : null}
      <WorkloadWaitDetail workload={workload} deferred={deferred} waiting={waiting} />
      {resultPreview === null ? null : (
        <Text size="micro" tone="muted">
          {resultPreview}
        </Text>
      )}
      <WorkloadFailureDetail workload={workload} />

      <ConfirmDialog
        cancelLabel="Keep running"
        confirmLabel="Cancel workload"
        description={`Stops the ${kindLabel} run. Progress so far may be kept where the pass is resumable; you can start it again any time.`}
        onConfirm={onCancel}
        onOpenChange={setConfirmCancel}
        open={confirmCancel}
        title="Cancel this workload?"
      />
    </Stack>
  );
}

/** The queue-state badges next to the status badge. */
function QueueStateBadges({ deferred, waiting }: { readonly deferred: boolean; readonly waiting: boolean }): ReactElement | null {
  if (!(deferred || waiting)) {
    return null;
  }
  return (
    <>
      {deferred ? <Badge intent="neutral">Scheduled</Badge> : null}
      {waiting ? <Badge intent="neutral">Waiting</Badge> : null}
    </>
  );
}

/** The wait-detail line under a deferred/dep-gated row. */
function WorkloadWaitDetail({
  workload,
  deferred,
  waiting,
}: {
  readonly workload: WorkloadItem;
  readonly deferred: boolean;
  readonly waiting: boolean;
}): ReactElement | null {
  if (!(deferred || waiting)) {
    return null;
  }
  return (
    <>
      {deferred ? (
        <Text size="micro" tone="muted">
          {`Scheduled for ${timeLib.formatRelative(workload.scheduledAt)}`}
        </Text>
      ) : null}
      {waiting ? (
        <Text size="micro" tone="muted">
          {dependencyWaitLabel(workload.dependsOn?.length ?? 0)}
        </Text>
      ) : null}
    </>
  );
}

/** The failure line for a failed/worker_died row: friendly copy when a class matches, with the raw exception one disclosure away. */
function WorkloadFailureDetail({ workload }: { readonly workload: WorkloadItem }): ReactElement | null {
  const rawError = (workload.status === "failed" || workload.status === "worker_died") && workload.error !== null ? workload.error : null;
  if (rawError === null) {
    return null;
  }
  const friendlyError = friendlyWorkloadError(rawError);
  return (
    <Stack gap="field">
      <Text size="micro" tone="destructive">
        {friendlyError ?? rawError}
      </Text>
      {friendlyError === null ? null : (
        <Collapsible>
          <CollapsibleTrigger>
            <Text as="span" size="micro" tone="muted">
              Technical details
            </Text>
          </CollapsibleTrigger>
          <CollapsiblePanel>
            <Text size="micro" tone="muted">
              {rawError}
            </Text>
          </CollapsiblePanel>
        </Collapsible>
      )}
    </Stack>
  );
}
