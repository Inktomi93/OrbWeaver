// domain/character/substrate/embed-text — the card-text PROJECTION: the canonical "what text represents a
// character card" fold, embedded by the indexer (kind='card', lens='card-text'). Pure, zero-I/O, one home.
// Only identity content (name/description/personality/scenario/greetings) is embedded; instruction/meta
// fields are deliberately excluded — they dilute identity signal and hurt card-similarity retrieval.

import type { CharacterCard } from "@orb/contracts/character";
import { swapIdentityMacros } from "@orb/kit/macro";
import { clampToTokenBudget, safeTokenWindow } from "@orb/kit/tokens";

type CardEmbedFields = Pick<CharacterCard, "name" | "description" | "personality" | "scenario" | "greetings">;

// THE CAP IS MEASURED IN TOKENS, NOT IN A CHARS-PER-TOKEN RATIO. This file used to multiply the window by a
// fixed 3.67 chars/token "measured" on English prose and cut UTF-16 units at that char count. The ratio is a
// property of the TEXT, not of the model: CJK, emoji and dense code tokenize near 1 char/token, so a card in
// those scripts produced up to ~3.7× the configured ceiling in tokens and was refused by the engine on every
// indexing attempt — the cap silently did nothing for exactly the cards that needed it.
//
// `@orb/kit/tokens` is the house seam for "cut this to fit a real engine window" (its header names the embed
// clamp and the memory chunker as its callers; the vLLM embed surface sizes off the SAME pair). It counts
// codepoints — every non-ASCII codepoint is one token — and `safeTokenWindow` carries the measured 1.4156×
// headroom between that estimate and a real BPE tokenizer (#187). Capping here still keeps `content_hash`
// consistent with the bytes that actually reach the vector, which is why the cut lives at this projection
// and not only at the provider surface.
//
// The window is not a bare 8192 literal: the caller passes the engine's self-reported value when available,
// else this falls to the single-home env floor (VLLM_EMBED_MAX_MODEL_LEN), which is also the engine's launch
// flag. One home, engine-self-report wins.

/** Strip HTML, collapse runs of whitespace/newlines, trim per line. */
function cleanText(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\n]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

function normalizePlaceholders(text: string, charName: string, userName: string): string {
  // The kit identity-swap helper splices names verbatim (function-replacement form) so a name containing
  // $$/$& is not interpreted as a $-pattern; here both macros project to a literal name (no inversion).
  return swapIdentityMacros(text, { char: charName, user: userName });
}

/** Field ORDER is load-bearing: last-token pooling weights later text less, so identity fields lead.
 *  `maxTokens` is the RESOLVED embed model's window (`EmbeddingCapability.maxInputTokens`, inference program
 *  §10-5); the default is the pooling-window floor a bare unit call sizes off. */
/** The embed window floor when no model is resolved — the pooling engines' 8192 (the pre-program env default). */
const DEFAULT_EMBED_WINDOW_TOKENS = 8192;

export function buildCardEmbedText(card: CardEmbedFields, userName = "User", maxTokens: number = DEFAULT_EMBED_WINDOW_TOKENS): string {
  const budget = safeTokenWindow(maxTokens);
  const name = card.name;
  const first = card.greetings[0]?.text ?? null;
  const alternates = card.greetings.slice(1);

  const field = (label: string, value: string | null): string | null => {
    if (value === null || value.length === 0) {
      return null;
    }
    const cleaned = cleanText(normalizePlaceholders(value, name, userName));
    return cleaned.length > 0 ? `${label}: ${cleaned}` : null;
  };

  const parts: (string | null)[] = [
    name.length > 0 ? `Name: ${name}` : null,
    field("Description", card.description),
    field("Personality", card.personality),
    field("Scenario", card.scenario),
    field("First Message", first),
  ];

  if (alternates.length > 0) {
    const joined = alternates
      .map((g) => cleanText(normalizePlaceholders(g.text, name, userName)))
      .filter((g) => g.length > 0)
      .join("\n---\n");
    if (joined.length > 0) {
      parts.push(`Alternate Greetings:\n${joined}`);
    }
  }

  return clampToTokenBudget(parts.filter((p): p is string => p !== null).join("\n"), budget);
}
