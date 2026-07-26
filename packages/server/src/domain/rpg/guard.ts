// domain/rpg/guard — the ONE authority chokepoint every verb resolves through (rpg-design/05 §4.4). The
// ratified `guard.ts` 9th-slot pattern (feature-structure §): an I/O-touching, non-verb authority-gate
// primitive — it awaits the injected `getMembership` op + reads the game row, so it can't live in zero-I/O
// `substrate/`, and verb-to-verb VALUE imports are banned, so it homes at the domain root (the `can()` seam
// precedent).
// Authority derives through the chat FK chain (`getMembership`, an injected chat op) — NEVER a chat-table read,
// NO `ownerId` (D23). The refusals are LEAK-FREE: a non-member and a no-game chat get the SAME `DomainNotFound`
// (a foreigner learns nothing about whether the chat is a game), and a member reaching a host-only plane gets a
// `DomainForbidden` (they legitimately know the chat exists — the action, not the chat, is gated).
//
// `resolveMember` is the member floor (reads + own-row writes); `resolveHost` is the shared-plane floor. Both
// return the resolved game row so the verb has the truth in one round-trip. `assertOwnUserRef` is the member's
// self-write check (a member may write their OWN `user` sheet/actor, never another's).

import type { ParticipantRole, Principal } from "@orb/contracts/identity";
import type { RpgActorRef } from "@orb/contracts/rpg";
import { DomainForbiddenError, DomainNotFoundError } from "@orb/kit/errors";
import type { ChatId } from "@orb/kit/ids";
import type { RpgAuthorized, RpgContext } from "./contract/service";
import { findGameByChat } from "./persistence/games";

/** The leak-free not-found — indistinguishable across "no such chat", "not a game", and "not a member". A
 *  foreigner never learns the chat's game-ness. Uses `chatId` as the surfaced id (the caller already has it). */
function notFound(chatId: ChatId): never {
  throw new DomainNotFoundError("game", chatId);
}

/** Resolve the MEMBER floor: the caller must be a present member of the chat AND the chat must be a game.
 *  Returns the game + role. A non-member / no-game / non-participant collapse to ONE not-found. */
export async function resolveMember(ctx: RpgContext, principal: Principal, chatId: ChatId): Promise<RpgAuthorized> {
  const membership = await ctx.getMembership(chatId, principal.userId);
  if (membership === null) {
    return notFound(chatId);
  }
  const game = await findGameByChat(ctx.db, chatId);
  if (game === undefined) {
    return notFound(chatId);
  }
  return { game, role: membership.role };
}

/** Resolve the HOST floor for a shared-plane write. A member reaching a host-only plane is FORBIDDEN (not
 *  not-found — they are a present member, so the chat's existence is already theirs to know; only the action
 *  is gated). A non-member still collapses to leak-free not-found. */
export async function resolveHost(ctx: RpgContext, principal: Principal, chatId: ChatId): Promise<RpgAuthorized> {
  const authorized = await resolveMember(ctx, principal, chatId);
  if (authorized.role !== "host") {
    throw new DomainForbiddenError("host authority required");
  }
  return authorized;
}

/** A member's self-write check: the target actor ref must be the caller's OWN `user` ref. A host bypasses this
 *  (it holds every plane). Throws `DomainForbidden` on a foreign/non-user ref for a member. */
export function assertOwnUserRef(role: ParticipantRole, principal: Principal, ref: RpgActorRef): void {
  if (role === "host") {
    return;
  }
  if (ref.kind !== "user" || ref.userId !== principal.userId) {
    throw new DomainForbiddenError("a member may write only their own row");
  }
}
