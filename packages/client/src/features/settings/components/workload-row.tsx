// One workload row in Settings → Workloads (a COMPONENT so its destructive-cancel <AlertDialog> is
// legal — client-structure rule 7; the admin-user-row precedent). Anatomy: a ListRow head (kind label ·
// relative created-time · owner handle for a foreign row in the owner∪admin cross-owner view · status
// badge + Cancel/Retry actions), then the detail line — a live progress bar (determinate off the pct,
// indeterminate otherwise) for ACTIVE rows, a compact result preview for succeeded, the persisted error
// reason for failure terminals.
//
// LIVE: an active row (queued/running/cancelling — the contract's slot-holding statuses) mounts the
// `workloads.subscribe` tail via `ActiveWorkloadRow`; progress buffers in ROW-LOCAL state and every
// state-changing event invalidates `workloads.list` through the central seam (use-workload-stream.ts).
// A terminal event refetches the list → the row re-renders non-active → the subscription unmounts.
//
// Cancel mirrors the verb honestly: offered only on active rows, confirm-gated (an AlertDialog — a
// running pass stops mid-flight). Retry is offered on the failure-ish terminals; the verb clones a
// fresh queued row (the original stays as audit).

import {
  AlertDialog,
  AlertDialogActions,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@orb/ui/alert-dialog";
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
import type { Trpc } from "#data";
import { useInvalidation } from "#data";
import { timeLib } from "#lib";
import { useWorkloadStream } from "../hooks/use-workload-stream";
import type { WorkloadProgressView } from "../lib/workloads-model";
import {
  friendlyWorkloadError,
  isActiveWorkloadStatus,
  isRetryableWorkloadStatus,
  WORKLOAD_KIND_LABELS,
  WORKLOAD_STATUS_INTENT,
  WORKLOAD_STATUS_LABELS,
  workloadResultPreview,
} from "../lib/workloads-model";

type WorkloadItem = inferOutput<Trpc["workloads"]["list"]>[number];

export interface WorkloadRowProps {
  readonly workload: WorkloadItem;
  /** The owning user's handle when the viewer sees ACROSS owners (owner∪admin) and the map has
   *  resolved; `null` = the caller's own row (or the handle read hasn't landed — omit quietly). */
  readonly ownerHandle: string | null;
  readonly onCancel: () => void;
  readonly onRetry: () => void;
}

/** One workload row — active rows additionally tail the live SSE stream. */
export function WorkloadRow(props: WorkloadRowProps): ReactElement {
  return isActiveWorkloadStatus(props.workload.status) ? (
    <ActiveWorkloadRow {...props} />
  ) : (
    <WorkloadRowBody {...props} progress={null} />
  );
}

/** The live wrapper: mounts the per-row subscription + the row-local progress buffer (§11.1 — the
 *  transient progress never touches the query cache). */
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
  const resultPreview =
    workload.status === "succeeded" ? workloadResultPreview(workload.result) : null;

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
            {/* aria-live so a screen-reader user hears a Running→Failed/Succeeded flip without
                re-navigating to the row (the badge text IS the announced status). */}
            <Row aria-live="polite" data-slot="workload-status">
              <Badge intent={WORKLOAD_STATUS_INTENT[workload.status]}>
                {WORKLOAD_STATUS_LABELS[workload.status]}
              </Badge>
            </Row>
            {active ? (
              <Button
                type="button"
                intent="ghost"
                size="sm"
                aria-label={`Cancel — ${kindLabel}`}
                onClick={(): void => setConfirmCancel(true)}
              >
                Cancel
              </Button>
            ) : null}
            {isRetryableWorkloadStatus(workload.status) ? (
              <Button
                type="button"
                intent="secondary"
                size="sm"
                aria-label={`Retry — ${kindLabel}`}
                onClick={onRetry}
              >
                Retry
              </Button>
            ) : null}
          </Row>
        }
      />
      {active ? (
        <Progress
          label={progress?.label ?? WORKLOAD_STATUS_LABELS[workload.status]}
          showValue={true}
          value={progress?.pct ?? null}
        />
      ) : null}
      {resultPreview === null ? null : (
        <Text size="micro" tone="muted">
          {resultPreview}
        </Text>
      )}
      <WorkloadFailureDetail workload={workload} />

      <AlertDialog onOpenChange={setConfirmCancel} open={confirmCancel}>
        <AlertDialogPopup>
          <Stack gap="block">
            <AlertDialogTitle>Cancel this workload?</AlertDialogTitle>
            <AlertDialogDescription>
              {`Stops the ${kindLabel} run. Progress so far may be kept where the pass is resumable; you can start it again any time.`}
            </AlertDialogDescription>
            <AlertDialogActions>
              <AlertDialogClose render={<Button intent="ghost">Keep running</Button>} />
              <AlertDialogClose
                render={
                  <Button intent="destructive" onClick={onCancel}>
                    Cancel workload
                  </Button>
                }
              />
            </AlertDialogActions>
          </Stack>
        </AlertDialogPopup>
      </AlertDialog>
    </Stack>
  );
}

/** The failure line for a failed/worker_died row: the friendly (user-actionable) copy when a class
 *  matches — with the raw exception one disclosure away for support — else the raw string verbatim. */
function WorkloadFailureDetail({
  workload,
}: {
  readonly workload: WorkloadItem;
}): ReactElement | null {
  const rawError =
    (workload.status === "failed" || workload.status === "worker_died") && workload.error !== null
      ? workload.error
      : null;
  if (rawError === null) {
    return null;
  }
  const friendlyError = friendlyWorkloadError(rawError);
  return (
    <Stack gap="field">
      <Text size="micro" tone="destructive">
        {friendlyError ?? rawError}
      </Text>
      {/* The friendly line replaced the raw exception — keep the original one disclosure away for
          support (a real <button> with aria-expanded via the Collapsible seal). */}
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
