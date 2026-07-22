// domain/character/substrate/embed-text — the card-text PROJECTION: the canonical "what text represents a
// character card" fold, embedded by the indexer (kind='card', lens='card-text'). Pure, zero-I/O, one home.
// Only identity content (name/description/personality/scenario/greetings) is embedded; instruction/meta
// fields are deliberately excluded — they dilute identity signal and hurt card-similarity retrieval.

import type { CharacterCard } from "@orb/contracts/character";

type CardEmbedFields = Pick<CharacterCard, "name" | "description" | "personality" | "scenario" | "greetings">;

// Char budget mirrors the embed model's window (8192 tokens, 3.67 chars/token measured). Capping here keeps
// content_hash consistent with the bytes that actually reach the vector, avoiding spurious re-embeds.
const APPROX_CHARS_PER_TOKEN = 3.67;
const EMBED_MAX_TOKENS = 8192;
const MAX_EMBED_CHARS = Math.floor(EMBED_MAX_TOKENS * APPROX_CHARS_PER_TOKEN);

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

/** Field ORDER is load-bearing: last-token pooling weights later text less, so identity fields lead. */
export function buildCardEmbedText(card: CardEmbedFields, userName = "User"): string {
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

  return truncateAtCodepoint(parts.filter((p): p is string => p !== null).join("\n"), MAX_EMBED_CHARS);
}
