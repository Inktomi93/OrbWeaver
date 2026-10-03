// domain/chat/engine/character-line — the ONE "who is this" line both Smart pickers describe a character with:
// the reranker's document and the Utility arbiter's candidate line. Uncapped here; each consumer clamps it to
// its own token budget. Never the full card: a long card drowns a small model and truncates a reranker silently.

import type { CharacterCard } from "@orb/contracts/character";
import { processMacros } from "@orb/kit/macro";
import { DEFAULT_PERSONA_NAME } from "@orb/kit/persona";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import type { CharacterDistillate } from "../contract/arbitration.ts";

/** How many leading sentences of an undistilled card's text stand in for a pitch. */
const HEURISTIC_SENTENCES = 2;

const SENTENCES = new Intl.Segmenter(undefined, { granularity: "sentence" });

function leadingSentences(text: string): string {
  return [...SENTENCES.segment(text)]
    .slice(0, HEURISTIC_SENTENCES)
    .map((s) => s.segment)
    .join("")
    .trim();
}

// `?? ""` as well as the null type: a minimal card double (or a sparse import) can omit a field entirely.
const filled = (text: string | null | undefined): text is string => (text ?? "").trim().length > 0;

function sourceText(card: Pick<CharacterCard, "description" | "personality">, distillate: CharacterDistillate | undefined): string {
  const pitch = distillate?.elevatorPitch;
  if (filled(pitch)) {
    return pitch.trim();
  }
  const prose = [card.personality, card.description].find(filled);
  return prose !== undefined ? leadingSentences(prose) : (distillate?.tags ?? []).join(", ");
}

/**
 * Who this character is, in a line: the distilled elevator pitch; else the first sentences of the card's
 * personality, then its description; else its distilled tags. A blank card gives `""`, so the consumer shows the
 * name alone. Macros render against the card's own name, so no `{{char}}` braces reach the model.
 */
export function characterLine(
  card: Pick<CharacterCard, "name" | "description" | "personality"> | null,
  distillate: CharacterDistillate | undefined,
  nowMs: number,
): string {
  if (card === null) {
    return "";
  }
  const text = sourceText(card, distillate);
  if (text.length === 0) {
    return "";
  }
  return processMacros(text, { char: card.name, user: DEFAULT_PERSONA_NAME, persona: "", scenario: "", timezone: UTC_TIME_ZONE, nowMs, env: {} });
}
