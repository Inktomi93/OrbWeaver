// The confirm a library-wide paid model run passes through. It asks the server how many Utility-model calls the run
// would make; a run that would make none starts at once, any other waits for the person to read the count and say
// yes (`model-run-confirm-dialog.tsx` is what they read). An estimate that fails starts nothing; a run that fails
// rejects to its caller, whose mutation owns the message.

import { WORKLOAD_ASKER_NOT_OWNER, WORKLOAD_RUN_ACCOUNT_NOT_OWNER, WORKLOAD_RUN_ACCOUNT_REFUSAL } from "@orb/contracts/workloads";
import { errorMessage } from "@orb/kit/error-message";
import { useQueryClient } from "@tanstack/react-query";
import type { inferInput } from "@trpc/tanstack-react-query";
import { useState } from "react";
import type { Trpc } from "#data";
import { readFresh, useTRPC } from "#data";
import { notify, trpcErrorReason } from "#lib";
import { MODEL_RUN_ESTIMATE_FAILED } from "./model-run-confirm-copy.ts";
import type { ModelRunConfirmDialogProps } from "./model-run-confirm-dialog.tsx";

// A run is counted by the scope it would start under, or, for a retry, by the row it would clone: a retry re-runs
// that row's owner and params, which the caller's own start scope does not describe.
type EstimateRequest =
  | inferInput<Trpc["workloads"]["estimateModelCalls"]>
  | { readonly retryOf: inferInput<Trpc["workloads"]["estimateRetryModelCalls"]>["id"] };

type PendingRun = NonNullable<ModelRunConfirmDialogProps["pending"]>;

type ConfirmRequest = Omit<PendingRun, "calls"> & {
  readonly estimates: readonly EstimateRequest[];
  /** The notice title when the count fails, for a caller whose act is not a run starting. @defaultValue {@link MODEL_RUN_ESTIMATE_FAILED} */
  readonly estimateFailedTitle?: string;
  /** The notice when the server refuses the count because only the box owner may run it, for a caller whose act is not a run starting. A run
   *  starting keeps the server's own sentence. */
  readonly ownerOnlyNotice?: { readonly title: string; readonly description: string };
};

export function useModelRunConfirm(): {
  /** Count the calls `estimates` would make together, then run, or hold the run for the confirm. */
  readonly confirmThen: (request: ConfirmRequest) => Promise<void>;
  readonly dialog: ModelRunConfirmDialogProps;
} {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingRun | null>(null);
  const confirmThen = async ({ estimates, estimateFailedTitle = MODEL_RUN_ESTIMATE_FAILED, ownerOnlyNotice, ...held }: ConfirmRequest): Promise<void> => {
    // Fresh every time: the count is read the moment a person decides, never from an earlier visit's cache. With no
    // count there is no informed yes, so a failed estimate starts nothing and says why.
    const answers = await Promise.all(
      estimates.map((request) =>
        "retryOf" in request
          ? readFresh(queryClient, trpc.workloads.estimateRetryModelCalls.queryOptions({ id: request.retryOf }))
          : readFresh(queryClient, trpc.workloads.estimateModelCalls.queryOptions(request)),
      ),
    ).catch((err: unknown) => {
      // The estimate judges who the run answers to before it counts, so a refused account or a non-owner asker is the reason, not the count.
      if (trpcErrorReason(err) === WORKLOAD_RUN_ACCOUNT_NOT_OWNER) {
        notify.error({ title: WORKLOAD_RUN_ACCOUNT_REFUSAL });
      } else if (ownerOnlyNotice !== undefined && trpcErrorReason(err) === WORKLOAD_ASKER_NOT_OWNER) {
        notify.error(ownerOnlyNotice);
      } else {
        notify.error({ title: estimateFailedTitle, description: errorMessage(err) });
      }
      return null;
    });
    if (answers === null) {
      return;
    }
    const calls = answers.reduce((sum, answer) => sum + (answer.calls ?? 0), 0);
    if (calls === 0) {
      await held.run();
      return;
    }
    setPending({ ...held, calls });
  };
  return {
    confirmThen,
    dialog: {
      pending,
      onOpenChange: (open): void => {
        if (!open) {
          setPending(null);
        }
      },
    },
  };
}
