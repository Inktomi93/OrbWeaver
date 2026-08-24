// verb: setGrant — the RE-CONSENT act. Authority = install authority (owner ∪ admin). Flow: gate → load the
// owned row (leak-free NotFound) → the grant ⊆ DECLARED check against the PERSISTED manifest → the
// `net.fetch` host acknowledgement → write the grant → restore the instance to agree with it.
//
// WHY THIS VERB EXISTS (the loop that could not close). `upgrade` computes the new grant as
// `normalizeGrant(newManifest.capabilities, priorGrant)` — an INTERSECTION — so a newly-declared capability is
// written NOT granted, and the row lands `disabled` "pending re-grant". But `setEnabled` activates with
// `existing.grantedCapabilities` and takes nothing else: it never recomputes a grant. So the re-confirmation
// `upgrade`'s own header promised was unperformable, and the only path to allowing a newly-declared capability
// was uninstall + reinstall — which also drops the plugin's `storage.kv` rows. It FAILED CLOSED (the
// un-consented capability was simply never granted), so this was a dead end plus a comment overstating a
// security mechanism, never a hole. Both halves are closed here: the mechanism, and the comments.
//
// THE TWO INVERSIONS THIS VERB MUST NOT BECOME, stated because each is the obvious "simplification":
//   1. ENABLE MUST NOT IMPLY RE-GRANT. Recomputing the grant inside `setEnabled` would close the loop with one
//      fewer verb and would be a consent bug: turning a plugin back on would silently widen its authority to
//      whatever the current manifest asks for. `setEnabled` still reads the STORED grant, untouched.
//   2. RE-GRANT MUST NOT IMPLY ENABLE. A disabled plugin stays disabled here. The owner's decisions stay two
//      separate acts — "you may have these powers" and "run" — because they answer different questions.
//
// THE RUNNING-INSTANCE INVARIANT: a resident guest's grants are fixed at activation (`createInstance({grants})`
// → the membrane's `requireCapability` set), so a grant write while an instance is resident would leave the
// running plugin enforcing the OLD subset — a NARROWING would not take effect until the next restart, which is
// a consent bug wearing a race's clothes. So the resident is always torn down, and re-activated on the new
// grant only if the row was `enabled` (the `upgrade` posture, verbatim).

import { CapabilityNotGrantedError, PluginNetHostsUnacknowledgedError, PluginNotFoundError } from "../contract/errors.ts";
import type { SetPluginGrantParams } from "../contract/params.ts";
import type { ActivationDeps, PluginContext, PluginService } from "../contract/service.ts";
import { applyGrant, getById, toPluginView } from "../persistence/plugins.ts";
import { normalizeGrant, ungrantableCapabilities, widenedNetHosts } from "../substrate/grants.ts";

export function createSetGrant(ctx: PluginContext, deps: ActivationDeps): PluginService["setGrant"] {
  return async ({ caller, pluginId, grant, acknowledgedNetHosts }: SetPluginGrantParams) => {
    ctx.can(caller, "admin", { kind: "global" });

    const existing = await getById(ctx.db, caller.userId, pluginId);
    if (existing === undefined) {
      throw new PluginNotFoundError(pluginId);
    }

    // The ceiling is the PERSISTED manifest's declared set — the same invariant install and upgrade hold, read
    // from the row rather than from a bundle, because a re-grant re-consents to what is INSTALLED.
    const declared = existing.manifest.capabilities;
    const ungrantable = ungrantableCapabilities(declared, grant);
    if (ungrantable.length > 0) {
      throw new CapabilityNotGrantedError(ungrantable);
    }

    // THE EGRESS ACKNOWLEDGEMENT. Every other capability is consented to BY NAME, so a manifest that moved
    // under the rendered screen cannot make the owner grant something they did not type. `net.fetch` is the
    // exception — its reach is `netHosts`, which the owner never names — so the caller echoes the host list it
    // displayed and any manifest host missing from that echo refuses. `widenedNetHosts` is the SAME fold the
    // upgrade re-consent trigger uses (case-insensitive, trailing-dot-literal), so the two can never disagree
    // about what counts as a new destination.
    if (grant.includes("net.fetch")) {
      const unacknowledged = widenedNetHosts(existing.manifest.netHosts ?? [], acknowledgedNetHosts);
      if (unacknowledged.length > 0) {
        throw new PluginNetHostsUnacknowledgedError(unacknowledged);
      }
    }

    const granted = normalizeGrant(declared, grant);
    const wasEnabled = existing.status === "enabled";
    // CLEAR the system's recorded refusal iff the owner has now consented to the WHOLE ask. A PARTIAL re-grant
    // leaves it standing, and that is the point: the plugin is still asking for something they have not
    // allowed, and a surface that stopped saying so would be the same lie the flag exists to fix, pointing the
    // other way. The `net.fetch` half is already satisfied by the acknowledgement gate above — reaching this
    // line with `net.fetch` granted means every declared host was echoed.
    const stillPending = ungrantableCapabilities(granted, declared).length > 0;

    // Tear the resident down BEFORE the write (idempotent on a non-resident) — see the header: a running guest
    // holds the grants it was activated with, so the write must never leave one enforcing a superseded subset.
    deps.deactivate(pluginId);
    await applyGrant(ctx.db, pluginId, { grantedCapabilities: granted, status: "disabled", pendingReconsent: stillPending, updatedAt: ctx.now() });
    if (wasEnabled) {
      // Re-activation is a RESTORE of the state the owner already chose, not an implicit enable: only a row
      // that was `enabled` comes back up, and it comes back up under the grant just written. A contained
      // activation failure lands `errored` + `last_error` on the row (activate's own posture) and surfaces in
      // the returned view — the grant write stands either way, which is the honest outcome: consent was given.
      await deps.activate({ caller, pluginId, bundleAssetId: existing.bundleAssetId, grants: granted });
    }

    const row = await getById(ctx.db, caller.userId, pluginId);
    if (row === undefined) {
      throw new PluginNotFoundError(pluginId);
    }
    return toPluginView(row);
  };
}
