// domain/plugin/activation/crash-policy — the auto-disable posture, the ONE home for the consecutive-
// crash threshold (DOMAIN lifecycle policy — deliberately NOT in infra/plugin-host/budgets.ts; the sandbox
// never disables a plugin, the domain does, and the cake bans the domain from value-importing infra). A guest
// invocation crash (oom/deadline/throw) increments `consecutive_crashes` and
// records the detail; at the threshold the plugin auto-disables (status `errored`) + is deactivated. A clean
// invocation resets the counter. The owner NOTIFICATION ("owner is notified") is the closed
// `NotificationEvent` `plugin-disabled` member (`@orb/contracts/notifications`, ids-only, deep-links the owner's
// plugin surface), emitted here on auto-disable via the injected `ops.notifications.emit` (the one durable-first
// inbox path). `recordCrash`/`recordCleanRun` are driven by the resident-tool invoke closure (activation) — a
// handler throw bumps the counter, a clean run resets it.
//
// THE AUTO-DISABLE IS A CROSSING, NOT A STATE. Guest invocations may finish concurrently, but their crash
// records share the plugin lifecycle lane with enable/upgrade/uninstall. The durable inbox write still rides
// the was-below/now-at TRANSITION (`previous`, which the atomic increment hands back), while the status write
// and teardown stay unconditional because they are idempotent.

import type { PluginId } from "@orb/kit/ids";
import type { PluginLifecycleLanes } from "../contract/ops.ts";
import type { CrashPolicy, PluginContext } from "../contract/service.ts";
import { incrementCrashes, resetCrashes, setLastError, setStatus } from "../persistence/plugins.ts";

/** Consecutive guest-invocation crashes before a resident plugin auto-disables. A LEAN — the
 *  resolution criterion is measured abuse or measured legitimate flakiness, whichever arrives first. */
export const PLUGIN_CRASH_DISABLE_THRESHOLD = 3;

export function createCrashPolicy(ctx: PluginContext, deactivate: (pluginId: PluginId) => Promise<void>, lanes: PluginLifecycleLanes): CrashPolicy {
  return {
    recordCrash: ({ pluginId, recipientUserId, error }): Promise<{ readonly disabled: boolean; readonly count: number }> =>
      lanes.run(pluginId, async () => {
        const { previous, count } = await incrementCrashes(ctx.db, pluginId, ctx.now());
        if (count >= PLUGIN_CRASH_DISABLE_THRESHOLD) {
          // The status write and the teardown are IDEMPOTENT and run on every crash at or above the line — the
          // later one carries the newer failure detail, which is the honest `lastError` for the row.
          await setStatus(ctx.db, pluginId, { status: "errored", lastError: error, updatedAt: ctx.now() });
          await deactivate(pluginId);
          // …but the NOTIFICATION is not idempotent: it appends a durable row to the owner's inbox. So it is
          // gated on the CROSSING (was below, now at or above), which exactly one caller can observe because
          // the increment is atomic and hands each caller its own `previous`. Without that gate, two crashes
          // racing over the line (landing on 3 and 4) both read `count >= 3` and both notified — two identical
          // "your plugin was disabled" rows for one disable. Tested against `>=`, not `===`: a threshold LOWERED
          // by a deploy must still disable a row already parked above it.
          if (previous < PLUGIN_CRASH_DISABLE_THRESHOLD) {
            // "the owner is notified" — the closed `plugin-disabled` member (recipient = the installing
            // owner; a human, an agent has no inbox). Rides the SAME injected notifications emit an automation
            // action uses (one durable-first inbox path — never a re-rolled delivery).
            await ctx.ops.notifications.emit({ type: "plugin-disabled", recipientUserId, pluginId });
          }
          return { disabled: true, count };
        }
        await setLastError(ctx.db, pluginId, error, ctx.now());
        return { disabled: false, count };
      }),
    recordCleanRun: (pluginId: PluginId): Promise<void> => lanes.run(pluginId, () => resetCrashes(ctx.db, pluginId, ctx.now())),
  };
}
