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
  return rows.map((r) => ({
    characterId: r.characterId,
    ownerId: r.ownerId,
    text: composeCardText(r),
  }));
}

function composeCardText(card: {
  readonly name: string;
  readonly description: string | null;
  readonly personality: string | null;
  readonly scenario: string | null;
  readonly greetings: readonly Greeting[];
  readonly exampleMessages: string | null;
}): string {
  const parts: string[] = [`Name: ${card.name}`];
  const add = (label: string, value: string | null): void => {
    const trimmed = value?.trim();
    if (trimmed !== undefined && trimmed !== "") {
      parts.push(`${label}: ${trimmed}`);
    }
  };
  add("Description", card.description);
  add("Personality", card.personality);
  add("Scenario", card.scenario);
  add("Greeting", card.greetings[0]?.text ?? null);
  add("Example dialogue", card.exampleMessages);
  return parts.join("\n\n");
}
