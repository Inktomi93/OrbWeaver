// verb: runSnippet — the inline mode. A member types code in the chat box; it runs ONCE as the CALLER
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
//
// THE RESOURCE BELT (`snippetGate`): this is the one plugin verb a plain MEMBER reaches, and every call mints a
// fresh 32 MiB-ceiling QuickJSContext held for the length of the run. The transport's request bucket bounds
// calls per minute, which cannot say how many contexts one member pins AT ONCE — so the slot is claimed here,
// per user, for the duration, and released in a `finally`.

import type { PluginCapability } from "@orb/contracts/plugin";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { RunSnippetParams } from "../contract/params.ts";
import type { SnippetResult } from "../contract/results.ts";
import type { PluginContext } from "../contract/service.ts";
import { buildPluginBridge } from "../substrate/bridge.ts";

export function createRunSnippet(ctx: PluginContext): (params: RunSnippetParams) => Promise<SnippetResult> {
  return async ({ caller, chatId, code }): Promise<SnippetResult> => {
    const authority = await ctx.resolveChatAuthority(caller, chatId);
    if (!authority.canRead) {
      throw new DomainNotFoundError("chat", chatId);
    }
    const grants: PluginCapability[] = ["chat.read", "global_vars", ...(authority.canWrite ? (["chat.variables.write"] as const) : [])];
    // CLAIM A CONCURRENCY SLOT — after the authority gate (a caller who may not read the chat must be refused as
    // NOT_FOUND, and must not be able to consume slots probing rooms) and BEFORE the context is minted. The
    // release is in a `finally`, so a thrown/deadlined/refused run always returns its slot.
    const release = ctx.snippetGate.admit(caller.userId);
    try {
      // The bridge is built per-caller (the snippet runs as its author; global-vars closes over the caller).
      // `pluginId: null` — a transient snippet has no persistent plugin row; its fixed grant profile omits
      // storage.kv / notify / chat.quick_reply, so the bridge's plugin-scoped closures are unreachable (the
      // membrane's capability gate refuses them first).
      const bridge = buildPluginBridge(ctx.ops, caller.userId, null, ctx.notifyFloor);
      // A snippet is a human-initiated one-shot — the cascade ROOT (automationDepth 0); a turn it triggers stamps 1.
      return await ctx.host.runSnippet({ code, grants, bridge, chat: { chatId, canWrite: authority.canWrite, automationDepth: 0 } });
    } finally {
      release();
    }
  };
}
