// domain/rpg/verbs/promote-actor — promoteActor (the actor-state review §4.3 / §5 R4). THE promotion doorway,
// and `dismissActor`'s exact opposite: dismissal FORGETS a known character, promotion KEEPS her forever. A
// scene NPC the story kept bringing back stops being a scene annotation and becomes a roster CHARACTER — a
// durable card in the host's library, a seat in the room the model can speak from, and one row on the tracker
// plane, RE-KEYED under her new identity with everything the acquaintance wrote still on it.
//
// TWO HALVES, IN THIS ORDER, AND THE ORDER IS THE DESIGN:
//   1. the DURABLE half (`ctx.promoteToRoster`, an injected compose op over the character + chat front doors —
//      rpg owns neither table): mint the card, seat it on the roster, hand back the `CharacterId`;
//   2. the SNAPSHOT half (`writeHandState` + `rekeyActor`): move the actor's row, presence and hand PINS from
//      `cast:<slug>` onto `character:<id>` against the TRUE head, clone-forwarding like every hand door.
// Every REFUSAL that can be decided is decided BEFORE (1) — an untracked target, an actor with no identity, a
// name the roster already carries — so the reachable failure surface after the durable write is a concurrent
// dismissal of the same actor, and that refusal SAYS the card was minted rather than reporting a clean no-op.
// Inverting the order is not available: the re-key's target key IS the id (1) mints.
//
// THE NAME COLLISION IS A REFUSAL, NOT A SUFFIX. The model addresses actors by NAME, and `buildRosterRefIndex`
// is a lowercased name→ref Map — two roster actors sharing a name means one of them silently shadows the other
// and becomes unaddressable by every tool write. So a promotion that would mint the second "Vesna" refuses with
// a sentence the host can act on (rename her first — `patchActor`'s `setIdentityText` is exactly that gesture,
// and the slug key makes it safe). The card HANDLE collides in a different namespace (the host's own library)
// where nothing addresses by it, so the compose impl uniquifies that one silently.
//
// WHAT DOES NOT SURVIVE, AND WHY IT IS NOT A LEAK: the identity HALF. A roster actor carries none by R2 law —
// her name is the chat roster's and her standing prose the sheet's — so the durable content is carried onto the
// CARD in step (1) (display name → `name`, the standing guides → `description`, via the one
// `rpgPromotedCardDescription` home) and `mood`/`relationship` are dropped. The panel's promotion affordance
// names that drop out loud; a host who learns it afterwards learns it as a bug.

import { actorRefKey, rpgCastSlug, rpgPromotedCardDescription } from "@orb/contracts/rpg";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PromoteActorParams } from "../contract/params";
import type { HandDoorResult } from "../contract/results";
import type { RpgContext, RpgService } from "../contract/service";
import { assertHostRole, resolveMember } from "../guard";
import { currentSnapshotState, writeHandState } from "../snapshot-edit";
import { rekeyActor } from "../substrate/actor-rekey";

export function createPromoteActor(ctx: RpgContext): Pick<RpgService, "promoteActor"> {
  async function promoteActor(params: PromoteActorParams): Promise<HandDoorResult> {
    const { game, role } = await resolveMember(ctx, params.principal, params.chatId);
    assertHostRole(ctx.can, params.principal, role, "host authority required to promote an actor to the roster");
    const from = params.targetRef;
    const fromKey = actorRefKey(from);

    // The PRE-DURABLE gate: everything decidable is decided here, so a refusal costs no card and no seat.
    const head = await currentSnapshotState(ctx, game);
    const entry = head.actorState.find((a) => actorRefKey(a.actorRef) === fromKey);
    if (entry === undefined) {
      return { ok: false, reason: `no actor "${fromKey}" in this game's state — nothing to promote` };
    }
    const identity = entry.identity;
    if (identity === undefined) {
      // Unreachable through the wire today (the cast arm is always born with an identity), but a row is only a
      // parsed blob: an identity-less cast row would otherwise mint a nameless card.
      return { ok: false, reason: `"${fromKey}" carries no identity of its own — there is nothing to mint a card from` };
    }
    const name = identity.name.trim();
    const roster = await ctx.resolveRoster(game.chatId);
    if (roster.some((r) => r.name.trim().toLowerCase() === name.toLowerCase())) {
      return {
        ok: false,
        reason: `"${name}" is already on this chat's roster — rename this character first, or the story could only ever address one of them`,
      };
    }

    const minted = await ctx.promoteToRoster({
      chatId: game.chatId,
      // The ROOM HOST, threaded explicitly: this verb gated `role === "host"`, so the caller IS that human, and
      // the card must be minted under them (`resolveRpgRoster` reads roster cards under the host's ownership —
      // a card owned by anyone else resolves to no actor at all).
      hostUserId: params.principal.userId,
      name,
      handle: castId<CharacterHandle>(rpgCastSlug(name)),
      description: rpgPromotedCardDescription(identity),
    });
    if (!minted.ok) {
      return { ok: false, reason: minted.reason };
    }
    const to = { kind: "character", characterId: minted.characterId } as const;

    const written = await writeHandState(ctx, game, (current) => rekeyActor(current, from, to));
    if (!written.ok) {
      // The card + seat DID land (they are durable and this verb is not transactional across domains). Say so:
      // "nothing happened" would send the host looking for a character that is already in their library.
      return { ok: false, reason: `${written.reason} — the card and roster seat were created, but the tracked state could not be moved onto them` };
    }

    // The whole panel re-resolves: she leaves the Scene tab's cast and appears on the Status roster, under the
    // card's name, carrying the state she arrived with (§4.9).
    ctx.emitBus({ type: "snapshotPatched", chatId: params.chatId, snapshotId: written.snapshotId });
    return { ok: true };
  }
  return { promoteActor };
}
