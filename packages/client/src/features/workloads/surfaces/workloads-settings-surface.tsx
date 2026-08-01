// The Workloads settings surface — the per-user face of the workloads engine. Suspends on
// workloads.list + sessions.me. workloads.list server-scopes a plain caller to its own rows; an
// owner/admin viewer gets the deployment-wide view, resolving each foreign row's owner handle through a
// gated admin.listUsers read that never fires for a plain user. Filters are client-side tabs over the
// one bounded list read; each active row tails workloads.subscribe.

import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Container, Row, Section, Stack } from "@orb/ui/layout";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import { Text } from "@orb/ui/text";
import { useSuspenseQueries } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { Fragment, useRef, useState } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, QueryErrorState, useGatedQuery, useInvalidation, useSettingsViewerView, useTRPC } from "#data";
import { testId, useFocusOnMount } from "#lib";
import { settingsAnchorId, useSettingsSections } from "#state";
import { RunWorkloadDialog } from "../components/run-workload-dialog";
import { SchedulesSection } from "../components/schedules-section";
import { WorkloadRow } from "../components/workload-row";
import { useCancelWorkload, useRetryWorkload } from "../hooks/use-workload-mutations";
import {
  groupWorkloadsByLane,
  isActiveWorkloadStatus,
  WORKLOAD_FILTER_EMPTY_COPY,
  WORKLOAD_FILTER_LABELS,
  WORKLOAD_FILTERS,
  WORKLOAD_LANE_LABELS,
  workloadFilterMatches,
} from "../lib/workloads-model";
import { WORKLOADS_SUBCATEGORY_IDS } from "../lib/workloads-nav";

type WorkloadItem = inferOutput<Trpc["workloads"]["list"]>[number];

type WorkloadFilter = (typeof WORKLOAD_FILTERS)[number];

function isWorkloadFilter(value: unknown): value is WorkloadFilter {
  return (WORKLOAD_FILTERS as readonly unknown[]).includes(value);
}

/** The Workloads panel body (rendered inside the settings modal's category column). */
export function WorkloadsSettingsSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none">
      <QueryBoundary
        fallback={<Text tone="muted">Loading workloads…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="your workloads" onRetry={retry} />}
      >
        <Container>
          <WorkloadsPaneBody />
        </Container>
      </QueryBoundary>
    </Stack>
  );
}

/** Suspends on the caller's workload list + the viewer, then renders the tabs + rows + run dialog + the
 *  contributed sections (the analysis-tuning section). */
function WorkloadsPaneBody(): ReactElement {
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

  // The contributed sections (§6c) — the analysis-tuning section, read off the ONE door-assembled section
  // registry (SET-SEAMS §5.2) and `when`-filtered, in declared registry order. Each owns its own
  // suspense/mutation, so they render below the built sections. Zero contributions ⇒ none.
  const contributedSections = useSettingsSections("workloads", useSettingsViewerView());

  const ownerHandleFor = (workload: WorkloadItem): string | null => {
    if (!isPrivileged || workload.ownerId === null || workload.ownerId === viewer.userId) {
      return null;
    }
    return handleByUserId.get(workload.ownerId as string) ?? null;
  };

  return (
    <Stack gap="section" data-testid={testId("workloadsSection")}>
      <Section divider={true} heading="Jobs" id={settingsAnchorId("workloads", WORKLOADS_SUBCATEGORY_IDS.jobs)}>
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
              <TabsList aria-label="Filter workloads">
                {WORKLOAD_FILTERS.map((id) => (
                  <TabsTab key={id} value={id}>
                    {WORKLOAD_FILTER_LABELS[id]}
                  </TabsTab>
                ))}
              </TabsList>
              <Button intent="primary" data-testid={testId("workloadsRunButton")} onClick={(): void => setRunOpen(true)}>
                Run a workload…
              </Button>
            </Row>
            {WORKLOAD_FILTERS.map((id) => {
              const rows = workloads.filter((workload) => workloadFilterMatches(id, workload.status));
              return (
                <TabsPanel key={id} value={id}>
                  {rows.length === 0 ? (
                    <EmptyState
                      title={WORKLOAD_FILTER_EMPTY_COPY[id]}
                      action={
                        <Button intent="secondary" onClick={(): void => setRunOpen(true)}>
                          Run a workload
                        </Button>
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
      </Section>

      <SchedulesSection viewerIsOwner={isOwner} viewerUserId={viewer.userId} users={isPrivileged ? users : []} />

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

      {contributedSections.map((section) => (
        <Fragment key={section.id}>{section.node}</Fragment>
      ))}
    </Stack>
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
