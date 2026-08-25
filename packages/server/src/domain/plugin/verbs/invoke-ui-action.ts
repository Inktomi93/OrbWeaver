// verb: invokeUiAction — the Tier-S guest-action round-trip (plugin-ui-plane #679 U1, §4.4). A button on a
// rendered surface submits its `actionId` + the collected form `values`; this re-enters the surface's
// `onAction` handler in the resident guest.
//
// THE AUTHORITY GATE, in the order a hostile caller meets it — this verb takes a FOREIGN pluginId, so the
// scoping is the whole security story (the cross-tenant sweep probes it as a stranger holding owner A's real id):
//  1. OWNER SCOPE — `getById(db, caller.userId, pluginId)` reads absent for a plugin the caller does not own →
//     leak-free NOT_FOUND (the D147 posture; a stranger can never tell "not yours" from "does not exist"). This
//     is the ONLY thing standing between a caller and another tenant's guest, so it is first and unconditional.
//  2. RESIDENCE — a disabled/errored plugin has no resident instance; nothing to invoke. Past the owner gate,
//     so this is a state fact about the caller's OWN plugin, not a cross-tenant oracle.
//  3. SURFACE + HANDLER — the surfaceId must name a surface THIS instance registered, and it must carry an
//     `onAction` (a display-only surface has none). A miss is the caller's own plugin, so a plain refusal is
//     safe — no foreign existence is revealed.
//
// The re-entry runs through the resident's crash-policy'd `invoke` (NOT `ctx.host.invoke` directly), so a
// throwing/hung handler bumps `consecutive_crashes` toward the 3-strike auto-disable exactly like a tool or
// event handler — and a rejected invoke propagates to the mutation as a typed refusal the client toasts. The
// guest receives ONE `{ actionId, values, chat }` object (the single-arg host→guest seam); `chat` is `null`
// because a v1 settings surface has no room scope. The handler's return is DISCARDED — the surface's effect is
// whatever state it publishes via `host.ui.setState`, whose bus poke refreshes the caller's own client.

import { PluginNotFoundError } from "../contract/errors.ts";
import type { InvokeUiActionParams } from "../contract/params.ts";
import type { PluginContext, PluginRegistry, PluginService } from "../contract/service.ts";
import { getById } from "../persistence/plugins.ts";

export function createInvokeUiAction(ctx: PluginContext, registry: PluginRegistry): PluginService["invokeUiAction"] {
  return async ({ caller, pluginId, surfaceId, actionId, values }: InvokeUiActionParams) => {
    // (1) OWNER SCOPE — leak-free NOT_FOUND for a plugin the caller does not own (the cross-tenant gate).
    const existing = await getById(ctx.db, caller.userId, pluginId);
    if (existing === undefined) {
      throw new PluginNotFoundError(pluginId);
    }
    // (2) RESIDENCE — the caller's own plugin must be enabled to hold a surface with a live handler.
    const resident = registry.get(pluginId);
    if (resident === undefined) {
      throw new Error("plugin host: this plugin is not enabled — no UI surface to act on");
    }
    // (3) SURFACE + HANDLER — a surface this instance registered, carrying an onAction (own plugin ⇒ safe refusal).
    const surface = resident.instance.surfaces.find((s) => s.id === surfaceId);
    if (surface?.onAction === undefined) {
      throw new Error(`plugin host: no actionable UI surface '${surfaceId}' on this plugin`);
    }
    // Re-enter under the crash policy + the per-instance invoke queue. The guest gets one {actionId, values,
    // chat} object; a settings surface has no room, so chat is null. The handler's string return is discarded.
    await resident.invoke(surface.onAction, JSON.stringify({ actionId, values, chat: null }), null);
  };
}
