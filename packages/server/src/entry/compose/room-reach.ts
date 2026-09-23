// entry/compose/room-reach — THE ENTITY→ROOM REACH ENGINE.
// An owner-plane entity edit (a character card, a persona, a lorebook) lands on the editor's
// own devices through the user bus; this is the OTHER audience plane — the rooms where OTHER humans are sitting
// on a member-visible projection of that entity. One `DomainEvent` in, one `roomEntityChanged` per reached room
// out, live-only (no `chat_events` row).
//
// WHY IT LIVES AT THE COMPOSITION ROOT, and can live nowhere else: the reach lookups are SQL over chat's roster
// and world-info's junctions, and a domain may not import another domain (nor the chat bus) to fan. The
// workload-contributions posture applies — the domains DECLARE (they emit their own id-only event), ONE engine
// dispatches, and the engine knows no domain's business rules. This file grew from `emit-character-updated.ts`,
// which fanned exactly one kind onto a DURABLE `chatUpdated`; that file is deleted (design F-D — no
// half-migration), and with it one `chat_events` INSERT per seated room per card edit.
//
// THE THREE BELTS, so a NEW entity kind cannot ship silent:
//   • `ROOM_REACH satisfies RoomReachTable` — a new `RoomEntityKind` fails tsc until its resolver exists.
//   • the `assertNeverEvent` switch below — a new `DomainEvent` member fails tsc until it routes (or declares
//     itself explicitly room-irrelevant).
//   • the client's `BUS_FILTERS.roomEntityChanged` Record over the same union — a new kind fails tsc until it
//     names the reads it invalidates.
//
// WHAT "REACH" MEANS: rooms whose MEMBER-VISIBLE projection reads this entity, present seats only. Never
// "rooms with a live subscriber" — delivery cost is already gated by subscription physics (publishing to a room
// nobody is tailing is a no-listener `EventEmitter.emit`, `transport/trpc/bus-channel.ts`), and the presence
// registry is userId-keyed, so filtering by it would add a seam to save nothing.
//
// NO PAYLOAD, EVER. The fanned event carries `{chatId, entity}` — members re-READ through the already-clamped
// verbs (`getMemberCard`, `getChat`), so the D16/D22 byte-gating holds by construction and this engine needs no
// visibility logic of its own. An entity id is deliberately absent (contracts §3.3).

import type { LiveOnlyChatBusEvent, RoomEntityKind } from "@orb/contracts/chat";
import type { DomainEvent } from "@orb/contracts/events";
import type { Db } from "@orb/db";
import {
  characterBooks,
  characterDocuments,
  chatBooks,
  chatDocuments,
  chatParticipants,
  chatRegexScripts,
  chats,
  globalBooks,
  globalDocuments,
  personaBooks,
  worldBooks,
} from "@orb/db";
import type { CharacterId, ChatId, DocumentId, PersonaId, RegexScriptId, UserId, WorldBookId } from "@orb/kit/ids";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getLog } from "#foundation/observability";

/** The id each kind's reach lookup is keyed on — the entity's OWN identity, never a chat's. Keyed by
 *  `RoomEntityKind` so the table below is exhaustive AND per-kind precise (one `Record<K, (db, id) => …>`
 *  with a union id would let the persona resolver accept a book id). */
interface RoomEntityIdOf {
  readonly character: CharacterId;
  readonly persona: PersonaId;
  readonly "world-info": WorldBookId;
  readonly regex: RegexScriptId;
  readonly databank: DocumentId;
}

/** The declarative reach table's shape: every `RoomEntityKind` resolves its own rooms. */
type RoomReachTable = { readonly [K in RoomEntityKind]: (db: Db, id: RoomEntityIdOf[K]) => Promise<ChatId[]> };

/** Rooms seating this character RIGHT NOW. `leftSeq IS NULL` is load-bearing: a departed character's history
 *  rows carry their own D28 snapshot identity and must stay frozen — a card edit does not retro-repaint them.
 *  Served by `chat_participants_character_idx` (the index's own comment cites this lookup). */
async function resolveCharacterRooms(db: Db, characterId: CharacterId): Promise<ChatId[]> {
  const rows = await db
    .select({ chatId: chatParticipants.chatId })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.characterId, characterId), eq(chatParticipants.kind, "character"), isNull(chatParticipants.leftSeq)));
  return rows.map((row) => row.chatId);
}

/** Rooms this persona is LIVE in — two sources, and both are needed:
 *   • a present human seat whose `activePersonaId` is this persona (their member-visible displayName + avatar
 *     ARE this persona's, `entry/compose/chat.ts::resolveUserPublics`) — `chat_participants_active_persona_idx`;
 *   • the chat's ANCHOR persona, which resolves `{{user}}` for the room's assembly even while its owner is
 *     offline and holds no seat (`domain/chat/substrate/participants-humans.ts`) — `chats_anchor_persona_idx`.
 *  Deduped by the caller. */
async function resolvePersonaRooms(db: Db, personaId: PersonaId): Promise<ChatId[]> {
  const [seated, anchored] = await Promise.all([
    db
      .select({ chatId: chatParticipants.chatId })
      .from(chatParticipants)
      .where(and(eq(chatParticipants.activePersonaId, personaId), isNull(chatParticipants.leftSeq))),
    db.select({ chatId: chats.id }).from(chats).where(eq(chats.anchorPersonaId, personaId)),
  ]);
  return [...seated.map((row) => row.chatId), ...anchored.map((row) => row.chatId)];
}

/** Rooms whose per-turn assembly pool reads this book — the MIRROR of `domain/chat/assembly/world-info/pool.ts`,
 *  which is the definition of "this room reads this book". All FOUR scopes, because the pool unions four:
 *   • CHAT scope — `chat_books` (the composite PK leads with chatId, so the lookup rides `chat_books_book_idx`);
 *   • CHARACTER scope — `character_books` joined through PRESENT character seats;
 *   • PERSONA scope — `persona_books` joined through present seats' active personas AND the chat anchor (the
 *     same two sources `resolvePersonaRooms` reads, for the same reason);
 *   • GLOBAL scope — `global_books` fires for EVERY chat, tenant-scoped by the pool to the room's host owner
 *     via the `world_books.ownerId` join (pool.ts's FLAG[global-scope]); so the reach is every chat whose
 *     PRESENT host is the book's owner (`chat_participants_user_idx` leads with userId).
 *  The doc's §3.5 table named the first three and delegated the gather-set mirror to the build lane; the fourth
 *  is that mirror's finding — a global book's edit moves every one of its owner's rooms, and omitting it would
 *  be a silent hole in exactly the set the design says defines reach.
 *  Over-reach here is cheap and safe: a room with no subscriber costs a no-listener publish, and the payload is
 *  id-free, so a room that did not actually need the refresh learns nothing from it. */
async function resolveWorldInfoRooms(db: Db, bookId: WorldBookId): Promise<ChatId[]> {
  const [chatScoped, characterScoped, personaSeated, personaAnchored, globalScoped] = await Promise.all([
    db.select({ chatId: chatBooks.chatId }).from(chatBooks).where(eq(chatBooks.worldBookId, bookId)),
    db
      .select({ chatId: chatParticipants.chatId })
      .from(characterBooks)
      .innerJoin(chatParticipants, eq(chatParticipants.characterId, characterBooks.characterId))
      .where(and(eq(characterBooks.worldBookId, bookId), eq(chatParticipants.kind, "character"), isNull(chatParticipants.leftSeq))),
    db
      .select({ chatId: chatParticipants.chatId })
      .from(personaBooks)
      .innerJoin(chatParticipants, eq(chatParticipants.activePersonaId, personaBooks.personaId))
      .where(and(eq(personaBooks.worldBookId, bookId), isNull(chatParticipants.leftSeq))),
    db
      .select({ chatId: chats.id })
      .from(personaBooks)
      .innerJoin(chats, eq(chats.anchorPersonaId, personaBooks.personaId))
      .where(eq(personaBooks.worldBookId, bookId)),
    // The global arm resolves the book's OWNER first (the tenant scope the pool applies), then that owner's
    // hosted rooms. `inArray` over the one-row owner select keeps it a single round trip.
    db
      .select({ chatId: chatParticipants.chatId })
      .from(chatParticipants)
      .where(
        and(
          inArray(
            chatParticipants.userId,
            db
              .select({ ownerId: worldBooks.ownerId })
              .from(globalBooks)
              .innerJoin(worldBooks, eq(worldBooks.id, globalBooks.worldBookId))
              .where(eq(globalBooks.worldBookId, bookId)),
          ),
          eq(chatParticipants.role, "host"),
          isNull(chatParticipants.leftSeq),
        ),
      ),
  ]);
  return [...chatScoped, ...characterScoped, ...personaSeated, ...personaAnchored, ...globalScoped].map((row) => row.chatId);
}

/** Rooms whose OWN tier attaches this script — the `chat_regex_scripts` junction, which is the whole reach of
 *  a library row on the member plane. A member of a room sees the room's attached scripts and nothing else
 *  (`regex.listForChat`, room-public), so a rename or an `enabled` flip on a row attached HERE changes what
 *  that member reads, and a row attached nowhere reaches nobody. The host/preset/character tiers are
 *  deliberately absent: a member cannot see them (they are host-library facts, D19), so an edit to one of them
 *  has no member-visible projection to refresh — only the HOST's own effective read moves, and that rides the
 *  host's user-plane `regexChanged`. */
async function resolveRegexScriptRooms(db: Db, scriptId: RegexScriptId): Promise<ChatId[]> {
  const rows = await db.select({ chatId: chatRegexScripts.chatId }).from(chatRegexScripts).where(eq(chatRegexScripts.regexScriptId, scriptId));
  return rows.map((row) => row.chatId);
}

/** The same junction read for a LIST of scripts, keeping WHICH script reached each room. Both regex delete
 *  verbs take an id list, and `bulkRemoveScripts` learns only AFTER its one owner-scoped statement which of
 *  those ids were really its own — so the capture must snapshot per script and the thunk filter by the
 *  confirmed set, or a foreign id in the list would fan a stranger's room. One round trip, not N. */
async function resolveRegexScriptsRooms(db: Db, scriptIds: readonly RegexScriptId[]): Promise<Map<RegexScriptId, ChatId[]>> {
  const byScript = new Map<RegexScriptId, ChatId[]>();
  if (scriptIds.length === 0) {
    return byScript;
  }
  const rows = await db
    .select({ chatId: chatRegexScripts.chatId, scriptId: chatRegexScripts.regexScriptId })
    .from(chatRegexScripts)
    .where(inArray(chatRegexScripts.regexScriptId, [...scriptIds]));
  for (const row of rows) {
    byScript.set(row.scriptId, [...(byScript.get(row.scriptId) ?? []), row.chatId]);
  }
  return byScript;
}

/** Rooms where THIS HUMAN currently holds a seat. The D85 global-scope arm's second hop: databank widening
 *  credits EVERY present human member's global documents to the room (not just the host's — that is where it
 *  differs from world-info's host-only global tenant scope), so a global attach/detach by any member moves
 *  every room they are sitting in. `chat_participants_user_idx` leads with userId. */
async function resolveMemberRooms(db: Db, userId: UserId): Promise<ChatId[]> {
  const rows = await db
    .select({ chatId: chatParticipants.chatId })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.userId, userId), eq(chatParticipants.kind, "human"), isNull(chatParticipants.leftSeq)));
  return rows.map((row) => row.chatId);
}

/** Rooms whose per-chat document RACK credits this document — the MIRROR of
 *  `domain/databank/persistence/scope.ts::resolveChatDocumentSources`, which is the definition of "this room
 *  reads this document" (D85). The same THREE scope junctions that file unions, run backwards:
 *   • CHAT scope — `chat_documents` (the composite PK leads with chatId, so this rides the documentId index);
 *   • CHARACTER scope — `character_documents` joined through PRESENT character seats (a departed character
 *     stops crediting, exactly as the forward union drops it);
 *   • GLOBAL scope — `global_documents` gives the OWNER, and every room where that owner is a PRESENT HUMAN
 *     MEMBER credits their globals. Note the asymmetry with `resolveWorldInfoRooms`' global arm, and it is
 *     faithful, not sloppy: WI global is tenant-scoped to the room's HOST, databank global is credited for
 *     every present member (the D85 widening).
 *  The host's per-document VISIBILITY override is deliberately NOT consulted: a hidden document is still IN
 *  the union (the panel shows it to the host, the retrieval path subtracts it), and the fan is id-free — a
 *  room that did not need the refresh learns nothing from it, while dropping a room whose host had hidden the
 *  document would make the host's own rack stale on their second device. */
async function resolveDatabankRooms(db: Db, documentId: DocumentId): Promise<ChatId[]> {
  const [chatScoped, characterScoped, globalScoped] = await Promise.all([
    db.select({ chatId: chatDocuments.chatId }).from(chatDocuments).where(eq(chatDocuments.documentId, documentId)),
    db
      .select({ chatId: chatParticipants.chatId })
      .from(characterDocuments)
      .innerJoin(chatParticipants, eq(chatParticipants.characterId, characterDocuments.characterId))
      .where(and(eq(characterDocuments.documentId, documentId), eq(chatParticipants.kind, "character"), isNull(chatParticipants.leftSeq))),
    db
      .select({ chatId: chatParticipants.chatId })
      .from(chatParticipants)
      .where(
        and(
          inArray(
            chatParticipants.userId,
            db.select({ ownerId: globalDocuments.ownerId }).from(globalDocuments).where(eq(globalDocuments.documentId, documentId)),
          ),
          eq(chatParticipants.kind, "human"),
          isNull(chatParticipants.leftSeq),
        ),
      ),
  ]);
  return [...chatScoped, ...characterScoped, ...globalScoped].map((row) => row.chatId);
}

/** THE DECLARATIVE REACH TABLE. `satisfies` is the belt: a new `RoomEntityKind` fails tsc here until it says
 *  which rooms read it. Not exported — the fan below is the only consumer, and the table is the engine's own
 *  dispatch, not a shape anyone else re-derives. */
const ROOM_REACH = {
  character: resolveCharacterRooms,
  persona: resolvePersonaRooms,
  "world-info": resolveWorldInfoRooms,
  regex: resolveRegexScriptRooms,
  databank: resolveDatabankRooms,
} satisfies RoomReachTable;

/** Resolve + fan one kind. Deduped (the world-info scopes and the persona sources overlap by design — a chat
 *  can seat a persona AND anchor it), and the emits are ordered but not awaited-per-room: the live-only fan is
 *  a synchronous in-process publish with no durable write and no seq to serialize against. */
function fanTo(emitRoomEvent: (event: LiveOnlyChatBusEvent) => void, entity: RoomEntityKind, rooms: readonly ChatId[]): void {
  for (const chatId of new Set(rooms)) {
    emitRoomEvent({ type: "roomEntityChanged", chatId, entity });
  }
}

// ─── PRE-WRITE DELETE REACH CAPTURE (design §3.6 residual) ───────────────────────────────────────────────
// The subscriber above resolves rooms AFTER the domain event fires — correct for a CONTENT edit, but a DELETE
// tears the seating junction down as it commits: `personas` delete NULLs every `chat_participants.activePersonaId`
// and `chats.anchorPersonaId` (`onDelete:"set null"`), a `world_books` delete CASCADEs all four scope junctions
// (`onDelete:"cascade"`). So a fire-and-forget post-write reach for a delete resolves ∅ ALWAYS — the co-member's
// roster identity / assembly pool stays stale until they reload. The fix is the emits-precede-deletes shape run
// backwards: resolve the seated rooms BEFORE the delete (junction intact), hold the set, and fan `roomEntityChanged`
// to it AFTER the row is confirmed gone. This factory hands each deletable domain a `(id) => Promise<() => void>`:
// call it before the delete to snapshot, call the returned thunk after — a live-only, non-durable, non-rejecting
// publish that cannot fault the write it follows.

/** A pre-write reach capture per deletable entity kind. Each arm resolves the entity's seated rooms NOW and
 *  returns a THUNK that fans `roomEntityChanged{entity}` to that captured set. The verb calls the thunk only
 *  after its own delete confirms rows were removed; discarding the thunk (a NotFound delete) fans nothing.
 *  Character is absent by design — a `characters` delete has no member-visible residual on this bridge (a
 *  departed/vanished seat repaints through the roster's own membership fan). */
export interface DeleteReachCapture {
  readonly persona: (personaId: PersonaId) => Promise<() => void>;
  readonly "world-info": (bookId: WorldBookId) => Promise<() => void>;
  /** REGEX (#1746) — plural, and its thunk takes the CONFIRMED-deleted subset. Both regex delete verbs work
   *  over an id LIST, and `bulkRemoveScripts` deliberately never pre-reads for ownership (one owner-scoped
   *  DELETE … RETURNING is the whole verb), so the ids the caller NAMED are not the ids that were deleted.
   *  Snapshotting per script and fanning only the confirmed set is what keeps a foreign id in a bulk list
   *  from nudging a stranger's room. */
  readonly regex: (scriptIds: readonly RegexScriptId[]) => Promise<(deleted: readonly RegexScriptId[]) => void>;
  /** DATABANK (#2471) — a `documents` delete CASCADEs all three D85 scope junctions (`chat_documents`,
   *  `character_documents`, `global_documents`), so a post-write reach is ∅ ALWAYS and every co-member's rack
   *  would keep rendering a document that no longer exists. Same contract as the two above: snapshot before
   *  the DELETE, fan the thunk only once `RETURNING` proved a row was really the caller's and was removed. */
  readonly databank: (documentId: DocumentId) => Promise<() => void>;
}

/** Resolve one kind's rooms and return the fan thunk, ERROR-ISOLATED like the domain-event subscriber
 *  (`event-bus.ts`): a reach-query failure degrades to fanning nothing (the pre-fix stale behavior) and NEVER
 *  rejects, so the delete that is about to run can never be faulted by the freshness lookup that precedes it. */
async function captureRooms(
  resolve: () => Promise<ChatId[]>,
  entity: RoomEntityKind,
  emitRoomEvent: (event: LiveOnlyChatBusEvent) => void,
): Promise<() => void> {
  const rooms = await resolve().catch((err: unknown): ChatId[] => {
    getLog().warn({ err, entity }, "room-reach: pre-write delete capture failed; the delete proceeds unannounced");
    return [];
  });
  return (): void => {
    fanTo(emitRoomEvent, entity, rooms);
  };
}

/** Build the pre-write delete-reach capture, bound to the same live-only emit surface the content fan uses.
 *  Injected into the persona + world-info domains as `captureRoomReachForDelete` — the delete verbs snapshot
 *  through it before their delete and fan the returned thunk after (design §3.6 residual). */
export function createDeleteReachCapture(db: Db, emitRoomEvent: (event: LiveOnlyChatBusEvent) => void): DeleteReachCapture {
  return {
    persona: (personaId) => captureRooms(() => resolvePersonaRooms(db, personaId), "persona", emitRoomEvent),
    "world-info": (bookId) => captureRooms(() => resolveWorldInfoRooms(db, bookId), "world-info", emitRoomEvent),
    regex: (scriptIds) => captureRegexScriptRooms(db, scriptIds, emitRoomEvent),
    databank: (documentId) => captureRooms(() => resolveDatabankRooms(db, documentId), "databank", emitRoomEvent),
  };
}

/** The regex arm of the capture above. Same error-isolation contract (a reach-query failure degrades to
 *  fanning nothing and NEVER rejects, so the delete that follows can never be faulted by the freshness
 *  lookup), and the same live-only fan — the difference is only the plural id and the confirmed-set filter.
 *  ONE `roomEntityChanged` per reached ROOM, not per deleted script: the payload is id-free by design
 *  (contracts §3.3), so a second event for the same room carries no new information and buys a second
 *  refetch of the read the first one already invalidated. */
async function captureRegexScriptRooms(
  db: Db,
  scriptIds: readonly RegexScriptId[],
  emitRoomEvent: (event: LiveOnlyChatBusEvent) => void,
): Promise<(deleted: readonly RegexScriptId[]) => void> {
  const byScript = await resolveRegexScriptsRooms(db, scriptIds).catch((err: unknown): Map<RegexScriptId, ChatId[]> => {
    getLog().warn({ err, entity: "regex" }, "room-reach: pre-write delete capture failed; the delete proceeds unannounced");
    return new Map();
  });
  return (deleted): void => {
    fanTo(
      emitRoomEvent,
      "regex",
      deleted.flatMap((scriptId) => byScript.get(scriptId) ?? []),
    );
  };
}

// ─── THE REGEX ROOM FAN (#1733) ──────────────────────────────────────────────────────────────────────────
// The regex kind does not ride the DOMAIN-EVENT path above, and that is not an omission. Its member-visible
// staleness has two shapes with two different inputs:
//   • the ROOM's own junction moved (`attachToChat` / `detachFromChat` / the chat arm of `applyScopeOrder`) —
//     the verb already holds the `chatId`, so there is nothing to resolve; a reach lookup would be a query
//     that re-derives its own argument.
//   • a LIBRARY ROW moved (`updateScript`, `bulkSetScriptsEnabled`, `bulkSetScriptsPlacement` — the section's
//     row switch is off-EVERYWHERE by design, and a placement change moves what the row's tier RUNS) — the
//     rooms are `ROOM_REACH.regex`'s answer, resolved AFTER the write because the rows survive it.
//   • a LIBRARY ROW was DELETED (`removeScript`, `bulkRemoveScripts`, #1746) — `chat_regex_scripts` CASCADEs
//     with the row, so a post-write reach is ∅ ALWAYS. That is the delete-capture shape above, not this one.
// Both are injected into `RegexContext` as flat ops (the `captureRoomReachForDelete` posture: the DOMAIN
// declares the op it needs, the composition root owns the fan and the SQL). Before them, all three chat-arm
// verbs emitted a `regexChanged` USER event only, so a host's attach repainted the host and left every other
// member of the room reading a stale rack until they reloaded.

/** Fan the room plane for ONE room whose regex junction the caller just wrote. Live-only, synchronous, no
 *  durable row — the `roomEntityChanged` posture exactly. */
export function createEmitRoomRegexChanged(emitRoomEvent: (event: LiveOnlyChatBusEvent) => void): (chatId: ChatId) => void {
  return (chatId): void => {
    fanTo(emitRoomEvent, "regex", [chatId]);
  };
}

/** Fan every room that ATTACHES this library row. ERROR-ISOLATED like the delete capture: a reach-query
 *  failure degrades to fanning nothing (the pre-#1733 stale behavior) and never rejects, so the library write
 *  it follows can never be faulted by the freshness lookup. */
export function createFanRegexScriptRooms(db: Db, emitRoomEvent: (event: LiveOnlyChatBusEvent) => void): (scriptId: RegexScriptId) => Promise<void> {
  return async (scriptId): Promise<void> => {
    const rooms = await resolveRegexScriptRooms(db, scriptId).catch((err: unknown): ChatId[] => {
      getLog().warn({ err, scriptId }, "room-reach: regex script reach lookup failed; the write proceeds unannounced");
      return [];
    });
    fanTo(emitRoomEvent, "regex", rooms);
  };
}

/** Exhaustiveness guard for the closed `DomainEvent` union (the `search-discovery.ts` precedent) — a new member
 *  must say whether it reaches rooms, and saying "no" is an explicit case, never a fallthrough. */
function assertNeverEvent(event: never): never {
  throw new Error(`room-reach: unhandled domain event: ${JSON.stringify(event)}`);
}

/** Build the domain-event → room fan. Subscribed ALWAYS-ON at the composition root (open-room freshness is
 *  orthogonal to the `corpusAutoindex` search knob — the shipped character fan's own ruling). Fire-and-forget
 *  and error-isolated by the domain-event bus, so a reach query failure can never fault the write that
 *  triggered it. */
export function createRoomEntityFan(db: Db, emitRoomEvent: (event: LiveOnlyChatBusEvent) => void): (event: DomainEvent) => Promise<void> {
  // The param is annotated rather than inferred from the return type: biome's type service does not narrow a
  // contextually-typed union parameter here and calls every case unreachable (the `#world-info` subpath class).
  return async (event: DomainEvent): Promise<void> => {
    switch (event.type) {
      case "character.updated":
        // EVERY card edit, `contentChanged` or not: a co-member's open room must hear a theme/flag change too
        // (the embeddings indexer is the consumer that filters on `contentChanged`, for a different reason).
        fanTo(emitRoomEvent, "character", await ROOM_REACH.character(db, event.characterId));
        return;
      case "persona.updated":
        fanTo(emitRoomEvent, "persona", await ROOM_REACH.persona(db, event.personaId));
        return;
      case "world-info.updated":
        fanTo(emitRoomEvent, "world-info", await ROOM_REACH["world-info"](db, event.bookId));
        return;
      case "asset.created":
        // NO ROOM REACH, deliberately: an asset is content-addressed and immutable, so a STORE creates bytes
        // nobody was already rendering. The room-visible consequence of an avatar change is the character /
        // persona row's `avatarAssetId` pointer moving, which arrives as that entity's own `.updated` event.
        return;
      default:
        return assertNeverEvent(event);
    }
  };
}

// ─── THE DATABANK ROOM FAN (#2471) ───────────────────────────────────────────────────────────────────────
// The per-chat document RACK (`databank.listActiveForChat`) is member-readable by design — room-public prompt
// context — but every databank write announced on the per-person `databankChanged` only, so a host's attach
// repainted the host and left every co-member's rack pre-attach until an unrelated `chatUpdated` happened to
// land. Owner ruling 2026-09-20 closed bridge fork F-E ("im not locked in on three"); this is the fan.
//
// FOUR entry points, because the rack has four different inputs and each knows a DIFFERENT key. The rule
// that picks between them is always the same: fan the rooms whose rack CHANGED, resolved through a junction
// the write did not itself tear down.
//   • the ROOM's own junction moved (`attachToChat` / `detachFromChat`) — the verb holds the `chatId`;
//     resolving anything would be a query that re-derives its own argument.
//   • a CHARACTER-scope junction moved (`attachToCharacter` / `detachFromCharacter`) — the reach is the rooms
//     SEATING that character, and `chat_participants` is untouched by the write, so one resolver serves both
//     directions (the detach's own junction row is gone, which is exactly why the characterId is the key).
//   • a GLOBAL-scope junction moved (`attachGlobal` / `detachGlobal`) — same argument one axis over: the
//     reach is the rooms the OWNER is presently seated in, read off `chat_participants`.
//   • a LIBRARY row moved (`rename` — the rack renders the name) — all three scope junctions survive the
//     write, so the document's own full reach is resolvable after it.
// A document DELETE is the fifth input and is NOT here: its junctions cascade, so it takes the pre-write
// `DeleteReachCapture.databank` arm above.
//
// Every one is ERROR-ISOLATED like the regex fan: a reach-query failure degrades to fanning nothing (the
// pre-#2471 stale behaviour) and never rejects, so the write it follows can never be faulted by the freshness
// lookup that follows it.

/** Fan ONE room whose chat-scope document junction the caller just wrote. Live-only, synchronous, no durable
 *  row — the `roomEntityChanged` posture exactly (`createEmitRoomRegexChanged`'s twin). */
export function createEmitRoomDatabankChanged(emitRoomEvent: (event: LiveOnlyChatBusEvent) => void): (chatId: ChatId) => void {
  return (chatId): void => {
    fanTo(emitRoomEvent, "databank", [chatId]);
  };
}

/** Fan every room that credits this document through ANY of the three D85 scope junctions — the `rename`
 *  input, where the library row moved and all three junctions survive the write. */
export function createFanDatabankDocumentRooms(db: Db, emitRoomEvent: (event: LiveOnlyChatBusEvent) => void): (documentId: DocumentId) => Promise<void> {
  return async (documentId): Promise<void> => {
    fanTo(emitRoomEvent, "databank", await resolveRoomsOrNone(() => resolveDatabankRooms(db, documentId), "document"));
  };
}

/** Fan every room SEATING this character — the character-scope attach/detach input. */
export function createFanDatabankCharacterRooms(db: Db, emitRoomEvent: (event: LiveOnlyChatBusEvent) => void): (characterId: CharacterId) => Promise<void> {
  return async (characterId): Promise<void> => {
    fanTo(emitRoomEvent, "databank", await resolveRoomsOrNone(() => resolveCharacterRooms(db, characterId), "character"));
  };
}

/** Fan every room this HUMAN is presently seated in — the global-scope attach/detach input (D85 credits every
 *  present member's globals, so the reach is the member's own rooms, not the rooms they host). */
export function createFanDatabankMemberRooms(db: Db, emitRoomEvent: (event: LiveOnlyChatBusEvent) => void): (ownerId: UserId) => Promise<void> {
  return async (ownerId): Promise<void> => {
    fanTo(emitRoomEvent, "databank", await resolveRoomsOrNone(() => resolveMemberRooms(db, ownerId), "member"));
  };
}

/** The shared error-isolation wrapper for the three databank lookups above: a failed reach query degrades to
 *  fanning nothing and is logged, never thrown. `key` names WHICH lookup failed in the log line. */
function resolveRoomsOrNone(resolve: () => Promise<ChatId[]>, key: string): Promise<ChatId[]> {
  return resolve().catch((err: unknown): ChatId[] => {
    getLog().warn({ err, entity: "databank", key }, "room-reach: databank reach lookup failed; the write proceeds unannounced");
    return [];
  });
}
