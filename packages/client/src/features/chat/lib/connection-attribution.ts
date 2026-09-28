// The selected-swipe attribution formatter. The durable variant record decides missing versus deleted;
// the current viewer posture only decides whether an owner-authored connection label may be shown.

import type { MessageView } from "@orb/contracts/chat";
import { builtinProvider, providerDisplayLabel } from "@orb/contracts/inference";

const NOT_RECORDED = "Not recorded";

interface AttributionContext {
  readonly viewerIsHost: boolean | undefined;
  readonly connectionsSettled: boolean;
  readonly matchedConnectionLabel: string | undefined;
  readonly matchedProviderLabel: string | undefined;
}

function persistedProviderLabel(message: MessageView): string {
  if (message.provider === null) {
    return NOT_RECORDED;
  }
  const provider = builtinProvider(message.provider);
  return provider === undefined ? message.provider : providerDisplayLabel(provider);
}

/** Resolve the three visible attribution values without treating an owner-scoped lookup miss as deletion.
 *  `connectionsSettled` means the current host's list completed successfully; errors stay unresolved. */
export function connectionAttribution(
  message: MessageView,
  { viewerIsHost, connectionsSettled, matchedConnectionLabel, matchedProviderLabel }: AttributionContext,
): { readonly connection: string; readonly provider: string; readonly model: string } {
  let connection: string;
  if (message.connectionAttributionProvenance === "unrecorded") {
    connection = "Connection not recorded";
  } else if (message.connectionId === null) {
    connection = "Deleted connection";
  } else if (viewerIsHost === false) {
    connection = "Room connection";
  } else if (viewerIsHost === true && connectionsSettled) {
    connection = matchedConnectionLabel ?? "Room connection";
  } else {
    connection = "Recorded connection";
  }

  return {
    connection,
    provider: matchedProviderLabel ?? persistedProviderLabel(message),
    model: message.model ?? NOT_RECORDED,
  };
}
