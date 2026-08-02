// domain/discovery/persistence/card-reads — read-only SELECT over the flat characters card row that the
// distill pass summarizes; discovery writes no character row. Reads the flat card row directly (not
// character_embeddings.sourceText, which would couple distill to the embed indexer's text builder).
// Synthetic (per-room group) characters are excluded — they have no real card text.

import type { Greeting } from "@orb/contracts/character";
import type { Db } from "@orb/db";
import { characters } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";

interface CardDistillTarget {
  readonly characterId: CharacterId;
  readonly ownerId: UserId;
  readonly text: string;
  /** The card carries WRITING — at least one of description / personality / scenario / first greeting /
   *  example dialogue is non-blank. The distill pass's readiness floor: `text` is never empty (it always
   *  opens with the `Name:` line), so a length check on it can never reject anything, and a name-only card
   *  would be summarized under a schema REQUIRING genre/tone/setting/pitch/overview/3-8 tags — every facet
   *  invented from a name. This flag is what makes that refusable (owner ruling 2026-08-03). */
  readonly hasContent: boolean;
}

/** Read the flat card text for every non-synthetic character (batch) or one owned character (on-demand). */
export async function readCardDistillTargets(
  db: Db,
  filter: { readonly characterId?: CharacterId; readonly ownerId?: UserId } = {},
): Promise<CardDistillTarget[]> {
  const conds = [eq(characters.synthetic, false)];
  if (filter.characterId !== undefined) {
    conds.push(eq(characters.id, filter.characterId));
  }
  if (filter.ownerId !== undefined) {
    conds.push(eq(characters.ownerId, filter.ownerId));
  }
  const rows = await db
    .select({
      characterId: characters.id,
      ownerId: characters.ownerId,
      name: characters.name,
      description: characters.description,
      personality: characters.personality,
      scenario: characters.scenario,
      greetings: characters.greetings,
      exampleMessages: characters.exampleMessages,
    })
    .from(characters)
    .where(and(...conds));
  return rows.map((r) => {
    const { text, contentParts } = composeCardText(r);
    return {
      characterId: r.characterId,
      ownerId: r.ownerId,
      text,
      hasContent: contentParts > 0,
    };
  });
}

/** The card's prompt text PLUS how many CONTENT sections it carries (the `Name:` line is not one). The count
 *  is returned rather than re-derived by the caller so the "is there anything here?" verdict and the text it
 *  is a verdict ABOUT are built in one place — a caller re-checking the raw columns would drift from the
 *  labels actually sent to the summarizer. */
function composeCardText(card: {
  readonly name: string;
  readonly description: string | null;
  readonly personality: string | null;
  readonly scenario: string | null;
  readonly greetings: readonly Greeting[];
  readonly exampleMessages: string | null;
}): { readonly text: string; readonly contentParts: number } {
  const parts: string[] = [`Name: ${card.name}`];
  let contentParts = 0;
  const add = (label: string, value: string | null): void => {
    const trimmed = value?.trim();
    if (trimmed !== undefined && trimmed !== "") {
      parts.push(`${label}: ${trimmed}`);
      contentParts += 1;
    }
  };
  add("Description", card.description);
  add("Personality", card.personality);
  add("Scenario", card.scenario);
  add("Greeting", card.greetings[0]?.text ?? null);
  add("Example dialogue", card.exampleMessages);
  return { text: parts.join("\n\n"), contentParts };
}
