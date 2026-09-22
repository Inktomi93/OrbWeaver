// domain/chat/assembly/world-info/pool — the per-turn World-Info pool. The one chat-domain reach into the
// @orb/db world-info schema: loads + de-dups the four attachment scopes (chat/character/global/persona) a
// turn's lore can come from, dedup by entry id (first wins, no precedence ladder). Per-entry behavior
// (always-vs-keyword, depth-injection, system-half bucket) is resolved by the pure @orb/kit/world-info
// resolvers off each entry's metadata; the keyword match + budget + WI→injection conversion live in context.ts.
//
// FLAG[global-scope]: global_books has no userId (unlike neo); global reads are scoped to the host owner via
// the world_books.ownerId join to avoid a cross-tenant lore leak — flag for the world-info/schema owner to confirm.
//
// FLAG[attachment-scope] (#1396): all FOUR arms now name their owner authority, and it is NOT the same one.
// The attachment arms used to carry no owner predicate at all, which left the tenant boundary resting on
// whatever produced the id arrays — a prose-only boundary (constitution §2). Per scope:
//   • character → `target.ownerId` (the room HOST). Every character-card read in the domain resolves under
//     `hostUserId` (D18/D19), and both attach writers gate the card and the book under ONE caller, so a
//     host-owned card can only legitimately carry host-owned books. `loadCharacterCardLore` below has
//     applied exactly this join since it was written; this is that belt on the per-turn path.
//   • persona  → the PERSONA'S OWN owner, via the `personas` join — deliberately NOT `target.ownerId`.
//     `personaIds` is the PRESENT HUMANS' active personas (multi-human native), so in a shared room they
//     legitimately belong to members other than the host; belting this arm to the host would silently
//     delete a member's own lore from the prompt. `attachToPersona` gates the persona and the book under
//     one caller, so "the book belongs to the persona's owner" is the writers' invariant made physics.
//   • chat     → `chatId` only, ON PURPOSE — but NOT for the reason this bullet used to give. It said a
//     chat book is "the ROOM's (any member may attach their own)", and that is not what the writers do:
//     `worldInfo.attachToChat` awaits `requireChatHost(principal, chatId)` AND
//     `loadOwnedBook(db, principal.userId, bookId)` in the same call, so a chat book is HOST-attached and
//     HOST-owned. Room-wide prompt content is a one-shot jailbreak surface (write = host, the chat-injection
//     precedent); the host may only share a book they own. The invariant is therefore STRONGER than an owner
//     predicate would state, not weaker than it.
//     It survives the one event that could break it: host HANDOFF
//     (`world-info/persistence/handoff-copy-write.ts:95-96`) DELETES the outgoing host's chat attachment and
//     inserts a COPY minted under the incoming host — or converges onto a same-named book the recipient
//     already has on the room — in the SAME batch as the role swap. So "attached ⇒ owned by whoever is the
//     room's host" holds before and after, with no window between.
//     Writer census, 2026-09-04: `insert(chatBooks)` has exactly TWO sites, both named above
//     (`verbs/attachments/attach-to-chat.ts:25`, `persistence/handoff-copy-write.ts:96`); the only other
//     mutation is `verbs/attachments/detach-from-chat.ts:19`. An owner predicate here would be redundant
//     rather than wrong — it is left off because the junction rows are already the belt, and any future
//     attempt to add one owes this handoff case first.
//   • global   → `target.ownerId`, unchanged (FLAG[global-scope] above).

import type { AssembleWorldEntry } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { characterBooks, chatBooks, globalBooks, personaBooks, personas, worldBooks, worldEntries } from "@orb/db";
import type { CharacterId, ChatId, PersonaId, UserId, WorldEntryId } from "@orb/kit/ids";
import { resolveEntryInjection, resolveEntryKeyMode, resolveEntryPosition, resolveEntryScope } from "@orb/kit/world-info";
import { and, eq, inArray } from "drizzle-orm";

interface WorldInfoPoolTarget {
  readonly chatId: ChatId;
  readonly ownerId: UserId;
  /** Every present AI seated character's identity; primary first. Empty ⇒ no character-scope books. */
  readonly characterIds: readonly CharacterId[];
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
    keyMode: resolveEntryKeyMode(row.metadata),
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
  const characterIds = [...target.characterIds];
  const personaIds = [...target.personaIds];

  const [chatRows, characterRows, globalRows, personaRows] = await Promise.all([
    db
      .select(entryColumns)
      .from(chatBooks)
      .innerJoin(worldEntries, eq(chatBooks.worldBookId, worldEntries.worldBookId))
      .where(and(eq(chatBooks.chatId, target.chatId), eq(worldEntries.enabled, true))),
    // character → scoped to the HOST owner, the same `world_books.ownerId` join `loadCharacterCardLore`
    // below already applies to this very junction (see FLAG[attachment-scope]).
    characterIds.length === 0
      ? Promise.resolve([])
      : db
          .select(entryColumns)
          .from(characterBooks)
          .innerJoin(worldEntries, eq(characterBooks.worldBookId, worldEntries.worldBookId))
          .innerJoin(worldBooks, eq(worldBooks.id, characterBooks.worldBookId))
          .where(and(inArray(characterBooks.characterId, characterIds), eq(worldBooks.ownerId, target.ownerId), eq(worldEntries.enabled, true))),
    // global → scoped to the HOST owner via the world_books.ownerId join (see FLAG[global-scope]).
    db
      .select(entryColumns)
      .from(globalBooks)
      .innerJoin(worldEntries, eq(globalBooks.worldBookId, worldEntries.worldBookId))
      .innerJoin(worldBooks, eq(worldBooks.id, globalBooks.worldBookId))
      .where(and(eq(worldBooks.ownerId, target.ownerId), eq(worldEntries.enabled, true))),
    // persona → scoped to the PERSONA'S OWN owner, NOT `target.ownerId` (see FLAG[attachment-scope]).
    personaIds.length === 0
      ? Promise.resolve([])
      : db
          .select(entryColumns)
          .from(personaBooks)
          .innerJoin(worldEntries, eq(personaBooks.worldBookId, worldEntries.worldBookId))
          .innerJoin(worldBooks, eq(worldBooks.id, personaBooks.worldBookId))
          .innerJoin(personas, eq(personas.id, personaBooks.personaId))
          .where(and(inArray(personaBooks.personaId, personaIds), eq(worldBooks.ownerId, personas.ownerId), eq(worldEntries.enabled, true))),
  ]);

  return dedupeByEntryId([
    chatRows.map((r) => fromBookExpansion(r, "chat")),
    // Persona + global books tag `source:"chat"` (user-authored intent → {{user}} = active persona).
    personaRows.map((r) => fromBookExpansion(r, "chat")),
    globalRows.map((r) => fromBookExpansion(r, "chat")),
    characterRows.map((r) => fromBookExpansion(r, "character")),
  ]);
}

/** The `sheet+lore` slice of the D22 member card: ONE character's OWN world-info entry contents (its
 *  character-scope books), for the member-card read (`clampMemberCard` clamps them at `sheet+lore`). This is
 *  the character's own lore ONLY — NOT the per-turn 4-scope pool (`loadWorldInfoPool`): a card viewer sees the
 *  card's world-info, not the room's chat/persona/global books. TENANT-SCOPED to the chat host via the
 *  `world_books.ownerId` join (the `FLAG[global-scope]` guard, applied here too): a card's books are the
 *  host's books, so a foreign-owned book can never leak through this read even if a junction row survived.
 *  Enabled entries only, priority-ordered (highest first) then stable by id. Content strings only — no
 *  keyword/injection metadata (a card display is not a live activation). */
export async function loadCharacterCardLore(db: Db, args: { readonly characterId: CharacterId; readonly ownerId: UserId }): Promise<string[]> {
  const rows = await db
    .select({ content: worldEntries.content, priority: worldEntries.priority, id: worldEntries.id })
    .from(characterBooks)
    .innerJoin(worldEntries, eq(characterBooks.worldBookId, worldEntries.worldBookId))
    .innerJoin(worldBooks, eq(worldBooks.id, characterBooks.worldBookId))
    .where(and(eq(characterBooks.characterId, args.characterId), eq(worldBooks.ownerId, args.ownerId), eq(worldEntries.enabled, true)));
  return rows
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
    .map((r) => r.content)
    .filter((c) => c.trim().length > 0);
}
