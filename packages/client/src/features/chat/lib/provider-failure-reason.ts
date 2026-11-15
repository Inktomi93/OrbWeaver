// Which words a viewer reads for a turn the provider refused. The connection is the host's: the host reads the
// server's own sentence, and a member reads only that the host's connection failed, never the host's account detail.

import { PROVIDER_FAILURE_REASON_PREFIX } from "@orb/contracts/chat";
import { HOST_CONNECTION_FAILED_COPY } from "./send-failure-copy.ts";

/**
 * The sentence `viewerIsHost` reads for a failure with `reason` (its `data.reason`) and the server's `message`,
 * or `null` when the provider was not the cause. A caller that cannot tell the viewer passes `false`, so the
 * host's detail is never shown on a guess.
 */
export function providerFailureReason(failure: { readonly reason: string; readonly message: string | null }, viewerIsHost: boolean): string | null {
  if (!failure.reason.startsWith(PROVIDER_FAILURE_REASON_PREFIX)) {
    return null;
  }
  return viewerIsHost ? failure.message : HOST_CONNECTION_FAILED_COPY;
}
