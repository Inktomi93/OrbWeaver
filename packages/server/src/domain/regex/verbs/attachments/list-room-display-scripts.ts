// verb: listRoomDisplayScripts — the room's BROADCAST display set (D121-E host option, owner ruling
// 2026-08-02). MEMBER-gated and deliberately NOT owner-filtered: the whole point is that a non-host viewer
// reads the HOST's scripts, so a normal ownership gate would return exactly nothing.
//
// THE OPT-IN IS THE GATE. `resolveRoomDisplayPolicy` (chat's, injected) answers both halves — is this room
// opted in, and who is its host. Not opted in (the default) ⇒ `[]`, which means a member can never learn
// what scripts the host owns while the option is off, and the off arm is byte-identical to a room that
// never heard of the feature. Hostless room (archived orphan) ⇒ `[]` too.
//
// FILTERED, unlike every other list verb here: the client applies this set verbatim to rendered bodies, so
// it is narrowed to the scripts that would actually fire — `enabled` ∩ DISPLAY placement. Handing over a
// disabled or prompt-side script would leak the host's library shape for no render benefit.

import type { RegexContext } from "../../context";
import type { ListRoomDisplayScriptsParams } from "../../contract/params";
import type { RegexService } from "../../contract/service";
import { listOwnedScripts, toRow } from "../../persistence/queries";

const DISPLAY_PLACEMENT = "DISPLAY";

export function createListRoomDisplayScripts(ctx: RegexContext): RegexService["listRoomDisplayScripts"] {
  return async ({ principal, chatId }: ListRoomDisplayScriptsParams) => {
    await ctx.requireChatMember(principal, chatId);
    const policy = await ctx.resolveRoomDisplayPolicy(chatId);
    if (!policy.enabled || policy.hostUserId === null) {
      return [];
    }
    const records = await listOwnedScripts(ctx.db, policy.hostUserId);
    return records.map(toRow).filter((row) => row.enabled && row.placement.includes(DISPLAY_PLACEMENT));
  };
}
