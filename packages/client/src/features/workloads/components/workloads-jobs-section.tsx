// The Jobs section (Settings → Workloads → Jobs) — the per-user face of the workloads engine. A
// settings-SECTION CONTRIBUTION at the `workloads` anchor since SET-SEAMS stage 3, owned by
// features/workloads (its own engine): it owns its own read and its own suspense boundary instead of
// riding the retired pane surface's one batch.
//
// Suspends on workloads.list + sessions.me. workloads.list server-scopes a plain caller to its own rows; an
// owner/admin viewer gets the deployment-wide view, resolving each foreign row's owner handle through a
// gated admin.listUsers read that never fires for a plain user. Filters are client-side tabs over the one
// bounded list read; each active row tails its own `workloads` ROOM on the tab's ONE socket (SSE-1 S5).

import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import { Text } from "@orb/ui/text";
import { useSuspenseQueries } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, QueryErrorState, SkeletonRows, useGatedQuery, useInvalidation, useTRPC } from "#data";
import { testId } from "#lib";
import { configAnchorId } from "#state";
import { useCancelWorkload, useRetryWorkload } from "../hooks/use-workload-mutations.ts";
import { WORKLOADS_JOBS_SUBCATEGORY } from "../lib/workloads-jobs-nav.ts";
import {
  groupWorkloadsByLane,
  isActiveWorkloadStatus,
  WORKLOAD_FILTER_EMPTY_COPY,
  WORKLOAD_FILTER_LABELS,
  WORKLOAD_FILTERS,
  WORKLOAD_LANE_LABELS,
  workloadFilterMatches,
} from "../lib/workloads-model.ts";
import { RunWorkloadDialog } from "./run-workload-dialog.tsx";
import { WorkloadRow } from "./workload-row.tsx";

type WorkloadItem = inferOutput<Trpc["workloads"]["list"]>[number];

type WorkloadFilter = (typeof WORKLOAD_FILTERS)[number];

function isWorkloadFilter(value: unknown): value is WorkloadFilter {
  return (WORKLOAD_FILTERS as readonly unknown[]).includes(value);
}

/** The Jobs section body — mounted at the workloads pane's sections anchor. */
export function WorkloadsJobsSection(): ReactElement {
  return (
    // RESERVED (#1098) — a config section that settles into the job table — the longest block in Workloads.
    <QueryBoundary
      fallback={<SkeletonRows count={4} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your jobs" onRetry={retry} />}
      reserveKey="config.workloads.jobs"
    >
      <WorkloadsJobsBody />
    </QueryBoundary>
  );
}

/** Suspends on the caller's workload list + the viewer, then renders the tabs + rows + run dialog. */
function WorkloadsJobsBody(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const [{ data: workloads }, { data: viewer }] = useSuspenseQueries({
    queries: [trpc.workloads.list.queryOptions({}), trpc.sessions.me.queryOptions()],
  });
  const isOwner = viewer.globalRole === "owner";
  const isPrivileged = isOwner || viewer.globalRole === "admin";

  const usersQuery = useGatedQuery(isPrivileged ? "admin-users" : null, () => trpc.admin.listUsers.queryOptions());
  const users = usersQuery.data ?? [];
  const handleByUserId = new Map(users.map((user) => [user.id as string, user.handle as string]));

  const cancelWorkload = useCancelWorkload({ trpc, invalidation });
  const retryWorkload = useRetryWorkload({ trpc, invalidation });

  const [filter, setFilter] = useState<WorkloadFilter>("all");
  const [runOpen, setRunOpen] = useState(false);

  const ownerHandleFor = (workload: WorkloadItem): string | null => {
    if (!isPrivileged || workload.ownerId === null || workload.ownerId === viewer.userId) {
      return null;
    }
    return handleByUserId.get(workload.ownerId as string) ?? null;
  };

  return (
    <Section className="@container" divider={true} heading={WORKLOADS_JOBS_SUBCATEGORY.label} id={configAnchorId("workloads", WORKLOADS_JOBS_SUBCATEGORY.id)}>
      <Stack gap="block" data-testid={testId("workloadsSection")}>
        <Tabs
          value={filter}
          onValueChange={(value): void => {
            if (isWorkloadFilter(value)) {
              setFilter(value);
            }
          }}
        >
          <Stack gap="block">
            <Row align="center" justify="between" gap="row">
              <TabsList aria-label="Filter jobs">
                {WORKLOAD_FILTERS.map((id) => (
                  <TabsTab key={id} value={id}>
                    {WORKLOAD_FILTER_LABELS[id]}
                  </TabsTab>
                ))}
              </TabsList>
              <Button intent="primary" data-testid={testId("workloadsRunButton")} onClick={(): void => setRunOpen(true)}>
                Run a job…
              </Button>
            </Row>
            {WORKLOAD_FILTERS.map((id) => {
              const rows = workloads.filter((workload) => workloadFilterMatches(id, workload.status));
              return (
                <TabsPanel key={id} value={id}>
                  {rows.length === 0 ? (
                    // The CTA is the ALL tab's only (SE-D): on a FILTERED tab "nothing failed" / "nothing is
                    // running" is a state to read, not a dead end — and the header's "Run a job…" is already
                    // on screen right above it, so a second home for the same verb is the two-CTA shape.
                    <EmptyState
                      title={WORKLOAD_FILTER_EMPTY_COPY[id]}
                      action={
                        id === "all" ? (
                          <Button intent="secondary" onClick={(): void => setRunOpen(true)}>
                            Run a job
                          </Button>
                        ) : undefined
                      }
                    />
                  ) : (
                    <LaneGroups
                      rows={rows}
                      ownerHandleFor={ownerHandleFor}
                      onCancel={(workloadId): void => cancelWorkload.mutate({ id: workloadId })}
                      onRetry={(workloadId): void => retryWorkload.mutate({ id: workloadId })}
                    />
                  )}
                </TabsPanel>
              );
            })}
          </Stack>
        </Tabs>

        <RunWorkloadDialog
          open={runOpen}
          onOpenChange={setRunOpen}
          viewerIsOwner={isOwner}
          users={isOwner ? users : []}
          dependencyCandidates={workloads
            .filter((workload) => isActiveWorkloadStatus(workload.status) && workload.ownerId === viewer.userId)
            .map((workload) => ({
              id: workload.id as string,
              kind: workload.kind,
              createdAt: workload.createdAt,
            }))}
        />
      </Stack>
    </Section>
  );
}

/** The rows of one filter tab, grouped by EXECUTION LANE (interactive vs sweep — derived from the contracts
 *  tuple, so a new lane needs no edit here). The lanes run independently, so the grouping is the honest
 *  reading of "what is actually running at once"; with rows in only one lane the heading is dropped. */
function LaneGroups({
  rows,
  ownerHandleFor,
  onCancel,
  onRetry,
}: {
  readonly rows: readonly WorkloadItem[];
  readonly ownerHandleFor: (workload: WorkloadItem) => string | null;
  readonly onCancel: (id: WorkloadItem["id"]) => void;
  readonly onRetry: (id: WorkloadItem["id"]) => void;
}): ReactElement {
  const groups = groupWorkloadsByLane(rows);
  const showHeadings = groups.length > 1;
  return (
    <Stack gap="block">
      {groups.map((group) => (
        <Stack key={group.lane} gap="row" data-slot="workload-lane-group">
          {showHeadings ? <Text voice="kicker">{WORKLOAD_LANE_LABELS[group.lane]}</Text> : null}
          {group.rows.map((workload) => (
            <WorkloadRow
              key={workload.id}
              workload={workload}
              ownerHandle={ownerHandleFor(workload)}
              onCancel={(): void => onCancel(workload.id)}
              onRetry={(): void => onRetry(workload.id)}
            />
          ))}
        </Stack>
      ))}
    </Stack>
  );
}
