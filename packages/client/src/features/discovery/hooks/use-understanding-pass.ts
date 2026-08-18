// THE UNDERSTANDING PASS, as one live thing the Corpus surface can start and watch (issue #155).
//
// WHY DISCOVERY OWNS THIS AND NOT features/workloads. The pass is two `workloads` runs, but "read my library"
// is a DISCOVERY intent — the user is on Corpus, the panels that fill are Corpus panels, and Settings → Jobs
// is a generic runs console that happens to be where those rows also show up. Cross-feature server data has
// exactly one channel (client-architecture-lockdown §12 / D43(3): "the router IS the cross-feature contract"),
// so this reads and writes `trpc.workloads.*` directly and imports nothing from features/workloads.
//
// THE CHAIN IS THE ENGINE'S, NOT A CLIENT LOOP. `compute-themes` is enqueued with `dependsOn: [distillId]`,
// which the DAG scheduler (`persistence/nextRunnableWorkload`) holds until the distill row succeeds — so a
// closed tab, a reload, or a slow distill all behave, and a failed distill terminals the themes row as
// `dependency_failed` instead of computing themes over facets that were never written.
//
// DEDUPE IS A READ, NOT A LOCK. The engine already enforces one active run per (kind, owner) — a second
// enqueue is a CONFLICT, not a double run. But a button that fires a doomed mutation and toasts an error is a
// worse answer than a button that says what is already happening, so the live row is what the card renders.
// The scope is deliberately the CALLER'S rows plus the box-wide (`ownerId: null`) sweeps, because an
// owner/admin viewer's `workloads.list` is the DEPLOYMENT-WIDE view: without the filter, another user's
// distill run would disable this user's button.
//
// PROGRESS IS A MESSAGE, NOT A PERCENTAGE, and that is a property of these two kinds. Both report through
// `report({ message })` only (`domain/discovery/workload-contributions.ts` — "distilling character
// summaries", then the closing line naming what it skipped); neither ever reports `current`/`total`/`pct`.
// So the card shows the sentence with an indeterminate bar. The pct derivation (`toProgressView`) stays the
// Jobs pane's, which renders EVERY kind — duplicating it here would be a second home for a mapper this
// surface has no input for.

import type { StreamRoomRef } from "@orb/contracts/stream";
import type { WorkloadKind, WorkloadStatus } from "@orb/contracts/workloads";
import { ACTIVE_WORKLOAD_STATUSES } from "@orb/contracts/workloads";
import type { WorkloadId } from "@orb/kit/ids";
import { useQuery } from "@tanstack/react-query";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import { useState } from "react";
import type { Trpc } from "#data";
import { createEntityMutation, useBusRoom, useInvalidation, useTRPC } from "#data";

type StartWorkloadWire = inferInput<Trpc["workloads"]["start"]>;
type WorkloadRow = inferOutput<Trpc["workloads"]["list"]>[number];

/** The two runs that ARE the understanding pass, in the order the copy names them and the DAG runs them. */
const PASS_KINDS = ["distill-characters", "compute-themes"] as const satisfies readonly WorkloadKind[];
type PassKind = (typeof PASS_KINDS)[number];

/** What the card says while each stage holds the floor — present tense, because it is happening. Exhaustive
 *  over `PASS_KINDS`, so widening the pass is a tsc error here rather than a silent blank line. */
const STAGE_LABELS: Record<PassKind, string> = {
  "distill-characters": "Reading your cards",
  "compute-themes": "Finding your story themes",
};

/** Enqueue one run. The realistic refusal is the engine's single-active-per-kind lock (`CONFLICT`) — which
 *  the card's own dedupe read normally prevents reaching, so the toast is the race-loser's backstop. */
const useStartUnderstandingRun = createEntityMutation<StartWorkloadWire, { readonly id: WorkloadId }>({
  options: (trpc) => trpc.workloads.start.mutationOptions(),
  invalidates: (trpc) => [trpc.workloads.list.pathFilter()],
  errorToast: "Couldn't start the understanding pass — a run may already be going.",
});

function isActive(status: WorkloadStatus): boolean {
  return (ACTIVE_WORKLOAD_STATUSES as readonly WorkloadStatus[]).includes(status);
}

/** A row of THIS pass, narrowed to its kind so the stage lookup below needs no cast. */
type PassRow = WorkloadRow & { readonly kind: PassKind };

function isPassRow(row: WorkloadRow): row is PassRow {
  return (PASS_KINDS as readonly WorkloadKind[]).includes(row.kind);
}

/** The rows of THIS pass that this viewer's corpus is actually affected by (own rows + box-wide sweeps). */
function passRowsFor(rows: readonly WorkloadRow[], viewerId: WorkloadRow["ownerId"]): PassRow[] {
  return rows.filter(isPassRow).filter((row) => row.ownerId === viewerId || row.ownerId === null);
}

/**
 * The run the card speaks for: a `running` one wins, else the EARLIEST stage of the pass that is still
 * active.
 *
 * PASS ORDER, NOT LIST ORDER — measured on a live drive (2026-08-17): straight after the click both rows are
 * `queued`, `workloads.list` returns newest-first, and taking `active[0]` made the card announce "Finding
 * your story themes" while the themes row was doing nothing but waiting on its `dependsOn` gate. The stage
 * a user is told about has to be the one the engine will actually run next.
 */
function currentRun(rows: readonly PassRow[]): PassRow | null {
  const active = rows.filter((row) => isActive(row.status));
  const byPassOrder = active.toSorted((a, b) => PASS_KINDS.indexOf(a.kind) - PASS_KINDS.indexOf(b.kind));
  return byPassOrder.find((row) => row.status === "running") ?? byPassOrder[0] ?? null;
}

/** The most recent FAILED row of this pass, when nothing of it is running any more — the card's failure arm. */
function lastFailure(rows: readonly PassRow[]): PassRow | null {
  const failed = rows.filter((row) => row.status === "failed" || row.status === "worker_died").sort((a, b) => b.createdAt - a.createdAt);
  return failed[0] ?? null;
}

export interface UnderstandingPassView {
  /** A run of this pass is queued or running right now — the card is a progress state, not a door. */
  readonly running: boolean;
  /** The stage sentence (`Reading your cards`), or null when nothing is running. */
  readonly stage: string | null;
  /** The run's own latest progress line — live off the room, else the durable column. Null before either. */
  readonly detail: string | null;
  /** The last failure's reason, when the pass is not running. Null otherwise. */
  readonly failure: string | null;
  /** Enqueue distill, then themes gated on it. A no-op while a run is already live (the dedupe). */
  readonly start: () => void;
  /** The enqueue round-trip itself is in flight (distinct from the PASS running). */
  readonly starting: boolean;
  /** The active run to tail, for the room mount. Null when nothing is active. */
  readonly liveRunId: WorkloadId | null;
  /** Sink for the room's live progress messages. */
  readonly onLiveMessage: (message: string | null) => void;
}

/**
 * The Corpus understanding pass as one view: is it running, what is it doing, did it fail, and the door that
 * starts it. Suspends on nothing — the card renders its invitation immediately and the queue state arrives.
 */
export function useUnderstandingPass(): UnderstandingPassView {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const startRun = useStartUnderstandingRun({ trpc, invalidation });
  const [liveMessage, setLiveMessage] = useState<string | null>(null);

  // Both NON-suspending on purpose: this card is mounted inside the Archetypes CONTEXT tab, which owns no
  // suspense boundary, and the honest first paint is the invitation — the queue state arriving a tick later
  // can only take the door away, never put a wrong one up. `sessions.me` is the shell's own standing read
  // and `{}` is the SAME input the Jobs section passes, so both are cache hits wherever they are already up.
  const viewer = useQuery(trpc.sessions.me.queryOptions());
  const list = useQuery(trpc.workloads.list.queryOptions({}));

  // Before the viewer resolves, only a box-wide sweep can be attributed — never another user's own run.
  const rows = passRowsFor(list.data ?? [], viewer.data?.userId ?? null);
  const run = currentRun(rows);
  const failed = run === null ? lastFailure(rows) : null;

  const start = (): void => {
    if (run !== null || startRun.isPending) {
      return;
    }
    void (async (): Promise<void> => {
      const distill = await startRun.mutateAsync({ input: { kind: "distill-characters", params: {} }, mode: "singular" });
      // The engine gates this row on the distill row; a distill failure terminals it as `dependency_failed`
      // rather than computing themes over facets nobody wrote.
      await startRun.mutateAsync({
        input: { kind: "compute-themes", params: {} },
        mode: "singular",
        dependsOn: [distill.id],
      });
    })();
  };

  return {
    running: run !== null,
    stage: run === null ? null : STAGE_LABELS[run.kind],
    // The LIVE tail wins while it is connected; with no frame yet (a reload mid-pass) the row's DURABLE
    // `progress` column carries the position — the same precedence the Jobs row uses.
    detail: liveMessage ?? (typeof run?.progress?.message === "string" ? run.progress.message : null),
    failure: failed?.error ?? null,
    start,
    starting: startRun.isPending,
    liveRunId: run?.id ?? null,
    onLiveMessage: setLiveMessage,
  };
}

/** Tail ONE active pass run's room: progress messages to the card, every other lifecycle edge to a
 *  `workloads.list` refetch (the row's persisted state changed, so the card's phase did too). */
export function useUnderstandingPassTail(workloadId: WorkloadId | null, onMessage: (message: string | null) => void): void {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const room: Extract<StreamRoomRef, { channel: "workloads" }> | null = workloadId === null ? null : { channel: "workloads", workloadId };
  const refetchList = (): void => {
    invalidation.invalidateFilters([trpc.workloads.list.pathFilter()]);
  };
  useBusRoom<"workloads">(room, {
    onEvent: ({ event }) => {
      if (event.type === "progress") {
        onMessage(event.progress.message ?? null);
        return;
      }
      onMessage(null);
      refetchList();
    },
    onError: refetchList,
    onSocketLive: refetchList,
  });
}
