// domain/character/substrate/card-tokens — the ONE card-heft computer. Pure, zero-I/O. DERIVES the ONE
// generic estimator from `@orb/kit/tokens` (`estimateTokens`, the OpenRouter QuadChars algo) — it does NOT
// re-implement counting (no-doubling). Joins the card's free-text fields into one definition string
// (greetings appended), then estimates. Advisory only — billing truth is the provider `usage` post-turn.
//
// WRITE-SIDE (one home): called at every card-content write (create / update / restore / duplicate /
// mint-synthetic, alongside the `contentHash` recompute) to STAMP the `characters.token_size` denorm column.
// The read path (`summaryOf`) reads that column — it never re-estimates per page — and the
// `largestCards`/`smallestCards` library sorts keyset on it (a post-query estimate can't be an ORDER BY).

import type { CharacterCard } from "@orb/contracts/character";
import { estimateTokens } from "@orb/kit/tokens";

/** The card fields that contribute to the heft estimate (the prompt-reaching content). */
type CardTextFields = Pick<
  CharacterCard,
  | "name"
  | "description"
  | "personality"
  | "scenario"
  | "exampleMessages"
  | "systemPrompt"
  | "postHistoryInstructions"
  | "greetings"
>;

/** Advisory token estimate for a card's definition (name + the free-text fields + every greeting). */
export function cardTokenSize(card: CardTextFields): number {
  const definition = [
    card.name,
    card.description,
    card.personality,
    card.scenario,
    card.exampleMessages,
    card.systemPrompt,
    card.postHistoryInstructions,
    ...card.greetings,
  ]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .join("\n");
  return estimateTokens(definition);
}
