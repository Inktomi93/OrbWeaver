// verb: rewriteGreeting — greeting studio (audit §3). Owner-gated: rewrite the supplied base greeting under
// the caller's `greeting_rewrite` preset template + the composed steer, awaiting ONE bounded side-LLM
// completion. RETURNS the text; NEVER writes (the client appends the accepted result to characters.greetings
// via character.update). Leak-free NOT_FOUND for a non-owner — the owner gate (`loadOwnedCharacterRow`) is
// the chokepoint and fires BEFORE any template read or completion (the cross-tenant sweep's owner-gate probe).

import type { CharacterContext } from "../context";
import { CharacterNotFoundError } from "../contract/errors";
import type { RewriteGreetingParams } from "../contract/params";
import type { CharacterService } from "../contract/service";
import { cardOf, loadOwnedCharacterRow } from "../persistence/queries";
import { buildGreetingPrompt } from "../substrate/greeting-studio";

export function createRewriteGreeting(ctx: CharacterContext): CharacterService["rewriteGreeting"] {
  return async ({ principal, characterId, greeting, steer }: RewriteGreetingParams) => {
    // OWNER GATE FIRST — a non-owner (or missing) row collapses to a leak-free NOT_FOUND before any preset
    // read or LLM spend (the cross-tenant sweep's owner-gate probe path).
    const row = await loadOwnedCharacterRow(ctx.db, principal.userId, characterId);
    if (row === undefined) {
      throw new CharacterNotFoundError(characterId);
    }
    const template = await ctx.resolveGreetingTemplate({ caller: principal, kind: "greeting_rewrite" });
    const prompt = buildGreetingPrompt({ card: cardOf(row), template, steer, base: greeting });
    return ctx.generateGreetingText({ caller: principal, prompt, kind: "greeting_rewrite" });
  };
}
