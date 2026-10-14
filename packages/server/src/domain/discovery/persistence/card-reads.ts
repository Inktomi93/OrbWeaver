// domain/discovery/persistence/card-reads — read-only SELECTs over the flat characters card row that the
// distill pass summarizes; discovery writes no character row. Reads the flat card row directly (not
// character_embeddings.sourceText, which would couple distill to the embed indexer's text builder).
// Synthetic (per-room group) characters are excluded — they have no real card text.
//
// IDENTITY LIVES HERE, NOT IN `summary-reads` (issue #154). A card's DISPLAY name + face are properties of
// the `characters` row and exist the moment it is imported; its genre/tone/tags are the distill pass's
// output and exist only after that pass runs. Every embedding-driven view (archetypes · projection ·
// similarity graph) had been resolving BOTH from `readOwnedCardFacets`, which is rooted at
// `character_summaries` — so on a freshly-imported, un-distilled library every one of those views clustered
// 327 real characters and then printed "Unknown" beside every single one, because the identity read could
// only see cards the distill pass had already reached. Splitting the two reads is the fix: identity from
// `characters` (this file), facets from `character_summaries` (that one).

import { greetingsColumnSchema } from "@orb/contracts/character";
import type { EveryOwnerEstimate, EveryOwnerRun, WorkloadEstimateScope } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import { assets, characters } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import type { DistillTargetNarrow } from "../contract/params.ts";

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

interface CardDisplayRow {
  readonly characterId: CharacterId;
  readonly name: string;
  /** The CAS hash of the card's CURRENT avatar, or `null` when it has none. LEFT-joined: an inner join would
   *  delete every faceless card from the views this read dresses. */
  readonly avatarHash: string | null;
}

/**
 * Every non-synthetic card the owner holds, as DISPLAY IDENTITY — the name and the face, and nothing the
 * distill pass produces. This is the join the embedding-driven views need: they cluster over
 * `character_embeddings`, which the indexer fills on import, so their member set is every INDEXED card and
 * their identity read has to cover exactly that set rather than the distilled subset of it.
 */
export async function readOwnedCardDisplay(db: Db, ownerId: UserId): Promise<CardDisplayRow[]> {
  return await db
    .select({
      characterId: characters.id,
      name: characters.name,
      avatarHash: assets.hash,
    })
    .from(characters)
    .leftJoin(assets, eq(assets.id, characters.avatarAssetId))
    .where(and(eq(characters.ownerId, ownerId), eq(characters.synthetic, false)));
}

const distillCardFields = {
  characterId: characters.id,
  ownerId: characters.ownerId,
  name: characters.name,
  description: characters.description,
  personality: characters.personality,
  scenario: characters.scenario,
  greetings: characters.greetings,
  exampleMessages: characters.exampleMessages,
};

type DistillCardRow = {
  readonly characterId: CharacterId;
} & Pick<typeof characters.$inferSelect, "ownerId" | "name" | "description" | "personality" | "scenario" | "greetings" | "exampleMessages">;

function materializeDistillTargets(rows: readonly DistillCardRow[]): CardDistillTarget[] {
  return rows.map((r) => {
    const { text, contentParts } = composeCardText(r);
    return { characterId: r.characterId, ownerId: r.ownerId, text, hasContent: contentParts > 0 };
  });
}

async function readOwnedCardDistillTargets(
  db: Db,
  filter: { readonly ownerId: UserId; readonly characterId?: CharacterId | undefined },
): Promise<CardDistillTarget[]> {
  const rows = await db
    .select(distillCardFields)
    .from(characters)
    .where(
      and(
        eq(characters.synthetic, false),
        eq(characters.ownerId, filter.ownerId),
        filter.characterId === undefined ? undefined : eq(characters.id, filter.characterId),
      ),
    );
  return materializeDistillTargets(rows);
}

async function readEveryOwnerCardDistillTargets(db: Db, _run: EveryOwnerRun): Promise<CardDistillTarget[]> {
  const rows = await db.select(distillCardFields).from(characters).where(eq(characters.synthetic, false));
  return materializeDistillTargets(rows);
}

/** Required scope keeps a caller's card id paired with its owner and every-owner execution with its run. */
export function readCardDistillTargets(db: Db, filter: DistillTargetNarrow): Promise<CardDistillTarget[]> {
  return filter.ownerId === null ? readEveryOwnerCardDistillTargets(db, filter.everyOwnerRun) : readOwnedCardDistillTargets(db, filter);
}

async function countEveryOwnerDistillTargets(db: Db, _estimate: EveryOwnerEstimate): Promise<number> {
  const rows = await db.select(distillCardFields).from(characters).where(eq(characters.synthetic, false));
  return materializeDistillTargets(rows).filter((target) => target.hasContent).length;
}

/** Estimates share the pass's content predicate without acquiring permission to run it. */
export async function countCardDistillTargets(db: Db, scope: UserId | WorkloadEstimateScope): Promise<number> {
  const selected = typeof scope === "string" ? { ownerId: scope } : scope;
  return selected.ownerId === null
    ? countEveryOwnerDistillTargets(db, selected.everyOwnerEstimate)
    : (await readOwnedCardDistillTargets(db, selected)).filter((target) => target.hasContent).length;
}

/** The card's prompt text PLUS how many CONTENT sections it carries (the `Name:` line is not one). The count
 *  is returned rather than re-derived by the caller so the "is there anything here?" verdict and the text it
 *  is a verdict ABOUT are built in one place — a caller re-checking the raw columns would drift from the
 *  labels actually sent to the summarizer. */
function composeCardText(card: Pick<typeof characters.$inferSelect, "name" | "description" | "personality" | "scenario" | "greetings" | "exampleMessages">): {
  readonly text: string;
  readonly contentParts: number;
} {
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
  const greetings = greetingsColumnSchema.parse(card.greetings);
  add("Greeting", greetings[0]?.text ?? null);
  add("Example dialogue", card.exampleMessages);
  return { text: parts.join("\n\n"), contentParts };
}
