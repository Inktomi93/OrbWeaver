// domain/character/substrate/embed-text — the card-text PROJECTION: the canonical "what text represents a
// character card" fold, embedded by the indexer (kind='card', lens='card-text'). Pure, zero-I/O, one home.
// Only identity content (name/description/personality/scenario/greetings) is embedded; instruction/meta
// fields are deliberately excluded — they dilute identity signal and hurt card-similarity retrieval.

import type { CharacterCard } from "@orb/contracts/character";
import { swapIdentityMacros } from "@orb/kit/macro";
import { replaceAngleSpans } from "@orb/kit/strings";
import { clampToTokenBudget, safeTokenWindow } from "@orb/kit/tokens";

type CardEmbedFields = Pick<CharacterCard, "name" | "description" | "personality" | "scenario" | "greetings">;

// The cap is measured in tokens, never as a chars-per-token ratio: the ratio belongs to the text, not the model, and CJK,
// emoji and dense code tokenize near one char per token. `@orb/kit/tokens` is the house seam for cutting text to a real
// engine window; capping here keeps `content_hash` consistent with the bytes that reach the vector, so the cut lives at
// this projection and not only at the provider surface.
//
// The cap is deliberately not threaded from the resolved engine. `EMBED_WINDOW_TOKENS` is the pooling engines' window;
// the supported encoders run from the unknown-model floor through the curated windows in
// `packages/inference/src/capability/sources/curated/embedders.ts`. This projection is keyed by card id alone (D20) and the
// engine's window belongs to the owner's binding, not to the card. The shipped seed vectors substitute only for the
// local-light encoder (`packages/server/src/domain/embeddings/substrate/seed-embedding.ts`), whose curated windows differ,
// so a threaded cap would re-hash long cards and miss the seeds there. The hosted embed backends clamp what they send to
// the resolved window and log the clamp (`packages/inference/src/backends/openai-compat/embed.ts`,
// `packages/inference/src/backends/google/embed.ts`), so a card past a smaller window is embedded from its head, never
// refused; the local-light encoder windows long text losslessly (`packages/inference/src/backends/local-light/text-windows.ts`).
// `content_hash` is therefore a function of the card alone: a tail edit past a small window re-embeds to the same vector, and
// a window change moves the generation (`capability` is in its identity), which re-embeds under the hash gate anyway.
// A window above the cap leaves the card tail past the cap unembedded; raising the cap is a retrieval choice that
// re-hashes every long card. `tests/server/domain/embeddings/verbs/card-embed-window.int.test.ts` measures how much of a
// capped card the smallest window embeds.

/** Strip HTML, collapse runs of whitespace/newlines, trim per line. */
function cleanText(text: string): string {
  return replaceAngleSpans(text, "", false)
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

/** The embed window floor — the pooling engines' 8192. */
const EMBED_WINDOW_TOKENS = 8192;
/** What `{{user}}` projects to: a card is embedded without any viewer. */
const USER_PLACEHOLDER_NAME = "User";

/** Field order matters: last-token pooling weights later text less, so identity fields lead. */
export function buildCardEmbedText(card: CardEmbedFields): string {
  const budget = safeTokenWindow(EMBED_WINDOW_TOKENS);
  const name = card.name;
  const first = card.greetings[0]?.text ?? null;
  const alternates = card.greetings.slice(1);

  const field = (label: string, value: string | null): string | null => {
    if (value === null || value.length === 0) {
      return null;
    }
    const cleaned = cleanText(normalizePlaceholders(value, name, USER_PLACEHOLDER_NAME));
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
      .map((g) => cleanText(normalizePlaceholders(g.text, name, USER_PLACEHOLDER_NAME)))
      .filter((g) => g.length > 0)
      .join("\n---\n");
    if (joined.length > 0) {
      parts.push(`Alternate Greetings:\n${joined}`);
    }
  }

  return clampToTokenBudget(parts.filter((p): p is string => p !== null).join("\n"), budget);
}
