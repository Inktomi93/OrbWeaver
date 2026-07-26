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

/** The `chats.metadata.rpg` sub-blob — mode-free `{gameId}`. Owned HERE (the foreign-schema precedent);
 *  the chat metadata parser lazy-parses it with `.catch(undefined)` so a corrupt blob heals to absent.
 *  `gameId` is prefix-validated (`rpg_game_…`) so a malformed pointer heals rather than projecting garbage. */
export const chatRpgPointerSchema = z.object({
  gameId: typeIdSchema(ID_PREFIX.rpgGame),
});
export type ChatRpgPointer = z.infer<typeof chatRpgPointerSchema>;
