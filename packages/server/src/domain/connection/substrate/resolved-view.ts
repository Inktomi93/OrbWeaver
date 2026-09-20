// The credential-free projection of a resolved connection (`ResolvedConnectionView`, §7.6): what the pane,
// the params panel and the rpg lite gate may see. A substrate, not a verb, so every verb that answers a
// read-model question shares ONE projection and no verb imports another's value.

import type { ResolvedConnectionView } from "@orb/contracts/inference";
import type { Resolved } from "@orb/inference";

export function toResolvedView(resolved: Resolved): ResolvedConnectionView {
  return {
    task: resolved.task,
    connectionId: resolved.connectionId,
    providerId: resolved.providerId,
    wire: resolved.wire,
    api: resolved.api,
    model: resolved.model,
    capability: resolved.capability,
    requirement: resolved.requirement,
  };
}
