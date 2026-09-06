// domain/rpg/verbs/promote-actor — promoteActor (the actor-state review §4.3 / §5 R4). THE promotion doorway,
// and `dismissActor`'s exact opposite: dismissal FORGETS a known character, promotion KEEPS her forever. A
// scene NPC the story kept bringing back stops being a scene annotation and becomes a roster CHARACTER — a
// durable card in the host's library, a seat in the room the model can speak from, and one row on the tracker
// plane, RE-KEYED under her new identity with everything the acquaintance wrote still on it.
//
// TWO HALVES, IN THIS ORDER, AND THE ORDER IS THE DESIGN:
//   1. the DURABLE half (`ctx.promoteToRoster`, an injected compose op over the character + chat front doors —
//      rpg owns neither table): resolve-or-mint the marked card, ensure its roster seat, hand back the `CharacterId`;
//   2. the SNAPSHOT half (`writeHandState` + `rekeyActor`): move the actor's row, presence and hand PINS from
//      `npc:<slug>` onto `character:<id>` against the TRUE head, clone-forwarding like every hand door.
// Every REFUSAL that can be decided is decided before a NEW card write — an untracked target, an actor with no
// identity, or a name the roster already carries. Step (1) carries a stable promotion marker and each half is
// idempotent, so an interruption after card or seat creation resumes those same rows and reaches the re-key.
// Inverting the order is not available: the re-key's target key IS the id (1) resolves or mints.
//
// THE NAME COLLISION IS A REFUSAL, NOT A SUFFIX. The model addresses actors by NAME, and `buildActorRefIndex`
// is a lowercased name→ref Map — two roster actors sharing a name means one of them silently shadows the other
// and becomes unaddressable by every tool write. So a promotion that would mint the second "Vesna" refuses with
// a sentence the host can act on (rename her first — `patchActor`'s `setIdentityText` is exactly that gesture,
// and the slug key makes it safe). The card HANDLE collides in a different namespace (the host's own library)
// where nothing addresses by it, so the compose impl uniquifies that one silently — and because that
// namespace belongs to the character domain, the handle is minted by THAT namespace's engine
// (`slugifyHandle`), never by the actor-key engine (#1386; the reasoning sits on the mint below).
//
// WHAT DOES NOT SURVIVE, AND WHY IT IS NOT A LEAK: the identity HALF. A roster actor carries none by R2 law —
// her name is the chat roster's and her standing prose the sheet's — so the durable content is carried onto the
// CARD in step (1) (display name → `name`, the standing guides → `description`, via the one
// `rpgPromotedCardDescription` home) and `mood`/`relationship` are dropped. The panel's promotion affordance
// names that drop out loud; a host who learns it afterwards learns it as a bug.

import { actorRefKey, clampActorCardName, rpgPromotedCardDescription } from "@orb/contracts/rpg";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { slugifyHandle } from "@orb/kit/slug";
import type { PromoteActorParams } from "../contract/params.ts";
import type { PromoteActorResult } from "../contract/results.ts";
import type { RpgContext, RpgService } from "../contract/service.ts";
import { assertHostRole, resolveMember } from "../guard.ts";
import { currentSnapshotState, writeHandState } from "../snapshot-edit.ts";
import { rekeyActor } from "../substrate/actor-rekey.ts";

export function createPromoteActor(ctx: RpgContext): Pick<RpgService, "promoteActor"> {
  async function promoteActor(params: PromoteActorParams): Promise<PromoteActorResult> {
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
      // parsed blob: an identity-less npc row would otherwise mint a nameless card.
      return { ok: false, reason: `"${fromKey}" carries no identity of its own — there is nothing to mint a card from` };
    }
    const rawName = identity.name.trim();
    // THE CARD-NAME BOUND (#1449) — clamped here, on the RECEIVING side's own terms, exactly like the handle
    // above (#1386): `rawName` is model-authored at the extraction boundary with no max, and
    // `cardFaceFields.name` caps at `CARD_FACE_LIMITS.nameMax`. A refusal here would drop a model-authored
    // actor from canon over a name, so the mint CLAMPS instead (`clampActorCardName`, `contracts/rpg/actor.ts`)
    // and reports the cut back as data (`issues`) rather than it vanishing silently into a shortened card.
    const { value: name, truncated: nameTruncated } = clampActorCardName(rawName);
    const roster = await ctx.resolveRoster(game.chatId);

    const minted = await ctx.promoteToRoster({
      chatId: game.chatId,
      // The ROOM HOST, threaded explicitly: this verb gated `role === "host"`, so the caller IS that human, and
      // the card must be minted under them (`resolveRpgRoster` reads roster cards under the host's ownership —
      // a card owned by anyone else resolves to no actor at all).
      hostUserId: params.principal.userId,
      sourceActorKey: fromKey,
      roster,
      name,
      // THE HANDLE IS THE CHARACTER NAMESPACE'S, SO ITS OWN ENGINE MINTS IT (#1386). `rpgNpcSlug` is the
      // ACTOR-KEY engine — its whole job is "never merge two people", so it is NFC-preserving, keeps every
      // mark and NEVER truncates. A card handle answers to different law: the per-owner
      // `characters_owner_handle_unique` index and the 200-char wire cap on `createCharacterSchema.handle`,
      // which is what `slugifyHandle` (the handle namespace's one home) folds and bounds for. Minting with
      // the actor engine let a model-authored NPC name — `rpgActorIdentitySchema.name` carries NO max —
      // produce a handle the character namespace's own create schema refuses, i.e. a row no import could
      // ever re-create. The two engines deliberately stay separate (`rpgNpcSlug`'s header states why);
      // what crosses here is the VALUE, minted on the receiving side's terms. Minted from `rawName`, never the
      // display-clamped `name`: `slugifyHandle` folds + bounds independently (its own `MAX_FOLDED_POINTS`), so
      // truncating twice would only shorten the handle's disambiguator for no reason.
      handle: castId<CharacterHandle>(slugifyHandle(rawName)),
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
    return {
      ok: true,
      issues: nameTruncated
        ? [`"${rawName}" was shortened to "${name}" to fit the card name limit — the model wrote a longer name than the card wire allows`]
        : [],
    };
  }
  return { promoteActor };
}
