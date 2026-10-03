// The confirm a library-wide paid model run passes through. It asks the server how many Utility-model calls the run
// would make; a run that would make none starts at once, any other waits for the person to read the count and say
// yes (`model-run-confirm-dialog.tsx` is what they read). An estimate that fails starts nothing; a run that fails
// rejects to its caller, whose mutation owns the message.

import { errorMessage } from "@orb/kit/error-message";
import { useQueryClient } from "@tanstack/react-query";
import type { inferInput } from "@trpc/tanstack-react-query";
import { useState } from "react";
import type { Trpc } from "#data";
import { useTRPC } from "#data";
import { notify } from "#lib";
import type { ModelRunConfirmDialogProps } from "./model-run-confirm-dialog.tsx";

type EstimateRequest = inferInput<Trpc["workloads"]["estimateModelCalls"]>;

const ESTIMATE_FAILED = "Couldn't count this run's model calls, so it didn't start.";
type PendingRun = NonNullable<ModelRunConfirmDialogProps["pending"]>;

export function useModelRunConfirm(): {
  /** Count the calls `estimates` would make together, then run, or hold the run for the confirm. */
  readonly confirmThen: (request: Omit<PendingRun, "calls"> & { readonly estimates: readonly EstimateRequest[] }) => Promise<void>;
  readonly dialog: ModelRunConfirmDialogProps;
} {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingRun | null>(null);
  const confirmThen = async ({ estimates, ...held }: Omit<PendingRun, "calls"> & { readonly estimates: readonly EstimateRequest[] }): Promise<void> => {
    // Fresh every time: the count is read the moment a person decides, never from an earlier visit's cache. With no
    // count there is no informed yes, so a failed estimate starts nothing and says why.
    const answers = await Promise.all(
      estimates.map((input) => queryClient.fetchQuery({ ...trpc.workloads.estimateModelCalls.queryOptions(input), staleTime: 0 })),
    ).catch((err: unknown) => {
      notify.error({ title: ESTIMATE_FAILED, description: errorMessage(err) });
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
