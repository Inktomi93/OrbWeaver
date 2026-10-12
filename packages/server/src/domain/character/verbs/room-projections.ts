// The deployment ceiling remains authoritative; missing or unreadable cards project only its safe floor.
import { resolveRenderPolicy } from "@orb/contracts/chat";
import type { CharacterRoomProjectionDeps, CharacterRoomProjections } from "../contract/room-projections.ts";
/** Resolve tags and roster decoration through character-owned reads. */
export function createCharacterRoomProjections(deps: CharacterRoomProjectionDeps): CharacterRoomProjections {
  return {
    // D22 member card — accepted tag identities under the host's ownership. Resolved
    // through the character domain (chat stays character-table-blind, the getCard precedent); a gone card
    // fail-closes to [] rather than throwing into the member-card read.
    resolveCharacterTags: async ({ ownerId, characterId }): ReturnType<CharacterRoomProjections["resolveCharacterTags"]> => {
      // @orb-waive caught-failure-ownership(catch): FAIL-CLOSED — documented above: a gone card fail-closes to `[]` rather than throwing into the member-card read. Ends if a gone card needs to surface distinctly from an infra failure.
      try {
        const detail = await deps.get({ principal: deps.principalForUser(ownerId), characterId });
        return detail.tags.map(({ id, name }) => ({ id, name }));
      } catch {
        return [];
      }
    },
    // ONE character read → the whole per-seat decoration (render policy layered over the deployment floor,
    // the raw theme + background override columns, and the card name/avatar). A human/agent seat, no host,
    // or an unreadable card resolves to the bare global floor + a null card (fail-closed, never a throw into
    // roster assembly). Collapses what were four separate reads of the same `characters` row per participant.
    // The tier combine is the ONE contracts resolver (`resolveRenderPolicy`) — external media is
    // TIGHTEN-ONLY there, so a card's `forbidExternalMedia: false` can never widen past a blocking
    // deployment (which the app-document CSP enforces independently), and the ladder's top rung needs the
    // `allowInteractiveCards` ceiling, which is also the default rung of a card that inherits.
    resolveSeatDeco: async ({ ownerId, characterId }): ReturnType<CharacterRoomProjections["resolveSeatDeco"]> => {
      const floor = deps.readRenderPolicy();
      // The deployment floor AS A RESOLVED policy — what a seat with no readable card gets. Produced by the
      // SAME resolver with no override rather than hand-built, so the no-card arm can never spell a step
      // the resolver would not (#111: the html-trust ladder is folded in exactly one place).
      const resolvedFloor = resolveRenderPolicy(floor, null);
      if (characterId === null || ownerId === null) {
        return { renderPolicy: resolvedFloor, themeOverride: null, backgroundOverride: null, card: null };
      }
      // @orb-waive caught-failure-ownership(catch): FAIL-CLOSED — the comment block above states
      // the contract: a no-host/unreadable-card seat resolves to the bare global floor + a null card, never
      // a throw into roster assembly. Ends if an unreadable card needs to surface distinctly from absence.
      try {
        const detail = await deps.get({ principal: deps.principalForUser(ownerId), characterId });
        return {
          renderPolicy: resolveRenderPolicy(floor, detail),
          themeOverride: detail.themeOverride,
          backgroundOverride: detail.backgroundOverride,
          card: { name: detail.name, avatarAssetId: detail.avatarAssetId },
        };
      } catch {
        return { renderPolicy: resolvedFloor, themeOverride: null, backgroundOverride: null, card: null };
      }
    },
    resolveSeatDecos: async ({ ownerId, characterIds }): ReturnType<CharacterRoomProjections["resolveSeatDecos"]> => {
      const floor = deps.readRenderPolicy();
      const cards = await deps.loadSeatCards(ownerId, characterIds);
      return new Map(
        cards.map((card) => [
          card.id,
          {
            renderPolicy: resolveRenderPolicy(floor, card),
            themeOverride: card.themeOverride,
            backgroundOverride: card.backgroundOverride,
            card: { name: card.name, avatarAssetId: card.avatarAssetId },
          },
        ]),
      );
    },
  };
}
