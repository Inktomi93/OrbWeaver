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
    // 1. Membership gate
    await ctx.requireParticipant(principal, chatId);

    // 2. Load visibility config
    let visibility: MemberCardVisibility = await ctx.getChatMemberCardVisibility(chatId);

    // 3. Load character
    const row = await loadCharacterWithAvatarById(ctx.db, characterId);
    if (row === undefined) {
      throw new CharacterNotFoundError(characterId);
    }

    // 4. Owner-override (an owner always sees full, even when calling through the roster view)
    if (row.character.ownerId === principal.userId) {
      visibility = "full";
    }

    const c = row.character;

    // Base fields (name-avatar floor)
    const view: MemberCardView = {
      id: c.id,
      handle: c.handle,
      name: c.name,
      synthetic: c.synthetic,
      avatarHash: row.avatar?.hash ?? null,
    };

    // Level: sheet
    if (visibility === "sheet" || visibility === "sheet+lore" || visibility === "full") {
      Object.assign(view, {
        description: c.description,
        personality: c.personality,
        scenario: c.scenario,
        greetings: c.greetings,
        exampleMessages: c.exampleMessages,
      });
    }

    // Level: sheet+lore
    if (visibility === "sheet+lore" || visibility === "full") {
      Object.assign(view, {
        creatorNotes: c.creatorNotes,
      });
    }

    // Level: full
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
