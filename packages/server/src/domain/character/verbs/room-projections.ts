// The deployment ceiling remains authoritative; missing or unreadable cards project only its safe floor.
// A gone or foreign card (one leak-free `CharacterNotFoundError`) is the only miss; any other fault rejects into the
// read that asked.
import { resolveSeatRenderPolicy } from "@orb/contracts/chat";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterRoomProjectionDeps, CharacterRoomProjections } from "../contract/room-projections.ts";

function rethrowUnlessGone(error: unknown): void {
  if (!(error instanceof DomainNotFoundError)) {
    throw error;
  }
}

/** Resolve tags and roster decoration through character-owned reads. */
export function createCharacterRoomProjections(deps: CharacterRoomProjectionDeps): CharacterRoomProjections {
  return {
    // D22 member card — accepted tag identities under the host's ownership. Resolved
    // through the character domain (chat stays character-table-blind, the getCard precedent); a gone card
    // fail-closes to [] rather than throwing into the member-card read.
    resolveCharacterTags: async ({ ownerId, characterId }): ReturnType<CharacterRoomProjections["resolveCharacterTags"]> => {
      try {
        const detail = await deps.get({ principal: deps.principalForUser(ownerId), characterId });
        return detail.tags.map(({ id, name }) => ({ id, name }));
      } catch (error) {
        rethrowUnlessGone(error);
        return [];
      }
    },
    // ONE character read → the whole per-seat decoration (render policy layered over the deployment floor,
    // the raw theme + background override columns, and the card name/avatar). A human/agent seat, no host,
    // or a gone card resolves to Plain text + a null card (fail-closed, never a throw into roster assembly). Collapses what were four separate reads of the same `characters` row per participant.
    // The tier combine is the ONE contracts resolver (`resolveSeatRenderPolicy`, over `resolveRenderPolicy`) — external media is
    // TIGHTEN-ONLY there, so a card's `forbidExternalMedia: false` can never widen past a blocking
    // deployment (which the app-document CSP enforces independently), and the ladder's top step needs the install's
    // `defaultHtmlStep` at Interactive, which is also the step of a card that inherits.
    resolveSeatDeco: async ({ ownerId, characterId }): ReturnType<CharacterRoomProjections["resolveSeatDeco"]> => {
      const floor = deps.readRenderPolicy();
      // A seat with no readable card gets Plain text from the SAME resolver, never a hand-built policy.
      const bare = (basis: "no-card" | "no-host"): Awaited<ReturnType<CharacterRoomProjections["resolveSeatDeco"]>> => ({
        ...resolveSeatRenderPolicy(floor, basis),
        themeOverride: null,
        backgroundOverride: null,
        card: null,
      });
      if (characterId === null) {
        return bare("no-card");
      }
      if (ownerId === null) {
        return bare("no-host");
      }
      try {
        const detail = await deps.get({ principal: deps.principalForUser(ownerId), characterId });
        return {
          ...resolveSeatRenderPolicy(floor, detail),
          themeOverride: detail.themeOverride,
          backgroundOverride: detail.backgroundOverride,
          card: { name: detail.name, avatarAssetId: detail.avatarAssetId },
        };
      } catch (error) {
        rethrowUnlessGone(error);
        return bare("no-card");
      }
    },
    resolveSeatDecos: async ({ ownerId, characterIds }): ReturnType<CharacterRoomProjections["resolveSeatDecos"]> => {
      const floor = deps.readRenderPolicy();
      const cards = await deps.loadSeatCards(ownerId, characterIds);
      return new Map(
        cards.map((card) => [
          card.id,
          {
            ...resolveSeatRenderPolicy(floor, card),
            themeOverride: card.themeOverride,
            backgroundOverride: card.backgroundOverride,
            card: { name: card.name, avatarAssetId: card.avatarAssetId },
          },
        ]),
      );
    },
  };
}
