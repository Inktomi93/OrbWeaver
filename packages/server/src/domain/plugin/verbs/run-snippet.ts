// verb: runSnippet — the inline mode (03 §1). A member types code in the chat box; it runs ONCE as the CALLER
// in a FRESH transient instance (no residency, no manifest, no registration) under the 5 s wall, then disposes.
// The snippet gate is leak-free: `resolveChatAuthority` (compose-injected `loadPresentRole` under the caller)
// admits the chat only when the caller can READ it — a foreign/unknown chat resolves `{false,false}` and the
// verb refuses NOT_FOUND (no existence oracle). The effective grants are the fixed profile ∩ that authority:
// `chat.read` + `global_vars` always, `chat.variables.write` only for a HOST caller (the §2 per-call gates do
// the work — no snippet-special code path). `chat.quick_reply` is DELIBERATELY omitted here even though the
// realm now exposes the fn: a surfaced chip stamps its emit `source` with a `pluginId`, and a transient
// anonymous snippet has no persistent plugin identity to source it (the bridge is built `pluginId:null`), so the
// capability is withheld rather than invent a synthetic source (a guest feature-detects). storage.kv / notify are
// likewise absent (no plugin row to key). tools/events/transforms are absent from the profile entirely — a
// transient anonymous snippet can register no auditable/disableable residency.

import type { PluginCapability } from "@orb/contracts/plugin";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { RunSnippetParams } from "../contract/params";
import type { SnippetResult } from "../contract/results";
import type { PluginContext } from "../contract/service";
import { buildPluginBridge } from "../substrate/bridge";

export function createRunSnippet(ctx: PluginContext): (params: RunSnippetParams) => Promise<SnippetResult> {
  return async ({ caller, chatId, code }): Promise<SnippetResult> => {
    const authority = await ctx.resolveChatAuthority(caller, chatId);
    if (!authority.canRead) {
      throw new DomainNotFoundError("chat", chatId);
    }
    const grants: PluginCapability[] = ["chat.read", "global_vars", ...(authority.canWrite ? (["chat.variables.write"] as const) : [])];
    // The bridge is built per-caller (the snippet runs as its author; global-vars closes over the caller). NO
    // spend gate (PLUGIN-SPEND): a transient snippet has no persistent plugin row to key AND its fixed grant
    // profile omits turn.trigger + imagery.generate, so the spendy closures are unreachable here — the gate would
    // be inert. `null` = ungated (correct: the membrane never grants a snippet the spendy caps).
    // `pluginId: null` — a transient snippet has no persistent plugin row; its fixed grant profile omits
    // storage.kv / notify / chat.quick_reply, so the bridge's plugin-scoped closures are unreachable (the
    // membrane's capability gate refuses them first).
    const bridge = buildPluginBridge(ctx.ops, caller.userId, null, null);
    // A snippet is a human-initiated one-shot — the cascade ROOT (automationDepth 0); a turn it triggers stamps 1.
    return await ctx.host.runSnippet({ code, grants, bridge, chat: { chatId, canWrite: authority.canWrite, automationDepth: 0 } });
  };
}
