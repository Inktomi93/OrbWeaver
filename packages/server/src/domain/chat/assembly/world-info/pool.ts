// domain/chat/assembly/world-info/pool — the per-turn World-Info pool. The one chat-domain reach into the
// @orb/db world-info schema: loads + de-dups the four attachment scopes (chat/character/global/persona) a
// turn's lore can come from, dedup by entry id (first wins, no precedence ladder). Per-entry behavior
// (always-vs-keyword, depth-injection, system-half bucket) is resolved by the pure @orb/kit/world-info
// resolvers off each entry's metadata; the keyword match + budget + WI→injection conversion live in context.ts.
//
// FLAG[global-scope]: global_books has no userId (unlike neo); global reads are scoped to the host owner via
// the world_books.ownerId join to avoid a cross-tenant lore leak — flag for the world-info/schema owner to confirm.
//
// FLAG[attachment-scope]: all FOUR arms now name their owner authority, and it is NOT the same one.
// The attachment arms used to carry no owner predicate at all, which left the tenant boundary resting on
// whatever produced the id arrays — a prose-only boundary (constitution §2). Per scope:
//   • character → `target.ownerId` (the room HOST). Every character-card read in the domain resolves under
//     `hostUserId` (D18/D19), and both attach writers gate the card and the book under ONE caller, so a
//     host-owned card can only legitimately carry host-owned books. `loadCharacterCardLore` below has
//     applied exactly this join since it was written; this is that belt on the per-turn path.
//   • persona  → the PERSONA'S OWN owner, via the `personas` join — deliberately NOT `target.ownerId`.
//     `personaIds` is the present members' seat personas plus the room's pin (multi-human native), so in a
//     shared room they legitimately belong to members other than the host; belting this arm to the host would silently
//     delete a member's own lore from the prompt. `attachToPersona` gates the persona and the book under
//     one caller, so "the book belongs to the persona's owner" is the writers' invariant made physics.
//   • chat     → `target.ownerId` (the room HOST), D64. `worldInfo.attachToChat` admits only the host and only
//     a book they own, and a handoff detaches every chat book the new host does not own in the swap batch
//     (`world-info/persistence/handoff-copy-write.ts`, `createDetachHandoffBooks`). The owner predicate is the
//     control that holds without either writer: a chat book a former host still owns, and can still edit,
//     never reaches the room's prompt, including a row an older handoff left behind.
//   • global   → `target.ownerId`, unchanged (FLAG[global-scope] above).

import type { AssembleWorldEntry, AssembleWorldEntryAttachment } from "@orb/contracts/chat";
import type { ChatBookView, InheritedBookSource } from "@orb/contracts/world-info";
import type { Db } from "@orb/db";
import { characterBooks, characters, chatBooks, globalBooks, personaBooks, personas, worldBooks, worldEntries } from "@orb/db";
import type { CharacterId, ChatId, PersonaId, UserId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { resolveEntryInjection, resolveEntryKeyMode, resolveEntryPosition, resolveEntryScope } from "@orb/kit/world-info";
import { and, eq, inArray } from "drizzle-orm";

interface WorldInfoPoolTarget {
  readonly chatId: ChatId;
  readonly ownerId: UserId;
  /** Every present AI seated character's identity; primary first. Empty ⇒ no character-scope books. */
  readonly characterIds: readonly CharacterId[];
  /** The present members' seat personas and the room's pin (`lorePersonaIdsOf`). Empty ⇒ no persona-scope books. */
  readonly personaIds: readonly PersonaId[];
  /** The host's room switch (`ChatMetadata.memberPersonaLore`). False ⇒ only the host's own persona books join. */
  readonly memberPersonaLore: boolean;
}

/** One book-expansion row — the uniform shape across all four scopes (the shared SELECT projection). */
interface BookExpansionRow {
  id: WorldEntryId;
  title: string;
  content: string;
  enabled: boolean | null;
  priority: number | null;
  keys: unknown;
  ignoreBudget: boolean | null;
  metadata: unknown;
}

const bookColumns = {
  id: worldBooks.id,
  ownerId: worldBooks.ownerId,
  name: worldBooks.name,
  description: worldBooks.description,
} as const;

const entryColumns = {
  id: worldEntries.id,
  title: worldEntries.title,
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
function fromBookExpansion(row: BookExpansionRow, attachment: AssembleWorldEntryAttachment): AssembleWorldEntry {
  const keys = extractKeys(row.keys);
  const inject = resolveEntryInjection(row.metadata);
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    scope: resolveEntryScope(row.metadata, keys.length > 0),
    keys,
    priority: row.priority ?? 0,
    enabled: row.enabled ?? true,
    ignoreBudget: row.ignoreBudget ?? false,
    ...attachment,
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
async function loadWorldInfoSources(
  db: Db,
  target: WorldInfoPoolTarget,
): Promise<{
  chatRows: BookExpansionRow[];
  characterRows: (BookExpansionRow & {
    book: Pick<typeof worldBooks.$inferSelect, "id" | "ownerId" | "name" | "description">;
    sourceName: string;
  })[];
  globalRows: (BookExpansionRow & { book: Pick<typeof worldBooks.$inferSelect, "id" | "ownerId" | "name" | "description"> })[];
  personaRows: (BookExpansionRow & {
    book: Pick<typeof worldBooks.$inferSelect, "id" | "ownerId" | "name" | "description">;
    personaId: PersonaId;
    personaName: string;
    personaDescription: string;
  })[];
}> {
  const characterIds = [...target.characterIds];
  const personaIds = [...target.personaIds];

  const [chatRows, characterRows, globalRows, personaRows] = await Promise.all([
    // chat → scoped to the HOST owner (see FLAG[attachment-scope]): a row a former host left on the room applies nothing.
    db
      .select(entryColumns)
      .from(chatBooks)
      .innerJoin(worldEntries, eq(chatBooks.worldBookId, worldEntries.worldBookId))
      .innerJoin(worldBooks, eq(worldBooks.id, chatBooks.worldBookId))
      .where(and(eq(chatBooks.chatId, target.chatId), eq(worldBooks.ownerId, target.ownerId), eq(worldEntries.enabled, true))),
    // character → scoped to the HOST owner, the same `world_books.ownerId` join `loadCharacterCardLore`
    // below already applies to this very junction (see FLAG[attachment-scope]).
    // `characterIds` are the room roster's own present character seats, resolved by the assembly caller after the room authority gate, and the read is pinned to the host's books by `eq(worldBooks.ownerId, target.ownerId)`. Ends if a caller-supplied character id reaches the pool.
    characterIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ ...entryColumns, book: bookColumns, sourceName: characters.name })
          .from(characterBooks)
          .innerJoin(characters, eq(characters.id, characterBooks.characterId))
          .innerJoin(worldEntries, eq(characterBooks.worldBookId, worldEntries.worldBookId))
          .innerJoin(worldBooks, eq(worldBooks.id, characterBooks.worldBookId))
          .where(and(inArray(characterBooks.characterId, characterIds), eq(worldBooks.ownerId, target.ownerId), eq(worldEntries.enabled, true))),
    // global → scoped to the HOST owner via the world_books.ownerId join (see FLAG[global-scope]).
    db
      .select({ ...entryColumns, book: bookColumns })
      .from(globalBooks)
      .innerJoin(worldEntries, eq(globalBooks.worldBookId, worldEntries.worldBookId))
      .innerJoin(worldBooks, eq(worldBooks.id, globalBooks.worldBookId))
      .where(and(eq(worldBooks.ownerId, target.ownerId), eq(worldEntries.enabled, true))),
    // persona → scoped to the PERSONA'S OWN owner, NOT `target.ownerId` (see FLAG[attachment-scope]).
    // the scope is `personaIds`, the room's present human seats' active personas and its `chats.anchorPersonaId` pin (`lorePersonaIdsOf`, or the editing/selecting member's own seat persona), resolved by the turn caller after the room authority gate; `setActivePersona` seats only a member's own persona, and the pin is a host-gated room column that holds past its owner's leave (D315). The personas row has no owner pin because a shared room legitimately carries members' personas. Ends if a caller-supplied persona id reaches the pool.
    // each book is pinned to its persona's owner by `eq(worldBooks.ownerId, personas.ownerId)`, and the personas are the room's own in `personaIds` (see the personas waiver above), so a book joins only when the persona's own owner holds it. Ends if a caller-supplied persona id reaches the pool or the owner match is dropped.
    personaIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ ...entryColumns, book: bookColumns, personaId: personas.id, personaName: personas.name, personaDescription: personas.description })
          .from(personaBooks)
          .innerJoin(worldEntries, eq(personaBooks.worldBookId, worldEntries.worldBookId))
          .innerJoin(worldBooks, eq(worldBooks.id, personaBooks.worldBookId))
          .innerJoin(personas, eq(personas.id, personaBooks.personaId))
          .where(
            and(
              inArray(personaBooks.personaId, personaIds),
              eq(worldBooks.ownerId, personas.ownerId),
              eq(worldEntries.enabled, true),
              target.memberPersonaLore ? undefined : eq(personas.ownerId, target.ownerId),
            ),
          ),
  ]);

  // `inArray` keeps no order and the entry dedupe is first-wins, so `personaIds` order is applied here: a seat
  // outranks the pin on a book both hold, whichever persona row is older.
  const personaRank = new Map(personaIds.map((id, rank) => [id, rank]));
  const rankedPersonaRows = personaRows.toSorted((a, b) => (personaRank.get(a.personaId) ?? 0) - (personaRank.get(b.personaId) ?? 0));
  return { chatRows, characterRows, globalRows, personaRows: rankedPersonaRows };
}

/** The inherited rack and the assembler read the same owner-belted eligible entry sources. */
export async function loadInheritedWorldBooks(db: Db, target: WorldInfoPoolTarget): Promise<ChatBookView[]> {
  const { characterRows, globalRows, personaRows } = await loadWorldInfoSources(db, target);
  // Named fields, not `...row.book`: a column added to `bookColumns` must not ride onto the strict wire view.
  // The rack never shows an inherited book's description, so it is always null.
  const inherited = (
    row: { readonly book: { readonly id: WorldBookId; readonly name: string } },
    source: InheritedBookSource,
    name: string | null,
  ): ChatBookView => ({
    id: row.book.id,
    name: row.book.name,
    description: null,
    role: null,
    inherited: { source, name },
  });
  const rows: ChatBookView[] = [
    ...globalRows.map((row) => inherited(row, "global", null)),
    ...characterRows.map((row) => inherited(row, "character", row.sourceName)),
    ...personaRows.map((row) => inherited(row, "persona", row.personaName)),
  ];
  return rows.filter(
    (row, index) =>
      rows.findIndex((other) => other.id === row.id && other.inherited?.source === row.inherited?.source && other.inherited?.name === row.inherited?.name) ===
      index,
  );
}

/** Macro routing and entry precedence are unchanged by the rack's source projection. */
export async function loadWorldInfoPool(db: Db, target: WorldInfoPoolTarget): Promise<AssembleWorldEntry[]> {
  const { chatRows, characterRows, globalRows, personaRows } = await loadWorldInfoSources(db, target);
  const chat = { source: "chat" } as const;
  return dedupeByEntryId([
    chatRows.map((r) => fromBookExpansion(r, chat)),
    // A persona's own book renders its macros against that persona, never the voice persona: in a shared
    // room a member's `{{user}}` lore must name that member.
    personaRows.map((r) => fromBookExpansion(r, { source: "persona", persona: { name: r.personaName, description: r.personaDescription } })),
    // Global books are the host's user-authored intent → {{user}} = the voice persona.
    globalRows.map((r) => fromBookExpansion(r, chat)),
    characterRows.map((r) => fromBookExpansion(r, { source: "character" })),
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
    .toSorted((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
    .map((r) => r.content)
    .filter((c) => c.trim().length > 0);
}
