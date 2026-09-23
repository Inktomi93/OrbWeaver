// verb: invokeUiAction — the Tier-S guest-action round-trip (U1, §4.4; the room dimension
// is row 777). A button on a rendered surface submits its `actionId` + the collected form `values`; this
// re-enters the surface's `onAction` handler in the resident guest.
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
//  4. MEMBERSHIP (row 777) — a `chatId` is a CLIENT CLAIM about which room the action was taken in, and it
//     becomes the guest's INVOCATION SCOPE, so it is the one input that could hand a guest a room. It is
//     verified, never trusted: `resolveChatAuthority` (the leak-free `loadPresentRole` seam) must admit the
//     CALLER as a reader of that room, else NOT_FOUND on the chat. `canWrite` comes from the SAME answer's host
//     authority — so a member's action can read the room and a host's can write it, and neither is decided by
//     anything the client said. Absent chatId ⇒ no scope at all (the U1 settings-panel shape, unchanged:
//     `chat.current()` throws and the args carry `chat: null`).
//
// The re-entry runs through the resident's crash-policy'd `invoke` (NOT `ctx.host.invoke` directly), so a
// throwing/hung handler bumps `consecutive_crashes` toward the 3-strike auto-disable exactly like a tool or
// event handler — and a rejected invoke propagates to the mutation as a typed refusal the client toasts. The
// guest receives ONE `{ actionId, values, chat }` object (the single-arg host→guest seam); `chat` is the
// invocation's OPAQUE HANDLE (row 777 — `null` only when the surface names no room), which is why the args are
// built by a CLOSURE rather than a string — the token is minted inside the runtime when the scope is set, so it
// does not exist until the moment it is applied (`PluginInvokeArgs`). The handler's return is DISCARDED — the
// surface's effect is whatever state it publishes via `host.ui.setState`, whose bus poke refreshes the caller's
// own client.
//
// U5 ADDED THE OUTCOME (§4.5a). The handler may also ask for host-mediated CHROME while it runs —
// `host.ui.toast`, `host.ui.openDialog` — which lands in the plugin's bounded UI outbox. This verb DRAINS that
// outbox after the guest returns and hands the items back to the person who acted. That is the whole delivery
// channel, which is what makes a spontaneous modal unspellable rather than merely refused. The drain runs even
// when the invoke THREW: a handler that toasts "couldn't reach the API" and then throws should still get its
// sentence to the person, and leaving items behind would deliver them to a LATER, unrelated round-trip.

import type { PluginUiOutcome } from "@orb/contracts/plugin";
import { DomainNotFoundError } from "@orb/kit/errors";
import { PluginNotFoundError } from "../contract/errors.ts";
import type { InvokeUiActionParams } from "../contract/params.ts";
import type { PluginContext, PluginRegistry, PluginService } from "../contract/service.ts";
import { getById } from "../persistence/plugins.ts";
import { resolveUiOutcome } from "../substrate/ui-outbox.ts";

export function createInvokeUiAction(ctx: PluginContext, registry: PluginRegistry): PluginService["invokeUiAction"] {
  return async ({ caller, pluginId, surfaceId, actionId, values, chatId }: InvokeUiActionParams) => {
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
    // (4) MEMBERSHIP — the claimed room, verified. The write ceiling (`canWrite`) is the caller's HOST authority
    // on that room, resolved here and NEVER inferred from the client; a plugin action in a room the installer
    // merely reads gets the same read-only ceiling every other member-scoped invocation gets.
    const authority = chatId === undefined ? null : await ctx.resolveChatAuthority(caller, chatId);
    if (chatId !== undefined && authority?.canRead !== true) {
      throw new DomainNotFoundError("chat", chatId);
    }
    // A UI action is a HUMAN act — the cascade ROOT (automationDepth 0), exactly like a snippet run; a turn it
    // goes on to trigger stamps 1.
    const chat = chatId === undefined || authority === null ? null : { chatId, canWrite: authority.canWrite, automationDepth: 0 };
    // Re-enter under the crash policy + the per-instance invoke queue. The args are a CLOSURE over the handle the
    // runtime mints for THIS invocation (see the header); the handler's string return is discarded. The DRAIN
    // (U5) is in a `finally` so a throwing handler's toasts still reach the person who acted (and never leak into
    // a later round-trip); the invoke's own rejection still propagates — it must, or a crash reads as a success
    // with a sad toast.
    let outcome: PluginUiOutcome = { toasts: [] };
    try {
      await resident.invoke(surface.onAction, (chatHandle) => JSON.stringify({ actionId, values, chat: chatHandle }), chat);
    } finally {
      outcome = resolveUiOutcome(ctx.uiOutbox.drain(pluginId), resident.instance);
    }
    return outcome;
  };
}
