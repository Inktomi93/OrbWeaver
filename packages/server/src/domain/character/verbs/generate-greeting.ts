// verb: generateGreeting — greeting studio (audit §3). Owner-gated: generate a FRESH greeting under the
// caller's `greeting_new` preset template + the composed steer, awaiting ONE bounded side-LLM completion.
// RETURNS the text; NEVER writes (the client appends the accepted result to characters.greetings via
// character.update). Leak-free NOT_FOUND for a non-owner — the owner gate (`loadOwnedCharacterRow`) fires
// BEFORE any template read or completion (the cross-tenant sweep's owner-gate probe). The `greeting_new`
// template carries no `{{base}}` token (there is no existing greeting to rewrite).

import type { CharacterContext } from "../context.ts";
import { CharacterNotFoundError } from "../contract/errors.ts";
import type { GenerateGreetingParams } from "../contract/params.ts";
import type { CharacterService } from "../contract/service.ts";
import { cardOf, loadOwnedCharacterRow } from "../persistence/queries.ts";
import { buildGreetingPrompt } from "../substrate/greeting-studio.ts";

export function createGenerateGreeting(ctx: CharacterContext): CharacterService["generateGreeting"] {
  return async ({ principal, characterId, steer }: GenerateGreetingParams) => {
    const row = await loadOwnedCharacterRow(ctx.db, principal.userId, characterId);
    if (row === undefined) {
      throw new CharacterNotFoundError(characterId);
    }
    const template = await ctx.resolveGreetingTemplate({ caller: principal, kind: "greeting_new" });
    const prompt = buildGreetingPrompt({ card: cardOf(row), template, steer });
    return ctx.generateGreetingText({ caller: principal, prompt });
  };
}
