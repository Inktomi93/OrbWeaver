// THE UNDERSTANDING PASS, as one live thing the Corpus surface can start and watch (issue #155).
//
// WHY DISCOVERY OWNS THIS AND NOT features/workloads. The pass is two `workloads` runs, but "read my library"
// is a DISCOVERY intent — the user is on Corpus, the panels that fill are Corpus panels, and Settings → Jobs
// is a generic runs console that happens to be where those rows also show up. Cross-feature server data has
// exactly one channel (client-architecture-state-and-gates §12 / D43(3): "the router IS the cross-feature contract"),
// so this reads and writes `trpc.workloads.*` directly and imports nothing from features/workloads.
//
// THE CHAIN IS THE ENGINE'S, NOT A CLIENT LOOP. Each row is enqueued with `dependsOn: [previousId]`, which
// the DAG scheduler (`engine/nextRunnableWorkload`) holds until its dependency succeeds — so a closed
// tab, a reload, or a slow stage all behave, and a failed stage terminals its dependants as
// `dependency_failed` instead of running them over inputs that were never written.
//
// THE REAL DAG IS NOT distill → themes (issue #166, and the chain shipped in #155 got it wrong).
// `compute-themes` k-means clusters MEMORY DIGEST embeddings — `readOwnedDigestVectors`, not
// `character_summaries` — so distill is not its input at ALL; the two are independent reads of different
// planes. What themes actually depends on is `memory-backfill`, and on a corpus with no digests it used to
// run to a green "0 rows · 0 written" (and, worse, atomically WIPE any clusters a previous pass had written).
// The chain now enqueues distill → memory-backfill → themes, and the server refuses honestly if the digests
// are still absent when it gets there.
//
// MEMORY-DISABLED IS AN ADMISSION QUESTION, ANSWERED HERE ON THE CHAIN SIDE. With `memory.enabled` false a
// backfill would produce nothing, so the pass enqueues distill ALONE and the card states that story themes
// are excluded and why, with the door to turn memory on. It never enqueues a stage it knows cannot produce
// anything — the vacuous-success shape this whole issue is about. (Server-side admission gating for
// `memory-backfill` itself is #156's, in the chat domain; this is the chain's half only.)
//
// DEDUPE IS A READ, NOT A LOCK. The engine already enforces one active run per (kind, owner) — a second
// enqueue is a CONFLICT, not a double run. But a button that fires a doomed mutation and toasts an error is a
// worse answer than a button that says what is already happening, so the live row is what the card renders.
// The scope is deliberately the CALLER'S rows plus the box-wide (`ownerId: null`) sweeps, because an
// owner/admin viewer's `workloads.list` is the DEPLOYMENT-WIDE view: without the filter, another user's
// distill run would disable this user's button.
//
// PROGRESS CARRIES COUNTS WHERE THE PRODUCER KNOWS THEM (issue #166 rider 3). `WorkloadProgress` has always
// had `current`/`total` (`@orb/contracts/workloads` execution.ts) — no contract changed; what was missing was
// producers filling them, so a 313-card distill and a 350-image analysis both showed one sentence and an
// indeterminate bar for their whole runtime. The passes that enumerate their work now report each position
// (`domain/discovery/workload-contributions.ts`, `domain/embeddings/workload-contributions.ts`), and this
// hook surfaces the pair so the card can render a determinate bar. A stage that genuinely cannot count (a
// single atomic k-means) still reports a sentence and still gets the indeterminate bar — that is honest, not
// a gap. The pct derivation (`toProgressView`) stays the Jobs pane's, which renders EVERY kind.

import type { StreamRoomRef } from "@orb/contracts/stream";
import type { WorkloadKind, WorkloadProgress, WorkloadStatus } from "@orb/contracts/workloads";
import { ACTIVE_WORKLOAD_STATUSES } from "@orb/contracts/workloads";
import type { WorkloadId } from "@orb/kit/ids";
import { useQuery } from "@tanstack/react-query";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import { useState } from "react";
import type { Trpc } from "#data";
import { createEntityMutation, useBusRoom, useInvalidation, useTRPC } from "#data";

type StartWorkloadWire = inferInput<Trpc["workloads"]["start"]>;
type WorkloadRow = inferOutput<Trpc["workloads"]["list"]>[number];

/** The runs that ARE the understanding pass, in the order the copy names them and the DAG runs them. */
const PASS_KINDS = ["distill-characters", "memory-backfill", "compute-themes"] as const satisfies readonly WorkloadKind[];
type PassKind = (typeof PASS_KINDS)[number];

/** What the card says while each stage holds the floor — present tense, because it is happening. Exhaustive
 *  over `PASS_KINDS`, so widening the pass is a tsc error here rather than a silent blank line. */
const STAGE_LABELS: Record<PassKind, string> = {
  "distill-characters": "Reading your cards",
  "memory-backfill": "Reading your chat history",
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

/**
 * The most recent FAILED row of this pass that a LATER run OF ITS OWN KIND has not already superseded —
 * the card's failure arm.
 *
 * THE LATER-SUCCESS TEST IS THE WHOLE FUNCTION (side-eye populated arm 2026-08-23, P1-3). This took the
 * newest terminal row and stopped, so a crash was announced FOREVER: on the audited library
 * `distill-characters` died at `createdAt 1787436170285` and the same kind succeeded two hours later at
 * `1787443344202`, and the rail still read "The last pass stopped unexpectedly — run it again" under five
 * green checks, beside a primary button offering to re-run a 327-character distillation that had already
 * finished. That is a trust defect and a compute bill, and it is permanent on any library whose history
 * holds one reaped worker.
 *
 * PER KIND, NOT PER PASS. The three stages are independent runs with independent histories — a themes
 * crash is not healed by a later distill, so a global "newest success" would hide real failures. Each
 * kind's newest success is what buries that kind's older failures, and a kind that has never succeeded
 * buries nothing.
 */
function lastFailure(rows: readonly PassRow[]): PassRow | null {
  const newestSuccessByKind = new Map<PassKind, number>();
  for (const row of rows) {
    if (row.status === "succeeded") {
      newestSuccessByKind.set(row.kind, Math.max(newestSuccessByKind.get(row.kind) ?? row.createdAt, row.createdAt));
    }
  }
  const failed = rows
    .filter((row) => row.status === "failed" || row.status === "worker_died")
    .filter((row) => row.createdAt > (newestSuccessByKind.get(row.kind) ?? Number.NEGATIVE_INFINITY))
    .sort((a, b) => b.createdAt - a.createdAt);
  return failed[0] ?? null;
}

export interface UnderstandingPassView {
  /** A run of this pass is queued or running right now — the card is a progress state, not a door. */
  readonly running: boolean;
  /** The stage sentence (`Reading your cards`), or null when nothing is running. */
  readonly stage: string | null;
  /** The run's own latest progress line — live off the room, else the durable column. Null before either. */
  readonly detail: string | null;
  /** The stage's position when its producer counts (`0..1`), else null for an indeterminate bar. */
  readonly fraction: number | null;
  /** The last failure's reason, when the pass is not running. Null otherwise. */
  readonly failure: string | null;
  /** The last failure ENDED THE WORKER rather than failing cleanly — a different sentence, because a
   *  `worker_died` row is not "the job said no", it is "nobody came back" and the fix is to run it again.
   *  Invisible outside Settings → Jobs before issue #166. */
  readonly failureWasCrash: boolean;
  /** Memory is OFF, so this pass cannot produce story themes and does not pretend to enqueue them. */
  readonly memoryDisabled: boolean;
  /** Enqueue the chain (distill → backfill → themes, or distill alone when memory is off). A no-op while a
   *  run is already live (the dedupe). */
  readonly start: () => void;
  /** The enqueue round-trip itself is in flight (distinct from the PASS running). */
  readonly starting: boolean;
  /** The active run to tail, for the room mount. Null when nothing is active. */
  readonly liveRunId: WorkloadId | null;
  /** Sink for the room's live progress frames. */
  readonly onLiveProgress: (progress: WorkloadProgress | null) => void;
}

/** `current/total` as a bar fraction — null unless the producer reported a usable pair. Guarded on `total`
 *  because a producer that reports `current` alone (or a zero denominator) must degrade to indeterminate,
 *  never to `Infinity` or a bar stuck at 0. */
function fractionOf(progress: WorkloadProgress | null | undefined): number | null {
  const total = progress?.total;
  const current = progress?.current;
  if (typeof total !== "number" || typeof current !== "number" || total <= 0) {
    return null;
  }
  return Math.min(current / total, 1);
}

/**
 * The Corpus understanding pass as one view: is it running, what is it doing, did it fail, and the door that
 * starts it. Suspends on nothing — the card renders its invitation immediately and the queue state arrives.
 */
export function useUnderstandingPass(): UnderstandingPassView {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const startRun = useStartUnderstandingRun({ trpc, invalidation });
  const [liveProgress, setLiveProgress] = useState<WorkloadProgress | null>(null);

  // Both NON-suspending on purpose: this card is mounted inside the Archetypes CONTEXT tab, which owns no
  // suspense boundary, and the honest first paint is the invitation — the queue state arriving a tick later
  // can only take the door away, never put a wrong one up. `sessions.me` is the shell's own standing read
  // and `{}` is the SAME input the Jobs section passes, so both are cache hits wherever they are already up.
  const viewer = useQuery(trpc.sessions.me.queryOptions());
  const list = useQuery(trpc.workloads.list.queryOptions({}));
  // Memory's own switch decides whether the chain HAS a themes stage at all (see the header). Non-suspending
  // like the other two, and pessimistic before it resolves: the pass would rather understate what it will do
  // than enqueue a backfill the deployment has turned off.
  const settings = useQuery(trpc.settings.getUserSettings.queryOptions());
  const memoryDisabled = settings.data?.config.memory.enabled !== true;

  // Before the viewer resolves, only a box-wide sweep can be attributed — never another user's own run.
  const rows = passRowsFor(list.data ?? [], viewer.data?.userId ?? null);
  const run = currentRun(rows);
  const failed = run === null ? lastFailure(rows) : null;

  const start = (): void => {
    if (run !== null || startRun.isPending) {
      return;
    }
    // @orb-waive caught-failure-ownership(catch): useStartUnderstandingRun carries
    // errorToast: "Couldn't start the understanding pass — a run may already be going." — the toast is the
    // surface for every mutation in this chain. Ends if that mutation drops its errorToast.
    (async (): Promise<void> => {
      const distill = await startRun.mutateAsync({ input: { kind: "distill-characters", params: {} }, mode: "singular" });
      if (memoryDisabled) {
        // No digests can exist, so themes is not enqueued at all — a queued row that will refuse is worse
        // than a pass that says up front what it is not doing.
        return;
      }
      // Each row is gated on the one before it; a failure terminals its dependants as `dependency_failed`
      // rather than clustering digests nobody wrote.
      const backfill = await startRun.mutateAsync({ input: { kind: "memory-backfill", params: {} }, mode: "singular", dependsOn: [distill.id] });
      await startRun.mutateAsync({ input: { kind: "compute-themes", params: {} }, mode: "singular", dependsOn: [backfill.id] });
    })().catch(() => undefined); // Each mutation's errorToast owns the surfaced failure.
  };

  // The LIVE tail wins while it is connected; with no frame yet (a reload mid-pass) the row's DURABLE
  // `progress` column carries the position — the same precedence the Jobs row uses.
  const progress = liveProgress ?? run?.progress ?? null;
  return {
    running: run !== null,
    stage: run === null ? null : STAGE_LABELS[run.kind],
    detail: typeof progress?.message === "string" ? progress.message : null,
    fraction: fractionOf(progress),
    failure: failed?.error ?? null,
    failureWasCrash: failed?.status === "worker_died",
    memoryDisabled,
    start,
    starting: startRun.isPending,
    liveRunId: run?.id ?? null,
    onLiveProgress: setLiveProgress,
  };
}

/** Tail ONE active pass run's room: progress messages to the card, every other lifecycle edge to a
 *  `workloads.list` refetch (the row's persisted state changed, so the card's phase did too). */
export function useUnderstandingPassTail(workloadId: WorkloadId | null, onProgress: (progress: WorkloadProgress | null) => void): void {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const room: Extract<StreamRoomRef, { channel: "workloads" }> | null = workloadId === null ? null : { channel: "workloads", workloadId };
  const refetchList = (): void => {
    invalidation.invalidateFilters([trpc.workloads.list.pathFilter()]);
  };
  useBusRoom<"workloads">(room, {
    onEvent: ({ event }) => {
      if (event.type === "progress") {
        // The WHOLE frame, not just its sentence — the counts are the point of rider 3.
        onProgress(event.progress);
        return;
      }
      onProgress(null);
      refetchList();
    },
    onError: refetchList,
    onSocketLive: refetchList,
  });
}
