// verb: getSurfaceState — one owned surface's published state (U1; the room dimension is
// row 777). TWO gates, and they answer two different questions:
//
//  1. OWNER SCOPE — the `getById(db, caller.userId, pluginId)` load IS the gate for the PLUGIN (a foreign
//     pluginId reads absent → leak-free NOT_FOUND, never an existence oracle), the SAME authority model every
//     per-row plugin verb uses (D147). The v1 invariant is viewer == installer, so the surface state's one
//     legitimate reader is exactly this owner.
//  2. MEMBERSHIP — a `chatId` is a CLIENT CLAIM about which room's row to read, and it is verified rather than
//     trusted: `resolveChatAuthority` (the same leak-free `loadPresentRole` seam `runSnippet` uses) must admit
//     the caller as a reader, else NOT_FOUND on the CHAT. Without this gate the room dimension would be a probe
//     — a caller could walk chat ids against their own plugin and learn from the null-vs-value answer which
//     rooms that plugin had ever published into, including rooms they were removed from. The gate makes the
//     answer say nothing they could not already read.
//
// The state plane is in-memory (`ctx.surfaceState`, respawn wipes); `null` when the plugin has published
// nothing for that (surface, room) key — the renderer binds `null` to each node's fallback, and the room
// fan-out renders nothing at all (§4.9). A room-scoped read does NOT fall back to the plugin-wide row: they are
// different claims (see `PluginSurfaceStateStore`).

import { DomainNotFoundError } from "@orb/kit/errors";
import { PluginNotFoundError } from "../contract/errors.ts";
import type { GetSurfaceStateParams } from "../contract/params.ts";
import type { PluginContext, PluginService } from "../contract/service.ts";
import { getById } from "../persistence/plugins.ts";

export function createGetSurfaceState(ctx: PluginContext): PluginService["getSurfaceState"] {
  return async ({ caller, pluginId, surfaceId, chatId }: GetSurfaceStateParams) => {
    const existing = await getById(ctx.db, caller.userId, pluginId);
    if (existing === undefined) {
      throw new PluginNotFoundError(pluginId);
    }
    if (chatId !== undefined && !(await ctx.resolveChatAuthority(caller, chatId)).canRead) {
      throw new DomainNotFoundError("chat", chatId);
    }
    return ctx.surfaceState.get(pluginId, surfaceId, chatId ?? null);
  };
}
