// op: resolvePresetUsage — where a preset is bound from OUTSIDE its library (#279), the CONTEXT panel's "used by".
//
// A CHAT DOES NOT CARRY A PRESET: a room's generation config resolves per turn from its host's
// `seeds.defaultPresetId`. So "which chats use this preset" has two honest answers of different KINDS:
//   • the ACTIVE PICK — a fact about the user (every room they host runs it), reported as a setting;
//   • the GM VOICE REDIRECT — `rpg_games.gmPresetId`, the one per-room binding, filtered through chat's leak-safe
//     room read, because a game's room is a room like any other (D18) and the caller may have left it.
// There is no connection/role arm: roles bind models through connections, and no connection references a preset.

import type { PresetUsageDeps, ResolvePresetUsageOp } from "../contract/service.ts";
import { isActivePresetPick } from "../substrate/active-pick.ts";

export function createResolvePresetUsage(deps: PresetUsageDeps): ResolvePresetUsageOp {
  return async (principal, presetId) => {
    const [settings, gmChatIds] = await Promise.all([deps.loadUserSettings(principal.userId), deps.listGmPresetChatIds(presetId)]);
    const gmRooms = gmChatIds.length === 0 ? [] : await deps.resolveVisibleRooms(principal, gmChatIds);
    return { isUserDefault: isActivePresetPick(settings.seeds.defaultPresetId, presetId), gmRooms };
  };
}
