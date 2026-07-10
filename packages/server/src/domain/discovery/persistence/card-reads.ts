// domain/discovery/persistence/card-reads — the READ-ONLY SELECT over the FLAT `characters` card row that the
// distill pass (verbs/distill.ts) summarizes. A downward, read-only `@orb/db` read (the same posture as
// embed-store-reads.ts) — discovery writes NO character row.
//
// CARD TEXT SOURCE (discovery gap doc — the carried decision): read the flat `characters` card row via
// @orb/db (D28 — the card IS the row; a card edit + re-run refreshes the distillation), NOT
// `character_embeddings.sourceText` (that couples distill to the embed indexer's text builder + would skip a
// character embeddings hasn't caught up on). We compose the distill input from the human-authored card fields
// here — enough signal to classify genre/tone/tags without pulling the full embed-text builder.
//
// SYNTHETIC EXCLUSION: per-room group characters (`synthetic=true`) have no real card text and must never be
// distilled (they'd pollute the corpus + stage nonsense tags) — filtered in the WHERE, mirroring
// readOwnedCharacterVectors. OWNER DERIVATION (D23): the row carries its own `ownerId`; the pass stages tags
// under THAT owner (the batch is cross-owner). The optional `ownerId` filter is the on-demand owner-scope
// belt (suggestCharacterTags: a foreign character yields no row → a no-op, never a cross-owner write).

import type { Db } from "@orb/db";
import { characters } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";

// One character's distill input — the flat-row identity + the composed card text. `ownerId` is the row's own
// owner (D23); `text` is empty when the card has no describable content (the pass skips it). File-local +
// NON-exported (consumers infer it — the `no-inline-types`/§7.4 persistence-row posture of embed-store-reads).
interface CardDistillTarget {
  readonly characterId: CharacterId;
  readonly ownerId: UserId;
  readonly text: string;
}

/** Read the flat card text for every non-synthetic character (batch) or ONE owned character (on-demand). The
 *  `characterId`/`ownerId` filter narrows the scan for the on-demand `suggestCharacterTags` path (owner-scope
 *  belt: a foreign or missing character returns no row). */
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

/** Compose the distill prompt input from the human-authored card fields, in signal order (identity → premise
 *  → dynamic → opening). Labelled sections so the summarizer can attribute; empty fields are omitted. */
function composeCardText(card: {
  readonly name: string;
  readonly description: string | null;
  readonly personality: string | null;
  readonly scenario: string | null;
  readonly greetings: readonly string[];
  readonly exampleMessages: string | null;
}): string {
  const parts: string[] = [`Name: ${card.name}`];
  const add = (label: string, value: string | null): void => {
    const trimmed = value?.trim();
    if (trimmed) {
      parts.push(`${label}: ${trimmed}`);
    }
  };
  add("Description", card.description);
  add("Personality", card.personality);
  add("Scenario", card.scenario);
  add("Greeting", card.greetings[0] ?? null);
  add("Example dialogue", card.exampleMessages);
  return parts.join("\n\n");
}
