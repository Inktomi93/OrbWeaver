// The Schedules section (Settings → Workloads → Schedules). Lists the caller's recurring schedules with an
// enable/disable Switch + Edit + Delete per row, and a "New schedule" button opening the create dialog.
// Reads workloads.listSchedules (server-scoped: a plain user sees only their own; owner/admin sees every
// owner's, so a foreign/bulk row is labelled). Only the box owner may create/retune a bulk schedule; the
// server re-gates regardless.
//
// A settings-SECTION CONTRIBUTION at the `workloads` anchor since SET-SEAMS stage 3, owned by
// features/workloads: it owns its own read (viewer + schedules + the gated admin handle map, which the
// retired pane surface used to hand down as props) and its own suspense boundary.

import type { WorkloadKind } from "@orb/contracts/workloads";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useSuspenseQueries } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, QueryErrorState, useGatedQuery, useInvalidation, useTRPC } from "#data";
import { testId, timeLib } from "#lib";
import { settingsAnchorId } from "#state";
import { useDeleteSchedule, useSetScheduleEnabled } from "../hooks/use-workload-mutations";
import { WORKLOAD_KIND_LABELS } from "../lib/workloads-model";
import { SCHEDULE_CADENCE_LABELS } from "../lib/workloads-schedule-model";
import { WORKLOADS_SCHEDULES_SUBCATEGORY } from "../lib/workloads-schedules-nav";
import { CreateScheduleDialog, EditScheduleDialog } from "./create-schedule-dialog";

type ScheduleItem = inferOutput<Trpc["workloads"]["listSchedules"]>[number];

/** The Schedules section body — mounted at the workloads pane's sections anchor. */
export function SchedulesSection(): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading your schedules…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your schedules" onRetry={retry} />}
    >
      <SchedulesBody />
    </QueryBoundary>
  );
}

function SchedulesBody(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const [{ data: schedules }, { data: viewer }] = useSuspenseQueries({
    queries: [trpc.workloads.listSchedules.queryOptions({}), trpc.sessions.me.queryOptions()],
  });
  const viewerIsOwner = viewer.globalRole === "owner";
  const isPrivileged = viewerIsOwner || viewer.globalRole === "admin";
  // The admin user table resolves a FOREIGN row's owner handle (owner∪admin only — the adminProcedure read
  // never fires for a plain user, whose schedules are all their own).
  const usersQuery = useGatedQuery(isPrivileged ? "admin-users" : null, () => trpc.admin.listUsers.queryOptions());
  const users = usersQuery.data ?? [];
  const setEnabled = useSetScheduleEnabled({ trpc, invalidation });
  const deleteSchedule = useDeleteSchedule({ trpc, invalidation });
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleItem | null>(null);

  const handleByUserId = new Map(users.map((user) => [user.id as string, user.handle as string]));
  const ownerHandleFor = (schedule: ScheduleItem): string | null => {
    if (schedule.ownerId === viewer.userId) {
      return null;
    }
    return handleByUserId.get(schedule.ownerId as string) ?? null;
  };

  return (
    <Section
      className="@container"
      divider={true}
      heading={WORKLOADS_SCHEDULES_SUBCATEGORY.label}
      id={settingsAnchorId("workloads", WORKLOADS_SCHEDULES_SUBCATEGORY.id)}
    >
      <Stack gap="block" data-testid={testId("workloadsSchedulesSection")}>
        <Row align="center" justify="between" gap="row">
          <Text voice="label" className="text-muted-foreground">
            Run a job automatically on a recurring cadence.
          </Text>
          <Button intent="primary" data-testid={testId("scheduleCreateButton")} onClick={(): void => setCreateOpen(true)}>
            New schedule…
          </Button>
        </Row>
        {schedules.length === 0 ? (
          <EmptyState
            title="No schedules yet. Recurring jobs you set up appear here."
            action={
              <Button intent="secondary" onClick={(): void => setCreateOpen(true)}>
                New schedule
              </Button>
            }
          />
        ) : (
          <Stack gap="row">
            {schedules.map((schedule) => (
              <ScheduleRow
                key={schedule.id}
                schedule={schedule}
                ownerHandle={ownerHandleFor(schedule)}
                onToggle={(enabled): void => setEnabled.mutate({ id: schedule.id, enabled })}
                onEdit={(): void => setEditing(schedule)}
                onDelete={(): void => deleteSchedule.mutate({ id: schedule.id })}
              />
            ))}
          </Stack>
        )}
      </Stack>

      <CreateScheduleDialog open={createOpen} onOpenChange={setCreateOpen} viewerIsOwner={viewerIsOwner} />
      {editing === null ? null : (
        <EditScheduleDialog
          open={true}
          onOpenChange={(open): void => {
            if (!open) {
              setEditing(null);
            }
          }}
          viewerIsOwner={viewerIsOwner}
          schedule={editing}
        />
      )}
    </Section>
  );
}

/** One schedule row — kind label · cadence + next-run subtitle, a Bulk badge, an enable Switch + Edit + Delete. */
function ScheduleRow({
  schedule,
  ownerHandle,
  onToggle,
  onEdit,
  onDelete,
}: {
  readonly schedule: ScheduleItem;
  readonly ownerHandle: string | null;
  readonly onToggle: (enabled: boolean) => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}): ReactElement {
  const kindLabel = WORKLOAD_KIND_LABELS[schedule.kind as WorkloadKind];
  const cadence = SCHEDULE_CADENCE_LABELS[schedule.cadence];
  const nextRun = schedule.enabled ? `Next ${timeLib.formatRelative(schedule.nextRunAt)}` : "Paused";
  const subtitleParts = [`${cadence} · ${nextRun}`];
  if (ownerHandle !== null) {
    subtitleParts.push(`for ${ownerHandle}`);
  }
  return (
    <ListRow
      title={kindLabel}
      subtitle={subtitleParts.join(" · ")}
      actions={
        <Row align="center" gap="row">
          {schedule.mode === "bulk" ? <Badge intent="warning">Bulk</Badge> : null}
          <Switch aria-label={`Enable ${kindLabel} schedule`} checked={schedule.enabled} onCheckedChange={onToggle} />
          <Button intent="secondary" size="sm" aria-label={`Edit ${kindLabel} schedule`} onClick={onEdit}>
            Edit
          </Button>
          <Button intent="ghost" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </Row>
      }
    />
  );
}
