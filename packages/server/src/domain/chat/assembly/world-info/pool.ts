// domain/chat/assembly/world-info/pool — the per-turn World-Info pool. The one chat-domain reach into the
// @orb/db world-info schema: loads + de-dups the four attachment scopes (chat/character/global/persona) a
// turn's lore can come from, dedup by entry id (first wins, no precedence ladder). Per-entry behavior
// (always-vs-keyword, depth-injection, system-half bucket) is resolved by the pure @orb/kit/world-info
// resolvers off each entry's metadata; the keyword match + budget + WI→injection conversion live in context.ts.
//
// FLAG[global-scope]: global_books has no userId (unlike neo); global reads are scoped to the host owner via
// the world_books.ownerId join to avoid a cross-tenant lore leak — flag for the world-info/schema owner to confirm.

import type { AssembleWorldEntry } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { characterBooks, chatBooks, globalBooks, personaBooks, worldBooks, worldEntries } from "@orb/db";
import type { CharacterId, ChatId, PersonaId, UserId, WorldEntryId } from "@orb/kit/ids";
import { resolveEntryInjection, resolveEntryPosition, resolveEntryScope } from "@orb/kit/world-info";
import { and, eq, inArray } from "drizzle-orm";

interface WorldInfoPoolTarget {
  readonly chatId: ChatId;
  readonly ownerId: UserId;
  /** Every present AI cast member's identity; primary first. Empty ⇒ no character-scope books. */
  readonly castCharacterIds: readonly CharacterId[];
  /** The present humans' active personas. Empty ⇒ no persona-scope books. */
  readonly personaIds: readonly PersonaId[];
}

/** One book-expansion row — the uniform shape across all four scopes (the shared SELECT projection). */
interface BookExpansionRow {
  id: WorldEntryId;
  content: string;
  enabled: boolean | null;
  priority: number | null;
  keys: unknown;
  ignoreBudget: boolean | null;
  metadata: unknown;
}

const entryColumns = {
  id: worldEntries.id,
  content: worldEntries.content,
  enabled: worldEntries.enabled,
  priority: worldEntries.priority,
  keys: worldEntries.keys,
  ignoreBudget: worldEntries.ignoreBudget,
  metadata: worldEntries.metadata,
} as const;

function extractKeys(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : [];
}

/** Project a book-expansion row → the assembler `AssembleWorldEntry`. */
function fromBookExpansion(row: BookExpansionRow, source: AssembleWorldEntry["source"]): AssembleWorldEntry {
  const keys = extractKeys(row.keys);
  const inject = resolveEntryInjection(row.metadata);
  return {
    id: row.id,
    content: row.content,
    scope: resolveEntryScope(row.metadata, keys.length > 0),
    keys,
    priority: row.priority ?? 0,
    enabled: row.enabled ?? true,
    ignoreBudget: row.ignoreBudget ?? false,
    source,
    position: resolveEntryPosition(row.metadata),
    ...(inject !== null ? { inject } : {}),
  };
}

/** Dedup the four-source pool by entry id (first wins). */
function dedupeByEntryId(sources: readonly AssembleWorldEntry[][]): AssembleWorldEntry[] {
  const seen = new Map<WorldEntryId, AssembleWorldEntry>();
  for (const source of sources) {
    for (const entry of source) {
      if (!seen.has(entry.id)) {
        seen.set(entry.id, entry);
      }
    }
  }
  return [...seen.values()];
}

/** Fetch the merged, deduped per-turn World-Info pool — four parallel SQL reads, one Map-based dedup. There
 *  is no master toggle; an empty result (no books attached) is the "no lore" path. */
export async function loadWorldInfoPool(db: Db, target: WorldInfoPoolTarget): Promise<AssembleWorldEntry[]> {
  const castIds = [...target.castCharacterIds];
  const personaIds = [...target.personaIds];

  const [chatRows, characterRows, globalRows, personaRows] = await Promise.all([
    db
      .select(entryColumns)
      .from(chatBooks)
      .innerJoin(worldEntries, eq(chatBooks.worldBookId, worldEntries.worldBookId))
      .where(and(eq(chatBooks.chatId, target.chatId), eq(worldEntries.enabled, true))),
    castIds.length === 0
      ? Promise.resolve([])
      : db
          .select(entryColumns)
          .from(characterBooks)
          .innerJoin(worldEntries, eq(characterBooks.worldBookId, worldEntries.worldBookId))
          .where(and(inArray(characterBooks.characterId, castIds), eq(worldEntries.enabled, true))),
    // global → scoped to the HOST owner via the world_books.ownerId join (see FLAG[global-scope]).
    db
      .select(entryColumns)
      .from(globalBooks)
      .innerJoin(worldEntries, eq(globalBooks.worldBookId, worldEntries.worldBookId))
      .innerJoin(worldBooks, eq(worldBooks.id, globalBooks.worldBookId))
      .where(and(eq(worldBooks.ownerId, target.ownerId), eq(worldEntries.enabled, true))),
    personaIds.length === 0
      ? Promise.resolve([])
      : db
          .select(entryColumns)
          .from(personaBooks)
          .innerJoin(worldEntries, eq(personaBooks.worldBookId, worldEntries.worldBookId))
          .where(and(inArray(personaBooks.personaId, personaIds), eq(worldEntries.enabled, true))),
  ]);

  return dedupeByEntryId([
    chatRows.map((r) => fromBookExpansion(r, "chat")),
    // Persona + global books tag `source:"chat"` (user-authored intent → {{user}} = active persona).
    personaRows.map((r) => fromBookExpansion(r, "chat")),
    globalRows.map((r) => fromBookExpansion(r, "chat")),
    characterRows.map((r) => fromBookExpansion(r, "character")),
  ]);
}
