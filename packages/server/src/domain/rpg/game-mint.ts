// domain/rpg/game-mint — the ONE lite-game BIRTH mechanism (a domain-root I/O helper, the `snapshot-edit.ts`
// precedent): construct the born `rpg_games` row (NO born snapshot — the no-born-seed ruling). TWO callers
// share the same plan (never a re-spell):
//   • `verbs/game/create-game.ts` — commits the plan, writes the opaque chat pointer, emits `gameChanged`;
//   • `chat-ops.planGameBirth` — the #40 DRAFT-TIME front door: `chat.startChat` folds RPG's statement and
//     its own pointer into room birth, so turn 1 is already in-game (rpg steering rides the first beat).

import type { RpgStatProfile } from "@orb/contracts/rpg";
import { RPG_PROFILE_FREEFORM, rpgGameConfigSchema, rpgSeedTrackers } from "@orb/contracts/rpg";
import { rpgGames } from "@orb/db";
import { batchMany, batchStmt } from "@orb/db/kit";
import type { ChatId, RpgGameId } from "@orb/kit/ids";
import type { ChatRpgGameBirthPlan } from "../chat/index.ts";
import type { RpgContext } from "./contract/service.ts";

/** Build the one RPG-owned contribution to either birth path. No write occurs until the caller commits the
 *  returned statement, which lets `chat.startChat` fold it into room creation without constructing an RPG row. */
export function planLiteGameBirth(ctx: RpgContext, args: { readonly chatId: ChatId; readonly profile?: RpgStatProfile | undefined }): ChatRpgGameBirthPlan {
  const now = ctx.now();
  const statProfile = args.profile ?? RPG_PROFILE_FREEFORM;
  const config = rpgGameConfigSchema.parse({ statProfile, trackers: rpgSeedTrackers(statProfile), lite: { steeringNote: "" } });
  const gameId = ctx.ids.game();
  return {
    gameId,
    statements: [
      batchStmt(
        ctx.db.insert(rpgGames).values({
          id: gameId,
          chatId: args.chatId,
          mode: "lite",
          status: "active",
          sessionNumber: 1,
          gmUserId: null,
          gmPresetId: null,
          config,
          createdAt: now,
          updatedAt: now,
        }),
      ),
    ],
  };
}

/** Mint a lite game for `chatId` (row + pointer mirror + bus emit). The CALLER owns the gates (authority /
 *  one-game-per-chat / mode); this is pure birth mechanics. `profile` omitted ⇒ freeform (the create
 *  default). Validates/normalizes the born config through the contract schema (defaults fill). */
export async function mintLiteGame(ctx: RpgContext, args: { readonly chatId: ChatId; readonly profile?: RpgStatProfile | undefined }): Promise<RpgGameId> {
  const plan = planLiteGameBirth(ctx, args);
  await ctx.db.batch(batchMany([...plan.statements]));

  // NO born snapshot (orchestrator ruling): the read layer synthesizes the default state; the first
  // state round writes the first row. The opaque pointer is the client's sync takeover gate; born engaged.
  await ctx.setPointer(args.chatId, { gameId: plan.gameId, engaged: true });

  // The game row is born — the takeover + config reads refetch (§4.9). Emit AFTER the durable write.
  ctx.emitBus({ type: "gameChanged", chatId: args.chatId });
  return plan.gameId;
}
