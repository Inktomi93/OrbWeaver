// domain/rpg/chat-ops/handoff-heal — `ChatRpgOps.handoffHealStatements`. The HOST-HANDOFF twin of the fork's
// `resolveForkGmPreset` gate (stickler 2026-08-03 F1): `chat.acceptHostHandoff` moves room authority to the
// nominee, and from that moment the game's `gmPresetId` is resolved under the NEW host — owner-scoped, via
// `resolvePresetOverride` → `preset.get`. A preset the new host cannot read therefore degrades SILENTLY (the
// lenient-id rule catches the throw and falls back to their default GM voice) while `getConfigView` keeps
// serving them an id they can never inspect: the room's voice changes with zero surfacing and the knob lies.
//
// So the accept NULLS it — conditionally, the same ownership axis the fork uses: a preset the nominee CAN read
// (owned, or the shared system default) is a legitimate knob and is left alone. No cross-tenant read ever
// occurs on either side of the heal; `resolvePresetOwned` is the injected ownership question, and rpg never
// touches a preset row.
//
// The return is UNEXECUTED statements, not a write: chat folds them into the SAME `db.batch` as the role swap
// (the PD-24 co-statement seam), so a crash can never leave a promoted host holding a foreign GM voice. That
// is also why this reads the game row DIRECTLY (never `findEngagedGame`): a DISENGAGED game still carries the
// knob, and a room re-engaged after a handoff must not wake up pointing at the old host's private preset.

import type { BatchStmt } from "@orb/db/kit";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { RpgContext } from "../contract/service";
import { clearGmPresetStatement, findGameByChat } from "../persistence/games";

/** The statements the host-handoff swap must carry for the game rooted at `chatId` — empty for a non-game
 *  chat, an unset knob, or a preset the new host can already read (the overwhelmingly common cases). */
export async function handoffHealStatements(ctx: RpgContext, chatId: ChatId, newHostUserId: UserId): Promise<BatchStmt[]> {
  const game = await findGameByChat(ctx.db, chatId);
  if (game === undefined || game.gmPresetId === null) {
    return [];
  }
  const readable = await ctx.resolvePresetOwned(game.gmPresetId, newHostUserId);
  return readable ? [] : [clearGmPresetStatement(ctx.db, game.id, ctx.now())];
}
