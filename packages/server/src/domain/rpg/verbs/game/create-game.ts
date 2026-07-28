// domain/rpg/verbs/game/create-game — createGame (rpg-design/05 §4.4). The host-gated birth: lite only (`"full"`
// → the typed PHASE `RpgModeUnbuiltError`), mints the game row (NO born snapshot — the orchestrator no-born-seed
// ruling; the read layer synthesizes the default state), and writes the opaque `chats.metadata.rpg` pointer
// through the injected chat op.

import { RPG_GAME_MODES } from "@orb/contracts/rpg";
import { DomainForbiddenError, DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import { RpgModeUnbuiltError } from "../../contract/errors";
import type { CreateGameParams } from "../../contract/params";
import type { CreateGameResult } from "../../contract/results";
import type { RpgContext, RpgService } from "../../contract/service";
import { mintLiteGame } from "../../game-mint";
import { findGameByChat } from "../../persistence/games";

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

    // The birth mechanics (row + pointer mirror + bus emit, no born snapshot) live in the ONE shared
    // mint (`game-mint.ts`) — the chat-ops draft-time `startGame` door births through the same code.
    const gameId = await mintLiteGame(ctx, { chatId: params.chatId, profile: params.profile });

    const trackersReadOnly = await ctx.resolveTrackersReadOnly(params.chatId);
    return { gameId, trackersReadOnly };
  }
  return { createGame };
}
