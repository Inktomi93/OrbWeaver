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
 *  foreigner never learns the chat's game-ness. Uses `chatId` as the surfaced id (the caller already has it).
 *  Exported for the ONE verb that gates on membership WITHOUT the game gate (`detachDanglingPointer` — the game
 *  is gone, so it can't call `resolveMember`, but a non-member must still see the SAME leak-free collapse). */
export function notFoundGame(chatId: ChatId): never {
  throw new DomainNotFoundError("game", chatId);
}

/** Resolve the MEMBER floor: the caller must be a present member of the chat AND the chat must be a game.
 *  Returns the game + role. A non-member / no-game / non-participant collapse to ONE not-found. */
export async function resolveMember(ctx: RpgContext, principal: Principal, chatId: ChatId): Promise<RpgAuthorized> {
  const membership = await ctx.getMembership(chatId, principal.userId);
  if (membership === null) {
    return notFoundGame(chatId);
  }
  const game = await findGameByChat(ctx.db, chatId);
  if (game === undefined) {
    return notFoundGame(chatId);
  }
  return { game, role: membership.role };
}

/** THE host comparison — rpg's ONE privilege-comparison site (the `two-class-role-authority` gate's cited
 *  chokepoint for this domain; chat's is `can()`/`permitsHost`). `reason` is the refusal SENTENCE, because
 *  that is the only thing the six verbs that used to re-spell `role !== "host"` inline actually needed:
 *  `patchActor` says "…to hand-edit an actor", `promoteActor` says "…to promote an actor to the roster".
 *  Taking the sentence as an argument collapses seven comparisons to one with byte-identical refusals
 *  (pinned: tests/server/domain/rpg/authority.suite.int.test.ts).
 *
 *  A verb that has already resolved its membership (`resolveMember`, or the direct `ctx.getMembership` read
 *  the two game-lifecycle verbs must do) calls THIS; a verb that needs the game row too calls
 *  {@link resolveHost}. Neither routes through `can()`: `RpgContext` carries no `can` seam, so unifying rpg
 *  onto the chat spine's `can()` is a compose-seam change, queued as its own item — not something a verb
 *  may improvise around by comparing the role itself. */
export function assertHostRole(role: ParticipantRole, reason: string): void {
  if (role !== "host") {
    throw new DomainForbiddenError(reason);
  }
}

/** Resolve the HOST floor for a shared-plane write. A member reaching a host-only plane is FORBIDDEN (not
 *  not-found — they are a present member, so the chat's existence is already theirs to know; only the action
 *  is gated). A non-member still collapses to leak-free not-found. */
export async function resolveHost(ctx: RpgContext, principal: Principal, chatId: ChatId): Promise<RpgAuthorized> {
  const authorized = await resolveMember(ctx, principal, chatId);
  assertHostRole(authorized.role, "host authority required");
  return authorized;
}

/** A member's self-write check: the target actor ref must be the caller's OWN `user` ref. A host bypasses this
 *  (it holds every plane). Throws `DomainForbidden` on a foreign/non-user ref for a member. The host arm is a
 *  BYPASS, not a gate (it grants, never denies), so it is the one comparison here that is not an assert. */
export function assertOwnUserRef(role: ParticipantRole, principal: Principal, ref: RpgActorRef): void {
  if (role === "host") {
    return;
  }
  if (ref.kind !== "user" || ref.userId !== principal.userId) {
    throw new DomainForbiddenError("a member may write only their own row");
  }
}
