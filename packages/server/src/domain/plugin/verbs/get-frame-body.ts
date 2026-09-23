// verb: getFrameBody — the DOCUMENT BYTES of one owned `frame`-tier surface.
// The plugin-frame doorway (`entry/http/plugin-frame.ts`) calls this and nothing else does; the bytes never
// enter a projected wire shape (`listSurfaces` returns `PluginSurfaceView`, which extends the registration META
// and not the registration — the body deliberately lives on the latter).
//
// THREE GATES, and each answers a different question. They are separate because collapsing them would make one
// of the three answerable by the wrong authority:
//
//   1. OWNERSHIP — `getById(db, caller.userId, pluginId)` IS the gate, the D147 posture every per-row plugin
//      verb uses: a foreign pluginId reads absent, so a stranger holding a real id learns nothing a stranger
//      holding a fabricated one does not (`PluginNotFoundError`, leak-free, never an existence oracle).
//   2. CONSENT, RE-CHECKED PER CALL — the row must still carry the `ui.frame` grant. THIS IS THE SECOND BELT,
//      NOT THE PRIMARY CONTROL, and the difference is worth stating precisely rather than overselling.
//
//      The primary control is the membrane: `ui.registerFrame` requires `ui.frame` at REGISTRATION time, and on
//      today's tree a grant write can never outlive its resident — `setGrant` DEACTIVATES before the write and
//      re-activates only if the row was enabled (`verbs/set-grant.ts`, "THE RUNNING-INSTANCE INVARIANT"), so a
//      narrowed grant rebuilds the guest and the refused registration is simply never collected. Verified on
//      the tree, not assumed: an earlier draft of this comment claimed the resident outlives a re-grant, and
//      the verb's own int test refuted it.
//
//      It is kept anyway, for the reason `entry/http/card-frame.ts` re-applies the deployment media ceiling
//      that `resolveRenderPolicy` already folded in: this is the boundary that must still hold if the layer
//      above it is ever weakened. The invariant that makes the membrane sufficient is a COUPLING between two
//      verbs three tiers away — and the tear-down half of it is exactly the kind of thing a plausible
//      optimization removes ("a NARROWING re-grant needs no restart"). One array `includes` per mint buys a
//      serve path that does not depend on that coupling holding.
//   3. THE SURFACE ITSELF — it must be a live registration of THIS plugin, at the `frame` tier, carrying a body.
//
// Everything that is not "yes" is the SAME `null`: not enabled, no resident instance, no such surfaceId, a
// declarative surface named by a frame mint, a frame registration with no body. The doorway serves one identical
// miss for all of them, so nothing here is an oracle about what the caller's own plugins registered — and the
// caller owning the row is exactly why that costs nothing.

import type { PluginFrameBody } from "@orb/contracts/plugin";
import { PluginNotFoundError } from "../contract/errors.ts";
import type { GetFrameBodyParams } from "../contract/params.ts";
import type { PluginContext, PluginRegistry, PluginService } from "../contract/service.ts";
import { getById } from "../persistence/plugins.ts";

export function createGetFrameBody(ctx: PluginContext, registry: PluginRegistry): PluginService["getFrameBody"] {
  return async ({ caller, pluginId, surfaceId }: GetFrameBodyParams): Promise<PluginFrameBody | null> => {
    const row = await getById(ctx.db, caller.userId, pluginId);
    if (row === undefined) {
      throw new PluginNotFoundError(pluginId);
    }
    // Gate 2 (the second belt — see the header for why it is not the primary control). Read off the ROW: the
    // persisted confirmed subset IS the owner's last decision, where a resident's registration list is only
    // evidence of what its grant was at activation.
    if (!row.grantedCapabilities.includes("ui.frame")) {
      return null;
    }
    const resident = registry.get(pluginId);
    if (resident === undefined) {
      return null;
    }
    const surface = resident.instance.surfaces.find((candidate) => candidate.id === surfaceId && candidate.tier === "frame");
    return surface?.frame ?? null;
  };
}
