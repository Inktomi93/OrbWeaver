// domain/rpg/verbs/game/create-game — createGame (rpg-design/05 §4.4). The host-gated birth: lite only (`"full"`
// → the typed PHASE `RpgModeUnbuiltError`), mints the game row (NO born snapshot — the orchestrator no-born-seed
// ruling; the read layer synthesizes the default state), and writes the opaque `chats.metadata.rpg` pointer
// through the injected chat op.

import type { RpgStatProfile } from "@orb/contracts/rpg";
import { RPG_GAME_MODES, RPG_PROFILE_FREEFORM, rpgGameConfigSchema } from "@orb/contracts/rpg";
import { DomainForbiddenError, DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import { RpgModeUnbuiltError } from "../../contract/errors";
import type { CreateGameParams } from "../../contract/params";
import type { CreateGameResult } from "../../contract/results";
import type { RpgContext, RpgService } from "../../contract/service";
import { findGameByChat, insertGame } from "../../persistence/games";

/** The lite born config — the caller-picked profile (or `freeform`, lite's default) + the empty steering note +
 *  the default `extractionMode` (the schema fills it). */
function bornConfig(profile: RpgStatProfile | undefined): Record<string, unknown> {
  return { statProfile: profile ?? RPG_PROFILE_FREEFORM, lite: { steeringNote: "" }, extractionMode: "reliable" };
}

export function createCreateGame(ctx: RpgContext): Pick<RpgService, "createGame"> {
  async function createGame(params: CreateGameParams): Promise<CreateGameResult> {
    // Mode gate FIRST (before authority reveals anything): a bad mode is a caller error, `"full"` is the PHASE
    // refusal that NAMES the graft.
    if (!(RPG_GAME_MODES as readonly string[]).includes(params.mode)) {
      throw new DomainOperationError("rpg_invalid_mode", `unknown mode "${params.mode}"`);
    }
    if (params.mode === "full") {
      throw new RpgModeUnbuiltError();
    }
    // Host authority through the roster — but a game does not exist yet, so gate on membership directly (the
    // create precedes the game row). The refusals mirror `guard.ts`'s leak-free collapse: a NON-MEMBER learns
    // nothing (the same `DomainNotFound` a no-game chat gives — a foreigner must not discover the chat exists,
    // the cross-tenant trust boundary), while a present non-host member is FORBIDDEN (they legitimately know the
    // chat exists — the action, not the chat, is gated). A single BAD_REQUEST for both would hand a foreigner a
    // distinguishable "real chat, just not host" oracle.
    const membership = await ctx.getMembership(params.chatId, params.principal.userId);
    if (membership === null) {
      throw new DomainNotFoundError("game", params.chatId);
    }
    if (membership.role !== "host") {
      throw new DomainForbiddenError("host authority required to create a game");
    }
    // One game per chat (the UNIQUE chatId is the belt; this is the friendly refusal).
    if (await findGameByChat(ctx.db, params.chatId)) {
      throw new DomainOperationError("rpg_already_a_game", "this chat is already a game");
    }

    const now = ctx.now();
    const gameId = ctx.ids.game();
    // Validate/normalize the born config through the contract schema (defaults fill; a bad profile throws).
    const config = rpgGameConfigSchema.parse(bornConfig(params.profile));
    const game = await insertGame(ctx.db, {
      id: gameId,
      chatId: params.chatId,
      mode: "lite",
      status: "active",
      sessionNumber: 1,
      gmUserId: null,
      gmPresetId: null,
      config,
      createdAt: now,
      updatedAt: now,
    });

    // NO born snapshot (orchestrator ruling): `rpg_snapshots.messageId/variantId` are NON-nullable (they key a
    // real committed variant), so a game with no turns yet has ZERO snapshot rows. The resolution ladder returns
    // `undefined` for such a game (W1a rung 4), and the READ layer SYNTHESIZES the default empty state from
    // `config` — see `substrate/default-state.ts` + `getTrackerView`. The first tool turn writes the first row.

    // The opaque pointer — written at birth (the client's takeover gate reads it off ChatDetail); the
    // #40 engaged flip re-writes the same mirror later (updateConfig). Born engaged.
    await ctx.setPointer(params.chatId, { gameId: game.id, engaged: true });

    // The game row is born — the takeover + config reads refetch (§4.9). Emit AFTER the durable write.
    ctx.emitBus({ type: "gameChanged", chatId: params.chatId });

    const trackersReadOnly = await ctx.resolveTrackersReadOnly(params.chatId);
    return { gameId: game.id, trackersReadOnly };
  }
  return { createGame };
}
