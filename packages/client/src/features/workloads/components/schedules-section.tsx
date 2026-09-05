// The Schedules section (Settings → Workloads → Schedules). Lists the caller's recurring schedules with an
// enable/disable Switch + Edit + Delete per row, and a "New schedule" button opening the create dialog.
//
// ONE ACTION, ONE HOME (side-eye, 2026-08-01). "New schedule" used to render TWICE at once — a header button
// and the empty state's CTA, 111px apart, both opening the same dialog. The empty state OWNS the action while
// there is nothing to list (it is the only thing on screen); the header button appears only once rows exist.
// The `scheduleCreateButton` testid rides whichever one is on screen, because exactly one ever is.
//
// AND IT IS SECONDARY, NOT ACCENT (CD3 — one focal element per surface). The workloads pane renders Jobs and
// Schedules on ONE scroll surface, so an accent fill here made two at rest. Jobs keeps the accent: "Run a
// workload…" is the pane's reason to exist, scheduling is the follow-on.
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
import { QueryBoundary, QueryErrorState, SkeletonRows, useGatedQuery, useInvalidation, useTRPC } from "#data";
import { testId, timeLib } from "#lib";
import { configAnchorId } from "#state";
import { useDeleteSchedule, useSetScheduleEnabled } from "../hooks/use-workload-mutations.ts";
import { WORKLOAD_KIND_LABELS } from "../lib/workloads-model.ts";
import { SCHEDULE_CADENCE_LABELS } from "../lib/workloads-schedule-model.ts";
import { WORKLOADS_SCHEDULES_SUBCATEGORY } from "../lib/workloads-schedules-nav.ts";
import { CreateScheduleDialog, EditScheduleDialog } from "./create-schedule-dialog.tsx";

type ScheduleItem = inferOutput<Trpc["workloads"]["listSchedules"]>[number];

/** The Schedules section body — mounted at the workloads pane's sections anchor. */
export function SchedulesSection(): ReactElement {
  return (
    // RESERVED (#1098) — a config section that settles into one row per schedule.
    <QueryBoundary
      fallback={<SkeletonRows count={3} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your schedules" onRetry={retry} />}
      reserveKey="config.workloads.schedules"
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
      id={configAnchorId("workloads", WORKLOADS_SCHEDULES_SUBCATEGORY.id)}
    >
      <Stack gap="block" data-testid={testId("workloadsSchedulesSection")}>
        <Row align="center" justify="between" gap="row">
          <Text voice="label" className="text-muted-foreground">
            Run a job automatically on a recurring cadence.
          </Text>
          {schedules.length === 0 ? null : (
            <Button intent="secondary" data-testid={testId("scheduleCreateButton")} onClick={(): void => setCreateOpen(true)}>
              New schedule…
            </Button>
          )}
        </Row>
        {schedules.length === 0 ? (
          <EmptyState
            title="No schedules yet. Recurring jobs you set up appear here."
            action={
              <Button intent="secondary" data-testid={testId("scheduleCreateButton")} onClick={(): void => setCreateOpen(true)}>
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
  // ONE CADENCE VOCABULARY (side-eye 2026-08-08 P3). `formatRelative` flips to an absolute date past its
  // horizon, so two adjacent rows read "Next in 6d" and "Next Sep 7, 2026" — the same field in two
  // languages, and the reader has to work out that they are the same kind of fact. The absolute stamp is the
  // arm that is TOTAL: a schedule's next run is a wall-clock appointment at any distance, where "in 8 months"
  // is not a thing anyone can act on.
  const nextRun = schedule.enabled ? `Next ${timeLib.formatDateTime(schedule.nextRunAt)}` : "Paused";
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
          {/* Qualified like its Switch/Edit siblings (WCAG 2.4.6 / 4.1.2, side-eye 2026-08-08 P1-3): a list
              of rows whose only DESTRUCTIVE control announces the bare name "Delete" gives a screen-reader
              user N identical buttons and no way to tell which row they are about to destroy. */}
          <Button intent="ghost" size="sm" aria-label={`Delete ${kindLabel} schedule`} onClick={onDelete}>
            Delete
          </Button>
        </Row>
      }
    />
  );
}
