// domain/rpg/verbs/game/detach-dangling-pointer — the dangling-pointer HEAL (fork-clones-the-game §3.3). A
// chat's `metadata.rpg` pointer can point at a game row that no longer exists: a pre-fix fork (made before
// W-F cloned the game / the `8306a2b9` stopgap), or any future desync where the game vanished but the pointer
// stayed. That dangle makes `getGame`/`getTrackerView` 404 and the panel/header crash. This verb nulls the
// stale pointer via the widened `ctx.setPointer(chatId, null)`, self-healing the chat to a plain chat.
//
// WHY IT CANNOT USE THE NORMAL GAME GATE: `resolveMember`/`resolveHost` require `findGameByChat !== undefined`,
// so on a dangling pointer they collapse to the leak-free NOT_FOUND — the exact state this verb exists to fix.
// So it gates on chat MEMBERSHIP DIRECTLY (the injected `getMembership`, the same authority source the guard
// uses): a non-member gets the leak-free NOT_FOUND (indistinguishable from a no-game chat — the cross-tenant
// trust boundary), a present non-host member gets FORBIDDEN (they know the chat exists; the action is gated).
// This is a stamped-id WRITE boundary — the host gate lives HERE, not at transport ([[stamped-id-write-boundary-gate]]).
//
// SAFETY — REFUSE A LIVE GAME: if a real `rpg_games` row EXISTS for the chat, the pointer is NOT dangling and
// this verb REFUSES (`DomainOperation rpg_pointer_not_dangling`). Nulling a live game's pointer would orphan a
// real game (the panel would vanish while the rows persist); turning a game OFF is `updateConfig engaged:false`,
// a different door. So the heal only ever fires when the pointed-at game is genuinely gone.

import { DomainOperationError } from "@orb/kit/errors";
import type { DetachDanglingPointerParams } from "../../contract/params";
import type { RpgContext, RpgService } from "../../contract/service";
import { assertHostRole, notFoundGame } from "../../guard";
import { findGameByChat } from "../../persistence/games";

export function createDetachDanglingPointer(ctx: RpgContext): Pick<RpgService, "detachDanglingPointer"> {
  async function detachDanglingPointer(params: DetachDanglingPointerParams): Promise<void> {
    // Membership DIRECT (not the game gate — the game is gone): a non-member collapses to leak-free NOT_FOUND.
    const membership = await ctx.getMembership(params.chatId, params.principal.userId);
    if (membership === null) {
      return notFoundGame(params.chatId);
    }
    // A present non-host member reaching a host-only heal is FORBIDDEN (they legitimately know the chat exists).
    assertHostRole(ctx.can, params.principal, membership.role, "host authority required");
    // Refuse to detach a LIVE game — the pointer is only "dangling" if the game row is actually gone.
    const game = await findGameByChat(ctx.db, params.chatId);
    if (game !== undefined) {
      throw new DomainOperationError("rpg_pointer_not_dangling", "the chat's game still exists — turn it off with the game toggle, not a detach");
    }
    // Heal: null the stale pointer (the widened chat op DROPS the `metadata.rpg` sub-blob — the chat is now
    // byte-identical to a never-a-game chat, so the takeover collapses like any plain chat).
    await ctx.setPointer(params.chatId, null);
  }
  return { detachDanglingPointer };
}
