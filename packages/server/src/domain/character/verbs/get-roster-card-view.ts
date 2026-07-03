import type { MemberCardVisibility } from "@orb/contracts/chat";
import { CharacterNotFoundError } from "../contract/errors";
import type { GetRosterCardViewParams } from "../contract/params";
import type { CharacterContext, CharacterService } from "../contract/service";
import type { MemberCardView } from "../contract/views";
import { loadCharacterWithAvatarById } from "../persistence/queries";

export function createGetRosterCardView(
  ctx: CharacterContext,
): CharacterService["getRosterCardView"] {
  return async ({
    principal,
    chatId,
    characterId,
  }: GetRosterCardViewParams): Promise<MemberCardView> => {
    await ctx.requireParticipant(principal, chatId);

    let visibility: MemberCardVisibility = await ctx.getChatMemberCardVisibility(chatId);

    const row = await loadCharacterWithAvatarById(ctx.db, characterId);
    if (row === undefined) {
      throw new CharacterNotFoundError(characterId);
    }

    // Owner override: an owner always sees full, even when calling through the roster view.
    if (row.character.ownerId === principal.userId) {
      visibility = "full";
    }

    const c = row.character;

    const view: MemberCardView = {
      id: c.id,
      handle: c.handle,
      name: c.name,
      synthetic: c.synthetic,
      avatarHash: row.avatar?.hash ?? null,
    };

    if (visibility === "sheet" || visibility === "sheet+lore" || visibility === "full") {
      Object.assign(view, {
        description: c.description,
        personality: c.personality,
        scenario: c.scenario,
        greetings: c.greetings,
        exampleMessages: c.exampleMessages,
      });
    }

    if (visibility === "sheet+lore" || visibility === "full") {
      Object.assign(view, {
        creatorNotes: c.creatorNotes,
      });
    }

    if (visibility === "full") {
      Object.assign(view, {
        systemPrompt: c.systemPrompt,
        postHistoryInstructions: c.postHistoryInstructions,
        depthPrompt: c.depthPrompt,
      });
    }

    return view;
  };
}
