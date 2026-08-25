// verb: setEnabled — activate or deactivate an installed plugin. Authority = OWNERSHIP (D147): the
// owner-scoped row load IS the gate — a row belonging to anyone else is indistinguishable from a missing one
// (leak-free `PluginNotFoundError`), and there is deliberately NO admin any-row branch. Enabling is the act
// that RUNS the guest code, and it runs it as `caller` (`activate` builds the bridge over `caller.userId` and
// hands `caller` to the PL-C ceiling as the installer) — so a cross-owner enable would execute one user's
// untrusted bundle under another's identity, credential and rooms. The principal that owns the row is the
// only principal that may start it.
// Enable ⇒ (idempotent clean slate: deactivate any stale resident) → activate on the CAS
// bundle under the granted subset; a contained activation failure surfaces as `PluginCrashedError` after the
// row lands `errored`. Disable ⇒ dispose the instance + deregister its tools/transforms/subs →
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
      deps.deactivate(pluginId);
      const outcome = await deps.activate({ caller, pluginId, bundleAssetId: existing.bundleAssetId, grants: existing.grantedCapabilities });
      if (!outcome.ok) {
        throw new PluginCrashedError(`plugin activation failed: ${outcome.error}`);
      }
      return;
    }

    deps.deactivate(pluginId);
    await setStatus(ctx.db, pluginId, { status: "disabled", lastError: null, updatedAt: ctx.now() });
  };
}
