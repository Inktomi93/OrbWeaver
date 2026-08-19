// entry/compose/preset-usage — WHERE A PRESET IS BOUND FROM OUTSIDE ITS LIBRARY (#279), assembled at the
// composition root because every fact in it belongs to a different domain than the one asking.
//
// WHY IT LIVES HERE (the `room-reach` / `visible-rooms` posture): the answer joins settings' active pick,
// rpg's `rpg_games.gmPresetId`, and chat's membership — and `domain/preset` may import none of them
// (AGENTS §2). So preset DECLARES the op (`ResolvePresetUsageOp`, its `contract/service.ts`) and this file
// is the ONE runtime; the caller-gate stays in the verb.
//
// ── WHAT A "BINDING" IS ON THIS TREE, re-derived rather than assumed (the finding #279 owes) ──
// A CHAT DOES NOT CARRY A PRESET. There is no `chats.preset_id` and no preset field in `chats.metadata`; a
// room's generation config is resolved per turn from its HOST's `UserSettings.seeds.defaultPresetId`
// (`entry/compose/chat.ts::resolvePromptConfigFor`). So "which chats reference this preset" has exactly two
// honest answers, and they are different KINDS of answer:
//   • the ACTIVE PICK — a setting, not a room list. `defaultPresetId === id` means every room this user
//     hosts runs it, which is a fact about the user, and enumerating their rooms to say so would just
//     restate the chats list.
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
import type { ChatId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { ResolvePresetUsageOp } from "#domain/preset";
import type { SettingsService } from "#domain/settings";

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
    return { isUserDefault: settings.seeds.defaultPresetId === presetId, gmRooms };
  };
}
