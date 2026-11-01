// The readiness rail's per-pass doors: which door each row offers, and the start that runs one pass on its own.
// One confirm serves every row, so a pass that calls the Utility model is counted and confirmed before it enqueues.

import type { WorkloadRef } from "@orb/contracts/workloads";
import { errorMessage } from "@orb/kit/error-message";
import { useQuery } from "@tanstack/react-query";
import type { inferInput } from "@trpc/tanstack-react-query";
import { useState } from "react";
import type { ModelRunConfirmDialogProps } from "#components";
import { useModelRunConfirm, useUtilityModel } from "#components";
import type { Trpc } from "#data";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import type { CorpusReadinessStageId } from "../lib/corpus-analysis-state.ts";
import { CORPUS_READINESS_STAGE_IDS } from "../lib/corpus-analysis-state.ts";
import type { ReadinessAction, ReadinessFacts } from "../lib/corpus-readiness-passes.ts";
import { enqueueReadinessPass, isReadinessRun, READINESS_PASSES, readinessActionFor, readinessEstimates } from "../lib/corpus-readiness-passes.ts";
import { affectsViewer, isActive } from "./use-understanding-pass.ts";

type StartWorkloadWire = inferInput<Trpc["workloads"]["start"]>;

const useStartReadinessRun = createEntityMutation<StartWorkloadWire, WorkloadRef>({
  options: (trpc) => trpc.workloads.start.mutationOptions(),
  invalidates: (trpc) => [trpc.workloads.list.pathFilter()],
  // The server's own sentence (an admission refusal, a run already going) is the reason.
  errorToast: (error) => `Couldn't start this pass: ${errorMessage(error)}`,
});

// A blocked Utility model is as unable to take the calls as an unset one.
function helperModelFact(kind: ReturnType<typeof useUtilityModel>["kind"]): ReadinessFacts["helperModel"] {
  if (kind === "ready" || kind === "unknown") {
    return kind;
  }
  return "missing";
}

function settled<T, F extends string>(data: T | undefined, fact: (data: T) => F): F | "unknown" {
  return data === undefined ? "unknown" : fact(data);
}

export interface ReadinessPassesView {
  readonly actionFor: (stage: CorpusReadinessStageId) => ReadinessAction;
  readonly start: (stage: CorpusReadinessStageId) => void;
  readonly starting: boolean;
  /** The row whose spend is being counted, until the count returns and the confirm opens or the run starts. */
  readonly counting: CorpusReadinessStageId | null;
  readonly confirm: ModelRunConfirmDialogProps;
}

/** Non-suspending: a row's door waits on its own reads rather than holding the rail. */
export function useReadinessPasses(): ReadinessPassesView {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const startRun = useStartReadinessRun({ trpc, invalidation });
  const paidRun = useModelRunConfirm();
  const [counting, setCounting] = useState<CorpusReadinessStageId | null>(null);
  const utility = useUtilityModel();
  const viewer = useQuery(trpc.sessions.me.queryOptions());
  const list = useQuery(trpc.workloads.list.queryOptions({}));
  const settings = useQuery(trpc.settings.getUserSettings.queryOptions());

  const viewerId = viewer.data?.userId ?? null;
  const activeRows = (list.data ?? []).filter((row) => isActive(row.status) && affectsViewer(row, viewerId));
  const facts: ReadinessFacts = {
    helperModel: helperModelFact(utility.kind),
    chatMemory: settled(settings.data, (data) => (data.config.memory.enabled ? "on" : "off")),
    viewer: settled(viewer.data, (data) => (data.globalRole === "owner" ? "box-owner" : "member")),
    running: new Set(CORPUS_READINESS_STAGE_IDS.filter((stage) => activeRows.some((row) => isReadinessRun(stage, row)))),
  };

  const start = (stage: CorpusReadinessStageId): void => {
    if (startRun.isPending || counting !== null || readinessActionFor(stage, facts) !== "run") {
      return;
    }
    const pass = READINESS_PASSES[stage];
    // A failed count is toasted inside confirmThen and a failed enqueue by the mutation's errorToast.
    setCounting(stage);
    paidRun
      .confirmThen({
        title: pass.confirmTitle,
        confirmLabel: pass.runLabel,
        estimates: readinessEstimates(stage),
        run: () => enqueueReadinessPass(stage, (run) => startRun.mutateAsync(run)),
      })
      .catch(() => undefined)
      .finally(() => setCounting(null));
  };

  return {
    actionFor: (stage) => readinessActionFor(stage, facts),
    start,
    starting: startRun.isPending,
    counting,
    confirm: paidRun.dialog,
  };
}
