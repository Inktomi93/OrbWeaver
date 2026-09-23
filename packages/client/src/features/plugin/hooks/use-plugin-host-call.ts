// The ONE client relay to `plugin.uiHostCall`, shared by both plugin UI tiers that run plugin code in the
// browser: the scripted surface's worker guest (U4) and the raw-HTML frame (U7). The owner ruled that the two
// get the same server-gated host access (#106), so they get the same wire, spelled once.
//
// THE PLUGIN ID IS BOUND HERE, AT THE MOUNT, AND NEVER PER CALL. The server re-gates every call against the
// caller's OWN stored grant for the named plugin, but the caller is the signed-in person, and every plugin they
// installed passes that owner-scope rung. So the server cannot tell which of a person's plugins a call came
// from; only the mount knows. A relay that took the plugin id per call would let plugin code choose which
// plugin's grants it spends. The returned function takes only what the plugin code may choose: the function
// name and its arguments.
//
// The room rides the same way: the mount's own `chatId`, re-verified server-side as one the caller can read.
// Plugin code never names a room.

import type { ChatId, PluginId } from "@orb/kit/ids";
import { useTRPCClient } from "#data";

/**
 * A relay bound to one mounted plugin surface: `(fn, argsJson)` in, the server's `resultJson` out. It REJECTS
 * on any refusal (not proxyable, not granted, a room the caller cannot read, the per-plugin in-flight cap);
 * each caller decides how much of that reason its plugin code may see.
 *
 * The IMPERATIVE client, not `useMutation`: a host call is driven by plugin code, not by a render, so it has no
 * query key, no cache entry and nothing to invalidate.
 */
export function usePluginHostCall(pluginId: PluginId, chatId: ChatId | undefined): (fn: string, argsJson: string) => Promise<string> {
  const client = useTRPCClient();
  return async (fn, argsJson) => {
    const result = await client.plugin.uiHostCall.mutate({ pluginId, fn, argsJson, ...(chatId === undefined ? {} : { chatId }) });
    return result.resultJson;
  };
}
