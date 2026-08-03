// domain/plugin/activation/crash-policy — the auto-disable posture (03 §4), the ONE home for the consecutive-
// crash threshold (DOMAIN lifecycle policy — deliberately NOT in infra/plugin-host/budgets.ts; the sandbox
// never disables a plugin, the domain does, and the cake bans the domain from value-importing infra). A guest
// invocation crash (oom/deadline/throw — the invocation loop is P4b) increments `consecutive_crashes` and
// records the detail; at the threshold the plugin auto-disables (status `errored`) + is deactivated. A clean
// invocation resets the counter. The owner NOTIFICATION (03 §4 "owner is notified") is the closed
// `NotificationEvent` `plugin-disabled` member (`@orb/contracts/notifications`, ids-only, deep-links the owner's
// plugin surface), emitted here on auto-disable via the injected `ops.notifications.emit` (the one durable-first
// inbox path). `recordCrash`/`recordCleanRun` are driven by the resident-tool invoke closure (activation) — a
// handler throw bumps the counter, a clean run resets it.

import type { PluginId } from "@orb/kit/ids";
import type { CrashPolicy, PluginContext } from "../contract/service.ts";
import { incrementCrashes, resetCrashes, setLastError, setStatus } from "../persistence/plugins.ts";

/** Consecutive guest-invocation crashes before a resident plugin auto-disables (03 §4). A LEAN — the
 *  resolution criterion is measured abuse or measured legitimate flakiness, whichever arrives first. */
export const PLUGIN_CRASH_DISABLE_THRESHOLD = 3;

export function createCrashPolicy(ctx: PluginContext, deactivate: (pluginId: PluginId) => void): CrashPolicy {
  return {
    recordCrash: async ({ pluginId, recipientUserId, error }): Promise<{ readonly disabled: boolean; readonly count: number }> => {
      const count = await incrementCrashes(ctx.db, pluginId, ctx.now());
      if (count >= PLUGIN_CRASH_DISABLE_THRESHOLD) {
        await setStatus(ctx.db, pluginId, { status: "errored", lastError: error, updatedAt: ctx.now() });
        deactivate(pluginId);
        // 03 §4: "the owner is notified" — the closed `plugin-disabled` member (recipient = the installing
        // owner; a human, an agent has no inbox). Rides the SAME injected notifications emit an automation
        // action uses (one durable-first inbox path — never a re-rolled delivery).
        await ctx.ops.notifications.emit({ type: "plugin-disabled", recipientUserId, pluginId });
        return { disabled: true, count };
      }
      await setLastError(ctx.db, pluginId, error, ctx.now());
      return { disabled: false, count };
    },
    recordCleanRun: async (pluginId: PluginId): Promise<void> => {
      await resetCrashes(ctx.db, pluginId, ctx.now());
    },
  };
}
