// Read the owner's live character card and emit a V3 character-card PNG. The out assembly + the direct
// `@orb/db` reads + packaging are export's job; the card mapper (`buildCardV3`) and PNG byte codec
// (`writeCardChunk`) are composed from the serde core, never re-implemented here.
//
// Ownership is `principal.userId`. `fetchOwned` puts the owner predicate in the WHERE, so a non-owner or
// missing character both collapse to `undefined` → the verb returns `null` (404 at the HTTP layer).

import type { CardDepthPrompt } from "@orb/contracts/character";
import { cardDepthPromptSchema } from "@orb/contracts/character";
import { tagStatusSchema } from "@orb/contracts/tag";
import { assets, characterBooks, characters, characterTags, tags, worldEntries } from "@orb/db";
import { fetchOwned, parseRecord, parseStringArray } from "@orb/db/kit";
import type { AssetId, UserId } from "@orb/kit/ids";
import { writeCardChunk } from "@orb/kit/png-card-chunk";
import { and, eq } from "drizzle-orm";
import type { ExportWorldEntry } from "#kit/serde/card";
import { buildCardV3 } from "#kit/serde/card";
import type { ExportCharacterParams } from "../contract/params";
import type { ExportedCard } from "../contract/results";
import type { ExportContext, ExportService } from "../contract/service";
import { slug } from "../substrate/download-slug";
import { PLACEHOLDER_PNG } from "../substrate/placeholder-png";

const PNG_MIME = "image/png";
// The card's tags are the ACCEPTED junction rows; derived from the canonical schema, not an inline re-spell.
const ACCEPTED_STATUS = tagStatusSchema.enum.accepted;
// `cas.read` rejects with a Node ENOENT when the blob is absent — that one error falls through to the
// placeholder; any other I/O error propagates (corrupt ≠ absent).
const ENOENT = "ENOENT";

// Parse the typed `depth_prompt` JSON column through the canonical schema — a malformed/legacy value
// collapses to null, never a throw.
function parseDepthPrompt(raw: unknown): CardDepthPrompt | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const parsed = cardDepthPromptSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// True when a rejected `cas.read` is the benign "blob absent" case (→ placeholder, not a throw).
function isMissingBlob(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === ENOENT;
}

export function createExportCharacter(ctx: ExportContext): ExportService["exportCharacter"] {
  // The base PNG the card JSON embeds into: the owner's avatar (transcoded to PNG when needed), else the
  // placeholder. Read with a single `cas.read` attempt (exists-then-read would TOCTOU-race a concurrent GC).
  async function basePng(avatarAssetId: AssetId | null, ownerId: UserId): Promise<Uint8Array> {
    if (avatarAssetId === null) {
      return PLACEHOLDER_PNG;
    }
    const asset = await fetchOwned(ctx.db, assets, avatarAssetId, ownerId);
    if (asset === undefined) {
      return PLACEHOLDER_PNG;
    }
    try {
      const raw = await ctx.cas.read(ownerId, asset.hash);
      return asset.mime === PNG_MIME ? raw : await ctx.imageTransform(raw, { format: "png" });
    } catch (err) {
      if (isMissingBlob(err)) {
        return PLACEHOLDER_PNG;
      }
      throw err;
    }
  }

  return async ({
    principal,
    characterId,
  }: ExportCharacterParams): Promise<ExportedCard | null> => {
    const ownerId = principal.userId;
    const charRow = await fetchOwned(ctx.db, characters, characterId, ownerId);
    if (charRow === undefined) {
      return null;
    }

    // The card's tags = the accepted `character_tags` names; pending suggestions are not serialized.
    const tagRows = await ctx.db
      .select({ name: tags.name })
      .from(characterTags)
      .innerJoin(tags, eq(characterTags.tagId, tags.id))
      .where(
        and(eq(characterTags.characterId, characterId), eq(characterTags.status, ACCEPTED_STATUS)),
      );
    const acceptedTags = tagRows.map((row) => row.name);

    // Walk the character's attached books (primary + auxiliary) → their entries. De-duped by entry id (a
    // book attached twice must not double an entry).
    const entryRows = await ctx.db
      .select({
        id: worldEntries.id,
        content: worldEntries.content,
        keys: worldEntries.keys,
        enabled: worldEntries.enabled,
        priority: worldEntries.priority,
        title: worldEntries.title,
        ignoreBudget: worldEntries.ignoreBudget,
        metadata: worldEntries.metadata,
      })
      .from(characterBooks)
      .innerJoin(worldEntries, eq(characterBooks.worldBookId, worldEntries.worldBookId))
      .where(eq(characterBooks.characterId, characterId));

    const seen = new Set<string>();
    const entries: ExportWorldEntry[] = [];
    for (const entry of entryRows) {
      if (seen.has(entry.id)) {
        continue;
      }
      seen.add(entry.id);
      entries.push({
        keys: parseStringArray(entry.keys),
        content: entry.content,
        enabled: entry.enabled,
        priority: entry.priority,
        title: entry.title,
        ignoreBudget: entry.ignoreBudget,
        metadata: parseRecord(entry.metadata),
      });
    }

    // The typed columns are read straight off the flat row — no `raw` blob, so an app-authored card
    // round-trips identically. The serde owns re-encoding depthPrompt + regexScripts back into `extensions`.
    const card = buildCardV3(
      {
        name: charRow.name,
        description: charRow.description,
        personality: charRow.personality,
        scenario: charRow.scenario,
        greetings: parseStringArray(charRow.greetings),
        exampleMessages: charRow.exampleMessages,
        systemPrompt: charRow.systemPrompt,
        postHistoryInstructions: charRow.postHistoryInstructions,
        creatorNotes: charRow.creatorNotes,
        creator: charRow.creator,
        cardVersion: charRow.cardVersion,
        tags: acceptedTags,
        extensions: parseRecord(charRow.extensions),
        residualData: parseRecord(charRow.residualData),
        regexScripts: charRow.regexScripts,
        depthPrompt: parseDepthPrompt(charRow.depthPrompt),
      },
      entries,
    );

    const png = await basePng(charRow.avatarAssetId, ownerId);
    const bytes = writeCardChunk(png, JSON.stringify(card));
    return { bytes, filename: `${slug(charRow.name)}.png` };
  };
}
