// One workload row in Settings → Workloads. Anatomy: a ListRow head (kind label · relative created-time
// · owner handle for a foreign row · status badge + Cancel/Retry actions), then a detail line — a live
// progress bar for active rows, a per-kind result SENTENCE for succeeded (`workloads-result-copy`, never
// the raw JSON blob this row used to print), the persisted error reason for failure terminals.
//
// An active row mounts its live-tail ROOM via ActiveWorkloadRow; progress buffers in row-local
// state and every state-changing event invalidates workloads.list. Cancel is confirm-gated; Retry clones
// a fresh queued row (the original stays as audit).
//
// PROGRESS has two sources and the live one wins: the SSE tail while it is connected, else the row's DURABLE
// `progress` column (the reconnect truth — a tab opened 20 minutes into an import shows the real position
// immediately, instead of an indeterminate bar until the next report).
//
// A POISON row (its stored params no longer parse) renders as visibly broken rather than vanishing from the
// list — the read path's honesty fix needs a face, or the fix is invisible.

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
import { useWorkloadStream } from "../hooks/use-workload-stream.ts";
import { friendlyWorkloadError } from "../lib/workloads-failure-copy.ts";
import type { WorkloadProgressView } from "../lib/workloads-model.ts";
import {
  isActiveWorkloadStatus,
  isRetryableWorkloadStatus,
  toProgressView,
  WORKLOAD_KIND_LABELS,
  WORKLOAD_STATUS_INTENT,
  WORKLOAD_STATUS_LABELS,
} from "../lib/workloads-model.ts";
import { workloadResultSummary } from "../lib/workloads-result-copy.ts";
import { dependencyWaitLabel, isDeferredWorkload, isDependencyFailure, isWaitingOnDependencies } from "../lib/workloads-run-model.ts";

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
  const resultSummary = workload.status === "succeeded" ? workloadResultSummary(workload.kind, workload.result) : null;

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
            {/* NEUTRAL, not warning (side-eye 2026-08-06 P3): `bulk` is the run's CATEGORY, not its health,
                and the amber sat beside a green "Succeeded" telling two stories about one row. The queue-state
                badges below already speak this vocabulary — a category badge is neutral, and colour on this
                row is reserved for the status badge that owns it. */}
            {workload.mode === "bulk" ? <Badge intent="neutral">Bulk</Badge> : null}
            {workload.poison ? <Badge intent="danger">Unreadable</Badge> : null}
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
      <WorkloadProgressLine workload={workload} live={progress} processing={active && !deferred && !waiting} />
      <WorkloadWaitDetail workload={workload} deferred={deferred} waiting={waiting} />
      <WorkloadPoisonDetail workload={workload} />
      {resultSummary === null ? null : <Text voice="gloss">{resultSummary}</Text>}
      <WorkloadFailureDetail workload={workload} />

      <ConfirmDialog
        cancelLabel="Keep running"
        confirmLabel="Cancel job"
        description={`Stops the ${kindLabel} run. Progress so far may be kept where the pass is resumable; you can start it again any time.`}
        onConfirm={onCancel}
        onOpenChange={setConfirmCancel}
        open={confirmCancel}
        title="Cancel this job?"
      />
    </Stack>
  );
}

/** The progress bar of a row that is actually processing. The LIVE tail wins while it is connected; with no
 *  subscription (a reload, a tab opened mid-import) the row's DURABLE `progress` column carries the position;
 *  with neither, the bar is indeterminate. */
function WorkloadProgressLine({
  workload,
  live,
  processing,
}: {
  readonly workload: WorkloadItem;
  readonly live: WorkloadProgressView | null;
  readonly processing: boolean;
}): ReactElement | null {
  if (!processing) {
    return null;
  }
  const shown = live ?? (workload.progress === null ? null : toProgressView(workload.progress));
  return <Progress label={shown?.label ?? WORKLOAD_STATUS_LABELS[workload.status]} showValue={true} value={shown?.pct ?? null} />;
}

/** The unreadable-params line: a poison row explains itself in plain words + says what Retry will do. */
function WorkloadPoisonDetail({ workload }: { readonly workload: WorkloadItem }): ReactElement | null {
  if (!workload.poison) {
    return null;
  }
  return <Text voice="gloss">This run's saved settings can no longer be read by this version. Retry re-queues it with the same saved settings.</Text>;
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
      {deferred ? <Text voice="gloss">{`Scheduled for ${timeLib.formatRelative(workload.scheduledAt)}`}</Text> : null}
      {waiting ? <Text voice="gloss">{dependencyWaitLabel(workload.dependsOn?.length ?? 0)}</Text> : null}
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
      <Text voice="gloss" className="text-destructive">
        {friendlyError ?? rawError}
      </Text>
      {friendlyError === null ? null : (
        <Collapsible>
          <CollapsibleTrigger>
            <Text as="span" voice="gloss">
              Technical details
            </Text>
          </CollapsibleTrigger>
          <CollapsiblePanel>
            <Text voice="gloss">{rawError}</Text>
          </CollapsiblePanel>
        </Collapsible>
      )}
    </Stack>
  );
}
