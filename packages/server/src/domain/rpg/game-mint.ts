// domain/rpg/game-mint — the ONE lite-game BIRTH mechanism (a domain-root I/O helper, the `snapshot-edit.ts`
// precedent): insert the `rpg_games` row (born engaged, NO born snapshot — the no-born-seed ruling), write
// the opaque chat pointer mirror, emit `gameChanged`. TWO callers share it (never a re-spell):
//   • `verbs/game/create-game.ts` — the caller-gated verb (mode/authority/one-game gates, then mint);
//   • `chat-ops` `startGame` — the #40 DRAFT-TIME front door: `chat.startChat` carries a `startAsGame`
//     intent, and chat's creation verb asks rpg (through the injected `ChatRpgOps`) to mint the game
//     RIGHT AFTER the chat row commits and BEFORE the opening turn runs — so turn 1 is already in-game
//     (the gather sees the row; rpg steering rides the very first beat).

import type { RpgStatProfile } from "@orb/contracts/rpg";
import { RPG_PROFILE_FREEFORM, rpgGameConfigSchema, rpgSeedTrackers } from "@orb/contracts/rpg";
import type { ChatId, RpgGameId } from "@orb/kit/ids";
import type { RpgContext } from "./contract/service.ts";
import { insertGame } from "./persistence/games.ts";

/** Mint a lite game for `chatId` (row + pointer mirror + bus emit). The CALLER owns the gates (authority /
 *  one-game-per-chat / mode); this is pure birth mechanics. `profile` omitted ⇒ freeform (the create
 *  default). Validates/normalizes the born config through the contract schema (defaults fill). */
export async function mintLiteGame(ctx: RpgContext, args: { readonly chatId: ChatId; readonly profile?: RpgStatProfile | undefined }): Promise<RpgGameId> {
  const now = ctx.now();
  // `extractionMode` is deliberately NOT stamped here — the CONTRACT owns the born default (`folded`, owner
  // ruling 2026-08-01). Re-spelling it at birth is how a flipped default silently fails to reach new games.
  // R3 — the profile SEEDS the game's born trackers (the `hp` meter on a mechanical profile, nothing on
  // freeform). Seeding happens ONCE, here, at birth: nothing re-seeds a game whose host deleted or renamed the
  // def, which is the whole point of the demotion — health is the game's decision, not the schema's.
  const statProfile = args.profile ?? RPG_PROFILE_FREEFORM;
  const config = rpgGameConfigSchema.parse({ statProfile, trackers: rpgSeedTrackers(statProfile), lite: { steeringNote: "" } });
  const game = await insertGame(ctx.db, {
    id: ctx.ids.game(),
    chatId: args.chatId,
    mode: "lite",
    status: "active",
    sessionNumber: 1,
    gmUserId: null,
    gmPresetId: null,
    config,
    createdAt: now,
    updatedAt: now,
  });

  // NO born snapshot (orchestrator ruling): the read layer synthesizes the default state; the first
  // state round writes the first row. The opaque pointer is the client's sync takeover gate; born engaged.
  await ctx.setPointer(args.chatId, { gameId: game.id, engaged: true });

  // The game row is born — the takeover + config reads refetch (§4.9). Emit AFTER the durable write.
  ctx.emitBus({ type: "gameChanged", chatId: args.chatId });
  return game.id;
}
