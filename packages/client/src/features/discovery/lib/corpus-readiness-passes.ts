// Each readiness row's own pass: what it needs before it can produce anything, and the runs its door enqueues.
// The runs are router-typed literals, so the door, its call estimate and the node proof send the same input.

import type { WorkloadKind } from "@orb/contracts/workloads";
import type { WorkloadId } from "@orb/kit/ids";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import type { CorpusReadinessStageId } from "./corpus-analysis-state.ts";

type StartWorkloadWire = inferInput<Trpc["workloads"]["start"]>;

/** One enqueue of a pass. The chain supplies `dependsOn`, so a pass never spells it. */
type ReadinessRun = Omit<StartWorkloadWire, "dependsOn">;

interface ReadinessPass {
  /** The row's prerequisite, stated whether or not it is met. */
  readonly needs: string;
  readonly runLabel: string;
  readonly confirmTitle: string;
  /** Enqueued in order; each run waits on the one before it through the engine's `dependsOn` gate. */
  readonly runs: readonly [ReadinessRun, ...ReadinessRun[]];
  /** The pass spends Utility-model calls, so it cannot start without a ready helper model. */
  readonly helperModel: boolean;
  /** The pass reads memory digests, which exist only while chat memory is on. */
  readonly chatMemory: boolean;
  /** A bulk run: the transport admits it for the box owner alone. */
  readonly boxOwner: boolean;
}

/** The door state a row is in, in gate order: a live run, then whoever may run it, then what it needs. */
const READINESS_ACTIONS = ["running", "box-owner-only", "turn-on-memory", "pick-helper-model", "settling", "run"] as const;
export type ReadinessAction = (typeof READINESS_ACTIONS)[number];

/** What the rail knows about the viewer when it picks a row's door. `unknown` is a read still settling. */
export interface ReadinessFacts {
  readonly helperModel: "ready" | "missing" | "unknown";
  readonly chatMemory: "on" | "off" | "unknown";
  readonly viewer: "box-owner" | "member" | "unknown";
  readonly running: ReadonlySet<CorpusReadinessStageId>;
}

export const READINESS_PASSES = {
  families: {
    needs: "Needs indexed portraits",
    runLabel: "Index portraits",
    confirmTitle: "Index your portraits?",
    // Portrait captions spend Utility calls when a helper model is ready; the vectors the families cluster do not.
    runs: [{ input: { kind: "index", params: { source: "image" } }, mode: "singular" }],
    helperModel: false,
    chatMemory: false,
    boxOwner: false,
  },
  distilled: {
    needs: "Needs a helper model",
    runLabel: "Distill cards",
    confirmTitle: "Distill your cards?",
    runs: [{ input: { kind: "distill-characters", params: {} }, mode: "singular" }],
    helperModel: true,
    chatMemory: false,
    boxOwner: false,
  },
  storyThemes: {
    needs: "Needs chat memory and a helper model",
    runLabel: "Find story themes",
    confirmTitle: "Find your story themes?",
    // Story themes cluster memory digests, so the backfill that writes them runs first.
    runs: [
      { input: { kind: "memory-backfill", params: {} }, mode: "singular" },
      { input: { kind: "compute-themes", params: {} }, mode: "singular" },
    ],
    helperModel: true,
    chatMemory: true,
    boxOwner: false,
  },
  keywords: {
    needs: "Needs chat memory",
    runLabel: "Tally keywords",
    confirmTitle: "Tally keywords?",
    runs: [{ input: { kind: "compute-cooccurrence", params: {} }, mode: "bulk" }],
    helperModel: false,
    chatMemory: true,
    boxOwner: true,
  },
  duplicates: {
    needs: "Needs indexed cards and chats",
    runLabel: "Find near-duplicates",
    confirmTitle: "Find near-duplicates?",
    runs: [{ input: { kind: "find-duplicates", params: {} }, mode: "singular" }],
    helperModel: false,
    chatMemory: false,
    boxOwner: false,
  },
} as const satisfies Record<CorpusReadinessStageId, ReadinessPass>;

/** The door a row offers, given what the rail knows about the viewer. */
export function readinessActionFor(stage: CorpusReadinessStageId, facts: ReadinessFacts): ReadinessAction {
  const pass: ReadinessPass = READINESS_PASSES[stage];
  if (facts.running.has(stage)) {
    return "running";
  }
  if (pass.boxOwner && facts.viewer === "member") {
    return "box-owner-only";
  }
  if (pass.chatMemory && facts.chatMemory === "off") {
    return "turn-on-memory";
  }
  if (pass.helperModel && facts.helperModel === "missing") {
    return "pick-helper-model";
  }
  const settling = (pass.boxOwner && facts.viewer === "unknown") || (pass.chatMemory && facts.chatMemory === "unknown");
  return settling ? "settling" : "run";
}

/** Whether a queue row is one of this pass's runs. An `index` run is per source, so a text sweep is not the portraits. */
// Typed by the two fields it reads, so a queue row from any compiler world fits; a poison row's params are null.
export function isReadinessRun(stage: CorpusReadinessStageId, row: { readonly kind: WorkloadKind; readonly params: object | null }): boolean {
  const runs: readonly ReadinessRun[] = READINESS_PASSES[stage].runs;
  return runs.some(
    (run) =>
      run.input.kind === row.kind &&
      (run.input.kind !== "index" || (row.params !== null && "source" in row.params && row.params.source === run.input.params["source"])),
  );
}

/** Enqueue a pass's runs through `start`, each gated on the one before it. */
export async function enqueueReadinessPass(
  stage: CorpusReadinessStageId,
  start: (run: StartWorkloadWire) => Promise<{ readonly id: WorkloadId }>,
): Promise<void> {
  const [first, ...rest]: readonly [ReadinessRun, ...ReadinessRun[]] = READINESS_PASSES[stage].runs;
  // The engine holds a later run until its dependency succeeds, so each enqueue waits for the id before it.
  await rest.reduce(
    async (previous, run) => (await start({ ...run, dependsOn: [await previous] })).id,
    start(first).then((ref) => ref.id),
  );
}

/** The call estimate for a pass: every run it would enqueue, counted before any row exists. */
export function readinessEstimates(stage: CorpusReadinessStageId): readonly Pick<ReadinessRun, "input" | "mode">[] {
  const runs: readonly ReadinessRun[] = READINESS_PASSES[stage].runs;
  return runs.map((run) => ({ input: run.input, mode: run.mode }));
}
