// verb: uiHostCall — the Tier-C client guest's ONE relay to the membrane (U4, §4.6 /
// §9 "the bridge as the new membrane"). A scripted `ui.js` running in the browser worker has NO network and NO
// DOM; when it needs host data it posts a function NAME plus inert JSON arguments, and THIS verb performs the
// call server-side through the SAME `PluginBridge` a server guest's call rides — closed over the installer,
// belted, ownership-scoped.
//
// THE CLIENT'S CLAIM IS NEVER TRUSTED. Everything on the wire — the pluginId, the function name, the arguments,
// the room — is attacker-controlled input from a realm that also runs untrusted plugin code, so each is
// re-derived or re-checked here rather than believed. The gate order is the security story, and each rung is
// placed where it is on purpose:
//
//  1. OWNER SCOPE. `getById(db, caller.userId, pluginId)` — a plugin the caller does not own reads ABSENT, so a
//     stranger holding another tenant's real pluginId gets the same leak-free NOT_FOUND as one holding a
//     fabricated id (D147; the cross-tenant sweep probes exactly this). FIRST and unconditional: it is the only
//     rung standing between a caller and another tenant's data, and every later rung reads off the row it loads.
//  2. STATUS. Only an ENABLED plugin may reach host ops. A disabled/errored row has consented capabilities on
//     it, but the user has withdrawn or the host has revoked the right to RUN — and a proxy that ignored status
//     would be a way to keep using a plugin the 3-strike policy just auto-disabled.
//  3. PROXYABILITY. `fn ∈ UI_PROXYABLE_HOST_FUNCTIONS`, the closed contracts tuple. This is what makes "a client
//     guest cannot register residency or perform an authority write" a property of the SET rather than of the
//     spelling — no string reaches a dispatcher that is not in the tuple.
//  4. GRANT. `HOST_FUNCTION_CAPABILITY[fn]` must be in the STORED `grantedCapabilities` on the row we just
//     loaded. Re-read per call from the row, never from anything the client sent and never cached across calls:
//     a `setGrant` that narrows a plugin's consent must take effect on the very next call, and the client's own
//     view of its grants is display-only.
//  5. ROOM. A chat-scoped fn's room is the caller's CLAIM; `resolveChatAuthority` must admit them as a reader,
//     else a leak-free NOT_FOUND on the CHAT. Without this the proxy would be a membership oracle — walk chat
//     ids, watch which ones answer.
//  6. SIZE + SHAPE. The args JSON is byte-capped before it is parsed (a bound you can enforce without
//     materializing anything), then per-fn zod-parsed by the dispatch table. The RESULT is capped on the way
//     out for the same reason the membrane caps its own.
//  7. CONCURRENCY. A per-plugin in-flight slot (`UiHostCallGate`), released in a `finally`. The tRPC bucket
//     bounds calls per window; only this bounds how many are RUNNING, which is what a re-rendering surface can
//     turn into a flood (the D46 P2-F lesson, applied from birth).
//
// WHAT THIS VERB DELIBERATELY DOES NOT DO: resolve host authority, decide what a capability means, or perform
// any op itself. It admits, and hands off. Every semantic bound — the D16 viewer clamp on canon, the KV
// ceilings, the per-plugin storage partition — lives in the bridge and its ops, unchanged and shared with the
// server guest, so there is exactly one implementation of each and this file cannot drift from it.

import type { UiProxyableHostFunction } from "@orb/contracts/plugin";
import { HOST_FUNCTION_CAPABILITY, isUiProxyableHostFunction, PLUGIN_UI_HOST_CALL_RESULT_MAX_BYTES } from "@orb/contracts/plugin";
import { DomainNotFoundError } from "@orb/kit/errors";
import { PluginNotFoundError } from "../contract/errors.ts";
import type { UiHostCallParams } from "../contract/params.ts";
import type { PluginContext, PluginService } from "../contract/service.ts";
import { getById } from "../persistence/plugins.ts";
import { buildPluginBridge } from "../substrate/bridge.ts";
import { runUiHostCall } from "../substrate/ui-host-dispatch.ts";

/** Gates 1-5, in order, returning the row + the narrowed function name once every one has passed. Extracted so
 *  the ladder reads as ONE thing and the verb body below is the CALL — a reviewer checking authority reads this
 *  function and nothing else, and a future rung has an obvious home. */
async function authorize(
  ctx: PluginContext,
  { caller, pluginId, fn, chatId }: UiHostCallParams,
): Promise<{ readonly name: string; readonly slug: string; readonly fn: UiProxyableHostFunction }> {
  // (1) OWNER SCOPE — leak-free NOT_FOUND for a plugin the caller does not own.
  const existing = await getById(ctx.db, caller.userId, pluginId);
  if (existing === undefined) {
    throw new PluginNotFoundError(pluginId);
  }
  // (2) STATUS — a disabled/errored plugin runs nothing, through any door.
  if (existing.status !== "enabled") {
    throw new Error("plugin host: this plugin is not enabled — its UI cannot call the host");
  }
  // (3) PROXYABILITY — the closed tuple, not the spelling.
  if (!isUiProxyableHostFunction(fn)) {
    throw new Error(`plugin host: '${fn}' is not callable from a plugin UI`);
  }
  // (4) GRANT — off the row, this call, every call.
  const capability = HOST_FUNCTION_CAPABILITY[fn];
  if (!existing.grantedCapabilities.includes(capability)) {
    throw new Error(`plugin host: this plugin has not been granted ${capability}`);
  }
  // (5) ROOM — the claim, verified. `undefined` means the guest named no room, which is legal for the seven
  // room-less functions and a typed refusal for the two that need one (the dispatch raises it).
  if (chatId !== undefined && !(await ctx.resolveChatAuthority(caller, chatId)).canRead) {
    throw new DomainNotFoundError("chat", chatId);
  }
  return { name: existing.name, slug: existing.slug, fn };
}

export function createUiHostCall(ctx: PluginContext): PluginService["uiHostCall"] {
  return async (params: UiHostCallParams) => {
    const { caller, pluginId, argsJson, chatId } = params;
    const { name, slug, fn } = await authorize(ctx, params);
    // (6) SHAPE — the byte cap was applied at the transport edge (the untrusted-input boundary); here the JSON
    // must at least BE json. A parse failure is a contained refusal, never a throw the client cannot read.
    let args: unknown;
    try {
      args = JSON.parse(argsJson);
    } catch (err) {
      throw new Error("plugin host: uiHostCall arguments must be a JSON document", { cause: err });
    }
    // (7) CONCURRENCY — claimed AFTER every authority gate (a caller who may not reach this plugin must not be
    // able to consume its slots probing) and released in a `finally` so a throwing op always returns its slot.
    const release = ctx.uiHostCallGate.admit(pluginId);
    try {
      // The bridge is built per (plugin, installer) exactly as activation builds it — the installer IS the
      // caller here (the v1 viewer==installer invariant, and the owner-scoped load above is what makes that
      // true rather than assumed), so global-vars, storage and the belts all close over the right principal.
      // `slug` completes the identity (U8 §5a); the Tier-C relay never reaches `pubsub.emit` (it is EXCLUDED from
      // the proxy tuple), so it is carried for type-honesty, not because a client guest can publish an event.
      const bridge = buildPluginBridge(ctx.ops, caller.userId, { id: pluginId, name, slug }, ctx.belts);
      const value = await runUiHostCall(fn, bridge, args, chatId ?? null);
      // `undefined` is not JSON; a void op answers a literal `null` so the guest's promise resolves to a value
      // it can test rather than to a hole that stringifies away.
      const resultJson = value === undefined ? "null" : JSON.stringify(value);
      if (Buffer.byteLength(resultJson, "utf8") > PLUGIN_UI_HOST_CALL_RESULT_MAX_BYTES) {
        // The outbound mirror of the inbound cap, and a REFUSAL rather than a truncation: a truncated JSON
        // document is not a smaller answer, it is an unparseable one.
        throw new Error(`plugin host: uiHostCall result exceeds the ${PLUGIN_UI_HOST_CALL_RESULT_MAX_BYTES}-byte cap`);
      }
      return { resultJson };
    } finally {
      release();
    }
  };
}
