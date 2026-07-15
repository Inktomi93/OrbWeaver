// The Schedules section. Lists the caller's recurring schedules with an enable/disable Switch + Edit +
// Delete per row, and a "New schedule" button opening the create dialog. Reads workloads.listSchedules
// (server-scoped: a plain user sees only their own; owner/admin sees every owner's, so a foreign/bulk
// row is labelled). Only the box owner may create/retune a bulk schedule; the server re-gates regardless.

import type { WorkloadKind } from "@orb/contracts/workloads";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { testId, timeLib } from "#lib";
import { settingsAnchorId } from "#state";
import { useDeleteSchedule, useSetScheduleEnabled } from "../hooks/use-workload-mutations";
import { WORKLOAD_KIND_LABELS } from "../lib/workloads-model";
import { WORKLOADS_SUBCATEGORY_IDS } from "../lib/workloads-nav";
import { SCHEDULE_CADENCE_LABELS } from "../lib/workloads-schedule-model";
import { CreateScheduleDialog, EditScheduleDialog } from "./create-schedule-dialog";

type ScheduleItem = inferOutput<Trpc["workloads"]["listSchedules"]>[number];
type AdminUser = inferOutput<Trpc["admin"]["listUsers"]>[number];

export interface SchedulesSectionProps {
  /** The box owner gets the bulk create/edit affordances. */
  readonly viewerIsOwner: boolean;
  /** The viewer's own user id — a schedule with this owner is "mine" (no foreign handle shown). */
  readonly viewerUserId: string;
  /** The admin user table (owner∪admin only, else `[]`) — resolves a foreign row's owner handle. */
  readonly users: readonly AdminUser[];
}

export function SchedulesSection({
  viewerIsOwner,
  viewerUserId,
  users,
}: SchedulesSectionProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: schedules } = useSuspenseQuery(trpc.workloads.listSchedules.queryOptions({}));
  const setEnabled = useSetScheduleEnabled({ trpc, invalidation });
  const deleteSchedule = useDeleteSchedule({ trpc, invalidation });
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleItem | null>(null);

  const handleByUserId = new Map(users.map((user) => [user.id as string, user.handle as string]));
  const ownerHandleFor = (schedule: ScheduleItem): string | null => {
    if (schedule.ownerId === viewerUserId) {
      return null;
    }
    return handleByUserId.get(schedule.ownerId as string) ?? null;
  };

  return (
    <Section
      divider={true}
      heading="Schedules"
      id={settingsAnchorId("workloads", WORKLOADS_SUBCATEGORY_IDS.schedules)}
    >
      <Stack gap="block" data-testid={testId("workloadsSchedulesSection")}>
        <Row align="center" justify="between" gap="row">
          <Text tone="muted" size="label">
            Run a job automatically on a recurring cadence.
          </Text>
          <Button
            intent="primary"
            data-testid={testId("scheduleCreateButton")}
            onClick={(): void => setCreateOpen(true)}
          >
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

      <CreateScheduleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        viewerIsOwner={viewerIsOwner}
      />
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
  const nextRun = schedule.enabled
    ? `Next ${timeLib.formatRelative(schedule.nextRunAt)}`
    : "Paused";
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
          <Switch
            aria-label={`Enable ${kindLabel} schedule`}
            checked={schedule.enabled}
            onCheckedChange={onToggle}
          />
          <Button
            intent="secondary"
            size="sm"
            aria-label={`Edit ${kindLabel} schedule`}
            onClick={onEdit}
          >
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
