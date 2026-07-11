// The WORKLOADS settings surface (Settings → Workloads; the per-user face of the workloads engine).
// Renders inside the shell's settings modal for the `workloads` category — one registry-anchored
// section (Jobs, WORKLOADS_SUBCATEGORY_IDS) over the built `workloads.*` verbs. Suspends on
// `workloads.list` + `sessions.me` (QueryBoundary + useSuspenseQueries — the admin-settings-surface
// shape).
//
// AUTHORITY (per-user, NOT admin-gated): `workloads.list` server-scopes a plain caller to its OWN
// rows; an owner∪admin viewer gets the deployment-wide view — reflected here by resolving each foreign
// row's owner handle through `admin.listUsers` (a gated read that NEVER fires for a plain user —
// `useGatedQuery`/skipToken, so the adminProcedure is never even hit). The BULK affordances in the run
// dialog are OWNER-only UX honesty; the server (`requireOwner` on bulk start) is the floor.
//
// FILTERS are client-side tabs (All/Running/Recent/Failed) over the one bounded list read — each tab
// is a real TabsPanel (only the active one mounts). LIVE: each active row tails `workloads.subscribe`
// (workload-row.tsx) and drives the list's freshness through the central invalidation seam, so new
// progress/terminal states land without a manual refresh.

import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Container, Row, Section, Stack } from "@orb/ui/layout";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import { Text } from "@orb/ui/text";
import { useSuspenseQueries } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, useGatedQuery, useInvalidation, useTRPC } from "#data";
import { testId, useFocusOnMount } from "#lib";
import { RunWorkloadDialog } from "../components/run-workload-dialog";
import { WorkloadRow } from "../components/workload-row";
import { useCancelWorkload, useRetryWorkload } from "../hooks/use-workload-mutations";
import { WORKLOADS_SUBCATEGORY_IDS } from "../lib/settings-nav";
import { settingsAnchorId } from "../lib/settings-nav-model";
import {
  WORKLOAD_FILTER_EMPTY_COPY,
  WORKLOAD_FILTER_LABELS,
  WORKLOAD_FILTERS,
  workloadFilterMatches,
} from "../lib/workloads-model";

type WorkloadItem = inferOutput<Trpc["workloads"]["list"]>[number];

// The active-filter id — a LOCAL alias derived from the tuple (the settings-shell CategoryId pattern).
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
        renderError={(_error, retry): ReactElement => (
          <Text tone="muted">
            Couldn't load your workloads.{" "}
            <Button intent="ghost" onClick={retry}>
              Retry
            </Button>
          </Text>
        )}
      >
        <Container>
          <WorkloadsPaneBody />
        </Container>
      </QueryBoundary>
    </Stack>
  );
}

/** Suspends on the caller's workload list + the viewer, then renders the tabs + rows + run dialog. */
function WorkloadsPaneBody(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const [{ data: workloads }, { data: viewer }] = useSuspenseQueries({
    queries: [trpc.workloads.list.queryOptions({}), trpc.sessions.me.queryOptions()],
  });
  const isOwner = viewer.globalRole === "owner";
  const isPrivileged = isOwner || viewer.globalRole === "admin";

  // The cross-owner handle map (owner∪admin see every owner's rows) + the owner's bulk target list.
  // Gated: a plain user's pane NEVER fires the adminProcedure read (skipToken — no probe-and-catch).
  const usersQuery = useGatedQuery(isPrivileged ? "admin-users" : null, () =>
    trpc.admin.listUsers.queryOptions(),
  );
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
    <Stack gap="section" data-testid={testId("workloadsSection")}>
      <Section
        divider={true}
        heading="Jobs"
        id={settingsAnchorId("workloads", WORKLOADS_SUBCATEGORY_IDS.jobs)}
      >
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
              <Button
                intent="primary"
                data-testid={testId("workloadsRunButton")}
                onClick={(): void => setRunOpen(true)}
              >
                Run a workload…
              </Button>
            </Row>
            {WORKLOAD_FILTERS.map((id) => {
              const rows = workloads.filter((workload) =>
                workloadFilterMatches(id, workload.status),
              );
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
                    <Stack gap="row">
                      {rows.map((workload) => (
                        <WorkloadRow
                          key={workload.id}
                          workload={workload}
                          ownerHandle={ownerHandleFor(workload)}
                          onCancel={(): void => cancelWorkload.mutate({ id: workload.id })}
                          onRetry={(): void => retryWorkload.mutate({ id: workload.id })}
                        />
                      ))}
                    </Stack>
                  )}
                </TabsPanel>
              );
            })}
          </Stack>
        </Tabs>
      </Section>

      <RunWorkloadDialog
        open={runOpen}
        onOpenChange={setRunOpen}
        viewerIsOwner={isOwner}
        users={isOwner ? users : []}
      />
    </Stack>
  );
}
