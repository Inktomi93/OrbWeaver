// verb: setEnabled — activate or deactivate an installed plugin. Authority = OWNERSHIP (D147): the
// owner-scoped row load IS the gate — a row belonging to anyone else is indistinguishable from a missing one
// (leak-free `PluginNotFoundError`), and there is deliberately NO admin any-row branch. Enabling is the act
// that RUNS the guest code, and it runs it as `caller` (`activate` builds the bridge over `caller.userId` and
// hands `caller` to the PL-C ceiling as the installer) — so a cross-owner enable would execute one user's
// untrusted bundle under another's identity, credential and rooms. The principal that owns the row is the
// only principal that may start it.
// Enable ⇒ (idempotent clean slate: deactivate any stale resident) → activate on the CAS
// bundle under the granted subset AND THE CONSENTED REACH (a standing re-consent's unanswered `netHosts` are
// withheld from the egress wall — "enabling grants nothing" has to cover reach, not just capability names, or
// this toggle settles a consent question by itself); a contained activation failure surfaces as
// `PluginCrashedError` after the row lands `errored`. Disable ⇒ dispose the instance + deregister its tools/transforms/subs →
// status `disabled`. Idempotent per target state.

import { PluginCrashedError, PluginNotFoundError } from "../contract/errors.ts";
import type { SetPluginEnabledParams } from "../contract/params.ts";
import type { ActivationDeps, PluginContext, PluginService } from "../contract/service.ts";
import { getById, setStatus } from "../persistence/plugins.ts";

export function createSetEnabled(ctx: PluginContext, deps: ActivationDeps): PluginService["setEnabled"] {
  return async ({ caller, pluginId, enabled }: SetPluginEnabledParams): Promise<void> => {
    const existing = await getById(ctx.db, caller.userId, pluginId);
    if (existing === undefined) {
      throw new PluginNotFoundError(pluginId);
    }

    if (enabled) {
      // Clean slate: tear down any stale resident so a re-enable never leaks a second instance.
      await deps.deactivate(pluginId);
      // THE STORED GRANT, AND THE CONSENTED REACH — the two halves of "enabling grants nothing". The
      // capability half needs no work (an unconfirmed capability was never written into the grant); the
      // `net.fetch` half does, because its reach is parameterized by the MANIFEST, which an upgrade can widen
      // while the grant stays byte-identical. The row's standing delta is exactly the set of destinations the
      // owner has never answered for, so it is withheld from the wall here — otherwise this toggle, which the
      // surface deliberately leaves live beside the re-consent notice, would arm `safeFetch` at a host nobody
      // confirmed and quietly settle the question the notice is still asking.
      const outcome = await deps.activate({
        caller,
        pluginId,
        bundleAssetId: existing.bundleAssetId,
        grants: existing.grantedCapabilities,
        withheldNetHosts: existing.widenedNetHosts,
      });
      if (!outcome.ok) {
        throw new PluginCrashedError(`plugin activation failed: ${outcome.error}`);
      }
      return;
    }

    await deps.deactivate(pluginId);
    await setStatus(ctx.db, pluginId, { status: "disabled", lastError: null, updatedAt: ctx.now() });
  };
}
