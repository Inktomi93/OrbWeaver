// entry/compose/preset-usage — WHERE A PRESET IS BOUND FROM OUTSIDE ITS LIBRARY (#279), assembled at the
// composition root because every fact in it belongs to a different domain than the one asking.
//
// WHY IT LIVES HERE (the `room-reach` / `visible-rooms` posture): the answer joins settings' active pick,
// rpg's `rpg_games.gmPresetId`, and chat's membership — and `domain/preset` may import none of them
// (Constitution.md §2). So preset DECLARES the op (`ResolvePresetUsageOp`, its `contract/service.ts`) and this file
// is the ONE runtime; the caller-gate stays in the verb.
//
// ── WHAT A "BINDING" IS ON THIS TREE, re-derived rather than assumed (the finding #279 owes) ──
// A CHAT DOES NOT CARRY A PRESET. There is no `chats.preset_id` and no preset field in `chats.metadata`; a
// room's generation config is resolved per turn from its HOST's `UserSettings.seeds.defaultPresetId`
// (`entry/compose/chat.ts::resolvePromptConfigFor`). So "which chats reference this preset" has exactly two
// honest answers, and they are different KINDS of answer:
//   • the ACTIVE PICK — a setting, not a room list. When the seed resolves to this preset (`isActivePick`
//     below — and `null` resolves to the BUILT-IN, not to nothing) every room this user hosts runs it,
//     which is a fact about the user, and enumerating their rooms to say so would just restate the chats
//     list.
//   • the GM VOICE REDIRECT — `rpg_games.gmPresetId` (rpg §4.11 #1), the one genuinely PER-ROOM preset
//     binding: an rpg game whose narrator turns resolve this preset instead of the host's default. Those
//     rooms go through the shared leak-safe filter, because a game's room is a room like any other (D18):
//     the caller may have left it, and naming it would leak that it still exists.
// There is NO connection/role arm, and its absence is a finding, not an omission: roles bind MODELS through
// connections, and a preset is generation config that no connection or role references (the domain map's
// "preset owns generation config only — never the connection"). A `rg`/schema sweep for a preset reference
// outside `presets` finds exactly three FKs: `preset_regex_scripts` (FORWARD — what this preset attaches),
// `preset_tags` (labels), and `rpg_games.gm_preset_id` (this one).

import type { ResolveVisibleRoomsOp } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { rpgGames } from "@orb/db";
import type { ChatId, PresetId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { ResolvePresetUsageOp } from "#domain/preset";
import { SYSTEM_DEFAULT_PRESET_ID } from "#domain/preset";
import type { SettingsService } from "#domain/settings";

/** Is `presetId` the user's ACTIVE pick, reading the seed the way the RUNNER does (side-eye 2026-08-30 P1-A)?
 *
 *  `seeds.defaultPresetId === null` is not "unset, so nothing is picked" — it is "no EXPLICIT pick", and
 *  `entry/compose/chat.ts::resolvePromptConfigFor` resolves that to the shared system default. So the
 *  built-in IS the null pick, and a bare `seed === presetId` is a NARROWER reader than the two client sites
 *  that already spell this (`preset-editor-surface.tsx`'s `active`, `preset-library-surface.tsx`'s row
 *  toggle). It said "nothing uses this preset yet — activate it" about the preset every chat on a fresh
 *  install generates with, beside an `Active` chip and a checked radio on the same screen.
 *
 *  The explicit arm stays first and unconditional: a user who HAS picked a preset gets the ordinary answer,
 *  and the built-in is un-active for them — the null arm is a reading of "no pick", never a blanket
 *  exemption for the sentinel.
 *
 *  `defaultPresetId` is `string | null` and not `PresetId | null` because that is the type the SETTINGS
 *  contract gives the seed (`DEFAULT_USER_SETTINGS.seeds`) — branding it here would mean casting at a seam
 *  that owns no conversion. The asked-for id IS branded, which is the position that matters: a wrong-kind id
 *  cannot reach this comparison from the verb side. */
function isActivePick(defaultPresetId: string | null, presetId: PresetId): boolean {
  return defaultPresetId === null ? presetId === SYSTEM_DEFAULT_PRESET_ID : defaultPresetId === presetId;
}

/** What the preset-usage resolver needs: the two foreign reads + the shared room filter. */
export interface PresetUsageDeps {
  readonly db: Db;
  readonly loadUserSettings: SettingsService["loadUserSettings"];
  readonly resolveVisibleRooms: ResolveVisibleRoomsOp;
}

export function createResolvePresetUsage(deps: PresetUsageDeps): ResolvePresetUsageOp {
  return async (principal, presetId) => {
    const [settings, gameRows] = await Promise.all([
      deps.loadUserSettings(principal.userId),
      // Every game pointing at this preset, ACROSS owners — deliberately unfiltered here, because the filter
      // that matters is membership, not the game row's owner: the caller may hold a seat in someone else's
      // table that redirects to a preset they published. `resolveVisibleRooms` is the one gate, and it drops
      // everything the caller cannot presently see.
      deps.db.select({ chatId: rpgGames.chatId }).from(rpgGames).where(eq(rpgGames.gmPresetId, presetId)),
    ]);
    const chatIds = gameRows.map((row): ChatId => row.chatId);
    const gmRooms = chatIds.length === 0 ? [] : await deps.resolveVisibleRooms(principal, chatIds);
    return { isUserDefault: isActivePick(settings.seeds.defaultPresetId, presetId), gmRooms };
  };
}
