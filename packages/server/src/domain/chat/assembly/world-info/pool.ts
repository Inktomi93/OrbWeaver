// domain/chat/assembly/world-info/pool — the per-turn World-Info POOL (chat.md Part I 8-slot
// `assembly/world-info/pool.ts`: "the 4-scope WI union — STAYS chat, reads `@orb/db` schema directly (the
// sanctioned db-layer consumer)"). This is the ONE chat-domain reach into the `@orb/db` world-info schema:
// it loads + de-dups the four attachment scopes a turn's lore can come from. Per-entry BEHAVIOR
// (always-vs-keyword, depth-injection, system-half bucket) is resolved by the pure `@orb/kit/world-info`
// resolvers off each entry's `metadata` blob — the keyword MATCH + budget + the WI→injection conversion
// live one layer up (context.ts's GATHER/BUILD).
//
// FOUR SCOPES (a book attaches at exactly one scope per junction; the pool unions all four, dedup by entry
// id — first wins; no precedence ladder because each entry lives in one book, attached at most once/scope):
//   chat      → chat_books        (this chat)
//   character → character_books   (every AI cast member's identity — D28: keyed on `characters.id`)
//   global    → global_books      (the host's deployment-global books — scoped to the host owner; see FLAG)
//   persona   → persona_books     (the present humans' active personas)
//
// SOURCE TAGGING (the dual-persona routing): character-book entries tag `source:"character"` (card-derived →
// {{user}} = the pinned anchor persona); chat / persona / global book entries tag `source:"chat"` (user-
// authored intent → {{user}} = the speaker's active persona). The source rides on each `AssembleWorldEntry`
// for context.ts's per-entry macro render.
//
// FLAG[global-scope]: neo's `global_books` carried a `userId` (per-user globals). orbweaver's
// `global_books` (schema/world-info.ts) is PK-only (the comment reads "deployment-global"). To avoid a
// cross-tenant lore leak (a turn funded by host H must not surface tenant G's book), this scopes global
// books to the HOST owner via the `world_books.ownerId` join — strictly safe + byte-identical in the
// single-tenant case. If true deployment-wide globals are intended, drop the ownerId filter (flag for the
// world-info/schema owner to confirm).

import type { AssembleWorldEntry } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import {
  characterBooks,
  chatBooks,
  globalBooks,
  personaBooks,
  worldBooks,
  worldEntries,
} from "@orb/db";
import type { CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import {
  resolveEntryInjection,
  resolveEntryPosition,
  resolveEntryScope,
} from "@orb/kit/world-info";
import { and, eq, inArray } from "drizzle-orm";

/** The minimal turn-target shape the pool needs (keeps the seam clean — fixtures don't need a full chat
 *  row). `ownerId` is the host (the funding/owner identity — global books scope to it). File-local (the
 *  `types-in-contract` gate forbids an exported feature type outside contract/); callers pass a
 *  structurally-matching literal. */
interface WorldInfoPoolTarget {
  readonly chatId: ChatId;
  readonly ownerId: UserId;
  /** Every present AI cast member's identity (D28 — `characters.id`); primary first. Empty ⇒ no
   *  character-scope books. */
  readonly castCharacterIds: readonly CharacterId[];
  /** The present humans' active personas. Empty ⇒ no persona-scope books. */
  readonly personaIds: readonly PersonaId[];
}

/** One book-expansion row — the uniform shape across all four scopes (the shared SELECT projection). */
interface BookExpansionRow {
  id: string;
  content: string;
  enabled: boolean | null;
  priority: number | null;
  keys: unknown;
  ignoreBudget: boolean | null;
  metadata: unknown;
}

// The shared entry projection — every scope read produces the SAME row shape so the dedup + projector stay
// uniform. (`worldBookId` is the join key but isn't projected — the pool keys on the entry id.)
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

/** Project a book-expansion row → the assembler `AssembleWorldEntry`. Scope/injection/position are derived
 *  by the pure `@orb/kit/world-info` resolvers off the entry's `metadata` (the resolvers parse it in
 *  isolation — a malformed sibling field never poisons another). */
function fromBookExpansion(
  row: BookExpansionRow,
  source: AssembleWorldEntry["source"],
): AssembleWorldEntry {
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

/** Dedup the four-source pool by entry id (first wins). The id is always present (the `worldEntries` PK);
 *  the content fallback only matters for hand-built fixtures. */
function dedupeByEntryId(sources: readonly AssembleWorldEntry[][]): AssembleWorldEntry[] {
  const seen = new Map<string, AssembleWorldEntry>();
  for (const source of sources) {
    for (const entry of source) {
      const key = entry.id ?? entry.content;
      if (!seen.has(key)) {
        seen.set(key, entry);
      }
    }
  }
  return [...seen.values()];
}

/**
 * Fetch the merged, deduped per-turn World-Info pool — four parallel SQL reads (no waterfall), one
 * Map-based dedup. `worldInfoEnabled === false` short-circuits to `[]` without touching the DB (the cheap
 * "no lore today" path). Each returned entry carries its resolved scope (always | keyword) + `source`
 * tag for the downstream keyword match + dual-persona macro render (context.ts GATHER/BUILD).
 */
export async function loadWorldInfoPool(
  db: Db,
  target: WorldInfoPoolTarget,
  worldInfoEnabled: boolean,
): Promise<AssembleWorldEntry[]> {
  if (!worldInfoEnabled) {
    return [];
  }
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
