// The Share card's two verbs. Each answers with the whole `ShareStatus`, which is authoritative for the card's
// `share.status` read, so it seeds that read instead of refetching it; the poll keeps it fresh afterwards.

import type { ShareStatus } from "@orb/contracts/identity";
import { createEntityMutation } from "#data";
import { shareStartFailure } from "../lib/share-model.ts";

/** Start the relay. A coded refusal is shown on the row it belongs to, so only an uncoded failure toasts. */
export const useStartSharing = createEntityMutation<void, ShareStatus>({
  options: (trpc) => trpc.share.start.mutationOptions(),
  echo: (trpc) => trpc.share.status.queryKey(),
  invalidates: () => [],
  errorToast: (error) => (shareStartFailure(error) === null ? "Couldn't start sharing." : null),
});

/** End the relay and cancel any restart it owed. */
export const useStopSharing = createEntityMutation<void, ShareStatus>({
  options: (trpc) => trpc.share.stop.mutationOptions(),
  echo: (trpc) => trpc.share.status.queryKey(),
  invalidates: () => [],
  errorToast: "Couldn't stop sharing.",
});
