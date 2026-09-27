// The Share card's verbs: the relay's start and stop, and the IP certificate's enable and disable. Each answers with the whole `ShareStatus`, which is authoritative for the card's
// `share.status` read, so it seeds that read instead of refetching it; the poll keeps it fresh afterwards.

import type { IpCertificateSetting, ShareStatus } from "@orb/contracts/identity";
import { createEntityMutation } from "#data";
import { ipCertificateRefusal, shareStartFailure } from "../lib/share-model.ts";

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

/** Store the IP certificate choice and start getting the certificate. A coded refusal shows in the card, so only an
 *  uncoded failure toasts. */
export const useEnableIpCertificate = createEntityMutation<IpCertificateSetting, ShareStatus>({
  options: (trpc) => trpc.share.enableIpCertificate.mutationOptions(),
  echo: (trpc) => trpc.share.status.queryKey(),
  invalidates: () => [],
  errorToast: (error) => (ipCertificateRefusal(error) === null ? "Couldn't turn on https." : null),
});

/** Turn the IP certificate off and delete it. */
export const useDisableIpCertificate = createEntityMutation<void, ShareStatus>({
  options: (trpc) => trpc.share.disableIpCertificate.mutationOptions(),
  echo: (trpc) => trpc.share.status.queryKey(),
  invalidates: () => [],
  errorToast: "Couldn't turn off https.",
});
