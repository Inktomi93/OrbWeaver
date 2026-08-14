// verb: setEnabled — activate or deactivate an installed plugin. Authority = install authority
// (owner ∪ admin). Enable ⇒ (idempotent clean slate: deactivate any stale resident) → activate on the CAS
// bundle under the granted subset; a contained activation failure surfaces as `PluginCrashedError` after the
// row lands `errored`. Disable ⇒ dispose the instance + deregister its tools/transforms/subs →
// status `disabled`. Idempotent per target state.

import { PluginCrashedError, PluginNotFoundError } from "../contract/errors.ts";
import type { SetPluginEnabledParams } from "../contract/params.ts";
import type { ActivationDeps, PluginContext, PluginService } from "../contract/service.ts";
import { getById, setStatus } from "../persistence/plugins.ts";

export function createSetEnabled(ctx: PluginContext, deps: ActivationDeps): PluginService["setEnabled"] {
  return async ({ caller, pluginId, enabled }: SetPluginEnabledParams): Promise<void> => {
    ctx.can(caller, "admin", { kind: "global" });

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
