// @orb/contracts/rpg/pointer — the OPAQUE sync pointer written into `chats.metadata.rpg` (rpg-design/05
// §2.1). `rpg_games` is the TRUTH (one row per chat, game-ness resolves server-side by that row always);
// this pointer is a SYNC SIGNAL written ONCE by `createGame` (through the `setRpgPointer` chat op) so the
// client's takeover gate is a SYNC read off `ChatDetail` — data it already holds — instead of an async
// per-chat query on every chat switch. Chat stores it BLIND (the `databankVisibility`/`background`
// foreign-schema precedent) and never dereferences it; the metadata parser heals a corrupt blob to absent.
//
// The pointer carries NO `mode` — mode's ONE home is the game row (§2.1; the client reads mode from
// `rpg.getGame` after the pointer fires). Two homes for one axis would drift the day `setMode` lands.

import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

/** The `chats.metadata.rpg` sub-blob — mode-free `{gameId}` + the `engaged` MIRROR (#40 front-door
 *  toggle; the truth is `rpg_games.config.engaged`, this is the sync copy the client's takeover gate
 *  reads off `ChatDetail`). Owned HERE (the foreign-schema precedent); the chat metadata parser
 *  lazy-parses it with `.catch(undefined)` so a corrupt blob heals to absent. `gameId` is
 *  prefix-validated (`rpg_game_…`); a pre-toggle pointer heals `engaged` to `true` via the default. */
export const chatRpgPointerSchema = z.object({
  gameId: typeIdSchema(ID_PREFIX.rpgGame),
  engaged: z.boolean().default(true),
});
export type ChatRpgPointer = z.infer<typeof chatRpgPointerSchema>;

/** The ONE takeover-gate predicate (#40): does this chat's pointer say "a LIVE game"? `null`/absent =
 *  not a game; `engaged:false` = a game that is OFF (panel hidden, turn assembly clean) but PRESERVED.
 *  Every client gate (tabs `when`, panel state, wand, reading surface) reads THIS, never a re-spelled
 *  null-check — the OFF arm must gate identically everywhere. A pointer MISSING the field (a pre-toggle
 *  cached payload the schema default hasn't healed) reads ENGAGED — mirroring the `.default(true)`. */
export function isRpgEngaged(pointer: ChatRpgPointer | null | undefined): boolean {
  return pointer !== null && pointer !== undefined && pointer.engaged !== false;
}
