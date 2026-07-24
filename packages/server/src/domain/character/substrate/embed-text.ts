// domain/character/substrate/embed-text — the card-text PROJECTION: the canonical "what text represents a
// character card" fold, embedded by the indexer (kind='card', lens='card-text'). Pure, zero-I/O, one home.
// Only identity content (name/description/personality/scenario/greetings) is embedded; instruction/meta
// fields are deliberately excluded — they dilute identity signal and hurt card-similarity retrieval.

import type { CharacterCard } from "@orb/contracts/character";
import { env } from "#foundation/env";

type CardEmbedFields = Pick<CharacterCard, "name" | "description" | "personality" | "scenario" | "greetings">;

// Char budget mirrors the embed model's window (3.67 chars/token measured). Capping here keeps content_hash
// consistent with the bytes that actually reach the vector, avoiding spurious re-embeds. The window is NO
// LONGER a bare 8192 literal — it is the embed engine's effective window: the caller passes the
// self-reported value when available, else this falls to the single-home env floor
// (VLLM_EMBED_MAX_MODEL_LEN), which is also the engine's launch flag. One home, engine-self-report wins.
const APPROX_CHARS_PER_TOKEN = 3.67;

// UTF-16 high-surrogate range — the leading half of an astral-codepoint pair.
const HIGH_SURROGATE_MIN = 0xd8_00;
const HIGH_SURROGATE_MAX = 0xdb_ff;

/** Truncate to at most `maxChars` UTF-16 units WITHOUT splitting a surrogate pair — a blind `.slice(0, n)`
 *  can cut an astral codepoint (emoji etc.) in half, feeding a lone high surrogate to the tokenizer. */
function truncateAtCodepoint(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  let end = maxChars;
  const last = text.charCodeAt(end - 1);
  if (last >= HIGH_SURROGATE_MIN && last <= HIGH_SURROGATE_MAX) {
    end -= 1; // high surrogate — its low half got cut off
  }
  return text.slice(0, end);
}

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
  // Function-replacement form: a name containing $$/$& must splice verbatim (string form interprets $-patterns).
  return text.replace(/\{\{char\}\}/gi, () => charName).replace(/\{\{user\}\}/gi, () => userName);
}

/** Field ORDER is load-bearing: last-token pooling weights later text less, so identity fields lead.
 *  `maxTokens` is the embed engine's effective window (self-report ⊕ env floor); defaulted to the env floor
 *  so a bare unit call (and every existing pure test) sizes off the single-home window, never a literal. */
export function buildCardEmbedText(card: CardEmbedFields, userName = "User", maxTokens: number = env.VLLM_EMBED_MAX_MODEL_LEN): string {
  const maxEmbedChars = Math.floor(maxTokens * APPROX_CHARS_PER_TOKEN);
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

  return truncateAtCodepoint(parts.filter((p): p is string => p !== null).join("\n"), maxEmbedChars);
}
