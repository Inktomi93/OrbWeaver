// domain/character/substrate/embed-text — the card-text PROJECTION: the canonical "what text represents a
// character card" fold, embedded by the embeddings indexer (`store(kind='card', lens='card-text')`). Pure,
// zero-I/O. This is the ONE home for the projection (no doubling) — `loadCardText` reads the card row and
// runs it through here; the indexer never re-spells the field set.
//
// SCOPE vs neo: neo's `corpus/substrate/embed-text.ts:buildCardEmbedText` also folded in `tags`/`proposedTags`.
// In orbweaver `character_tags` is a `tag`-owned junction (NOT a card column), and `loadCardText` is an
// un-principal SYSTEM by-id read of the card ROW alone (D20) — it never reaches sideways into the tag domain.
// So the projection is the card's intrinsic identity fields only. Only character-IDENTITY content is embedded
// (name/description/personality/scenario/greetings) — instruction/meta fields (exampleMessages, systemPrompt,
// postHistoryInstructions, creatorNotes) are deliberately excluded: they dilute the identity signal and hurt
// card-similarity retrieval (they're still stored + directly retrievable, just not in the embed text).

import type { CharacterCard } from "@orb/contracts/character";

/** The card fields that form the embeddable identity text. `greetings[0]` is the first message; the rest are
 *  alternate greetings (the unified `greetings` array, D28). */
type CardEmbedFields = Pick<
  CharacterCard,
  "name" | "description" | "personality" | "scenario" | "greetings"
>;

// Coarse char budget mirroring the embed model's window (Qwen3-VL-Embedding is served at --max-model-len 8192
// and truncates there regardless). 3.67 chars/token measured on the real RP corpus. Capping here keeps the
// content_hash (computed by `embeddings.store` over this exact text) consistent with the bytes that actually
// influence the vector — an uncapped string would hash over text the backend silently drops, causing spurious
// re-embeds on edits past the window.
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

/** Replace ST placeholders: `{{char}}` → the character name; `{{user}}` → a generic user name (there is no
 *  persona context at index time, so the neutral "User" is correct). Case-insensitive. */
function normalizePlaceholders(text: string, charName: string, userName: string): string {
  return text.replace(/\{\{char\}\}/gi, charName).replace(/\{\{user\}\}/gi, userName);
}

/**
 * Assemble a card's embeddable identity text. Field ORDER is load-bearing: last-token pooling weights later
 * text less, so the most identifying fields lead (name → description → personality → scenario → first
 * message → alternate greetings). Null/empty fields drop out entirely. Capped codepoint-safe to the embed
 * window. `{{char}}`/`{{user}}` are normalized so the embedded text reads as prose, not template.
 */
export function buildCardEmbedText(card: CardEmbedFields, userName = "User"): string {
  const name = card.name;
  const first = card.greetings[0] ?? null;
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
      .map((g) => cleanText(normalizePlaceholders(g, name, userName)))
      .filter((g) => g.length > 0)
      .join("\n---\n");
    if (joined.length > 0) {
      parts.push(`Alternate Greetings:\n${joined}`);
    }
  }

  return truncateAtCodepoint(
    parts.filter((p): p is string => p !== null).join("\n"),
    MAX_EMBED_CHARS,
  );
}
