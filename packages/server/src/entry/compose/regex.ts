// Composition seam for the regex SCRIPT LIBRARY (D121-E) + the four portability ops built alongside it (the
// card lift, the card re-embed, and the backup-bundle export/import pair). Built EARLY — before chat —
// because chat's `ChatContext.resolveRegexSources` is one of its products, and the resolve op needs nothing
// but `db`. The SERVICE needs chat's membership guards for the room scope, but those are the standalone
// `requireHost`/`requireParticipant` factories off chat's front door (the world-info compose precedent),
// not the built chat service — so there is no ordering knot.
//
// The ENGINE is composed elsewhere and stays there: `@orb/kit/regex` executes, and the `node:vm` ReDoS
// watchdog (`@orb/server/kit/regex`) is injected onto ChatContext as `applyRegexReplace`. This seam wires
// only the DATA the engine runs on (AGENTS §1 "engine vs data").

import type { Db } from "@orb/db";
import { characters, chatParticipants, chats, personas, users } from "@orb/db";
import type { ChatId, UserId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { can } from "#domain/admin";
import { parseChatMetadata, REMOVED_MEMBER_LABEL } from "#domain/chat";
import type {
  ExportCardScripts,
  ExportRegexScripts,
  ImportCardScripts,
  ImportRegexScript,
  RegexContext,
  RegexService,
  ResolveRegexSources,
} from "#domain/regex";
import {
  createExportCardScripts,
  createExportRegexScripts,
  createImportCardScripts,
  createImportRegexScript,
  createRegexService,
  createResolveRegexSources,
} from "#domain/regex";
import type { AuditEntry } from "#foundation/observability";
import { requireHost, requireParticipant } from "../../domain/chat/index.ts";
import { publishUserEvent } from "../../transport/trpc/index.ts";
import { minter } from "./minter.ts";

const LIMIT_ONE = 1;

/**
 * The D121-E display-tier room policy (owner ruling 2026-08-02) — "does this room broadcast the HOST's
 * display scripts, and who is its host". Built HERE rather than inside `domain/regex` because both halves
 * are CHAT's data (the roster's host seat + the `chatMetadata.hostDisplayScripts` flag), and regex reads
 * neither the roster nor chat metadata — the same one-directional posture as its injected guards.
 *
 * A hostless room (an archived orphan whose host left) broadcasts NOTHING: there is no one whose scripts a
 * viewer could be reading, so the room silently falls back to the per-user default.
 */
function makeResolveRoomDisplayPolicy(db: Db): RegexContext["resolveRoomDisplayPolicy"] {
  return async (chatId: ChatId) => {
    const [row] = await db.select({ metadata: chats.metadata }).from(chats).where(eq(chats.id, chatId)).limit(LIMIT_ONE);
    // The fault-isolated parse seam — a corrupt sibling sub-blob must never take the toggle down with it.
    const enabled = parseChatMetadata(row?.metadata).hostDisplayScripts === true;
    if (!enabled) {
      // Short-circuit: while the option is OFF nobody needs to know who the host is, and the verb returns
      // `[]` regardless — so the roster read never happens on the default path.
      return { enabled: false, hostUserId: null };
    }
    const [host] = await db
      .select({ userId: chatParticipants.userId })
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.role, "host"), isNull(chatParticipants.leftSeq)))
      .limit(LIMIT_ONE);
    return { enabled: true, hostUserId: host?.userId ?? null };
  };
}

/**
 * The REVERSE-roster room filter (REGROSTER) — "of these rooms, which may this caller see, and what does a
 * roster row need to name them". Built HERE for the same reason `resolveRoomDisplayPolicy` is: rooms carry
 * no `ownerId` (D18), so their scope is `chat_participants` and their identity data is chat's — regex reads
 * neither.
 *
 * PRESENT membership only (`leftSeq IS NULL`): a room the caller has left keeps the attachment row, and
 * naming it would tell an ex-member a room they can no longer open still exists and still runs their
 * script. Absent from the answer is the same leak-free collapse `requireParticipant` makes, without a throw.
 *
 * ── SUPERSEDED RULING, RECORDED (owner pick 2026-08-09, REGROSTER's parked naming question) ──
 * This function used to return a finished `name` and its header said, verbatim, that the middle rung of the
 * chats list's title chain — the participant-name projection — was "deliberately not re-derived here…not
 * worth making regex's cheapest read pay for it". The consequence was the reported defect: every unnamed
 * room in the regex roster read "Untitled chat" while the chats list two panes over called the same room
 * "Azarael". The owner ruled the roster should name rooms the way the chats list does.
 *
 * THE COST ARGUMENT IS PRESERVED, not discarded — it is why this is TWO statements and not an N+1:
 *   • the room read is unchanged (one filtered join over an already-bounded candidate id set);
 *   • the cast read is ONE more statement over the ids that read returned, with the character/persona/user
 *     joins inlined. There is no per-room query, and a script attached to no visible room asks nothing.
 * What is NOT re-derived here is the title CHAIN itself: this hands back the chain's inputs and the client's
 * one `deriveChatTitle` runs it (see `RegexRoomRef`). A second copy of the rule is what caused the defect.
 *
 * The order is `chats.updatedAt` DESC — the chats list's own ORDER BY. A name sort is no longer available
 * (the server does not know the names), and recency is the honest column: it is the order the user already
 * reads their rooms in. Id breaks the tie so a batch of same-instant rooms is stable.
 */
function makeResolveVisibleRooms(db: Db): RegexContext["resolveVisibleRooms"] {
  return async (principal, chatIds) => {
    const rooms = await db
      .select({ id: chats.id, title: chats.title, at: chats.updatedAt })
      .from(chats)
      .innerJoin(chatParticipants, eq(chatParticipants.chatId, chats.id))
      .where(and(inArray(chats.id, [...chatIds]), eq(chatParticipants.userId, principal.userId), isNull(chatParticipants.leftSeq)));
    if (rooms.length === 0) {
      return [];
    }
    const castByRoom = await loadRoomCasts(
      db,
      rooms.map((room) => room.id),
      principal.userId,
    );
    return rooms
      .map((room) => ({ id: room.id, title: room.title, participantNames: castByRoom.get(room.id) ?? [], at: room.at }))
      .sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
  };
}

/**
 * The present cast of each visible room, as the CHATS LIST spells it — one statement, no fan-out.
 *
 * The per-seat display name is `domain/chat`'s ONE rule (`substrate/participant-name`): a character seat is
 * its live card name, a human seat is their ACTIVE PERSONA's name, else their handle, else the removed-member
 * label. It is reproduced here as JOINS rather than by calling chat's `loadParticipantViews`, because that
 * read resolves avatars, render policies and theme overrides per seat — a per-room, per-seat fan-out this
 * roster has no use for. Both FKs CASCADE (`chat_participants` header: "a deleted character leaves no roster
 * ghost"), so a present seat always has its live row and the removed-* labels are unreachable through this
 * path; they stay spelled for the persona-less human whose publics row is mid-delete.
 *
 * The persona join is OWNER-SCOPED to the seat's own user — the `resolveUserPublics` predicate verbatim, so a
 * persona that somehow outlived its owner's seat can never lend its name to someone else's row.
 *
 * VIEWER SUPPRESSION is the chats list's `summaryCast` rule, floor included: drop the caller's own seat,
 * unless dropping it would empty the cast (a solo room keeps its name instead of collapsing to "Untitled").
 */
async function loadRoomCasts(db: Db, roomIds: readonly ChatId[], viewerUserId: UserId): Promise<ReadonlyMap<ChatId, readonly string[]>> {
  const seats = await db
    .select({
      chatId: chatParticipants.chatId,
      userId: chatParticipants.userId,
      characterName: characters.name,
      personaName: personas.name,
      handle: users.handle,
    })
    .from(chatParticipants)
    .leftJoin(characters, eq(chatParticipants.characterId, characters.id))
    .leftJoin(users, eq(chatParticipants.userId, users.id))
    .leftJoin(personas, and(eq(chatParticipants.activePersonaId, personas.id), eq(personas.ownerId, chatParticipants.userId)))
    .where(and(inArray(chatParticipants.chatId, [...roomIds]), isNull(chatParticipants.leftSeq)))
    .orderBy(asc(chatParticipants.joinSeq));

  const byRoom = new Map<ChatId, { readonly userId: UserId | null; readonly name: string }[]>();
  for (const seat of seats) {
    const name = seat.characterName ?? seat.personaName ?? seat.handle ?? REMOVED_MEMBER_LABEL;
    const bucket = byRoom.get(seat.chatId);
    if (bucket === undefined) {
      byRoom.set(seat.chatId, [{ userId: seat.userId, name }]);
    } else {
      bucket.push({ userId: seat.userId, name });
    }
  }

  const casts = new Map<ChatId, readonly string[]>();
  for (const [chatId, bucket] of byRoom) {
    const others = bucket.filter((seat) => seat.userId !== viewerUserId);
    casts.set(
      chatId,
      (others.length > 0 ? others : bucket).map((seat) => seat.name),
    );
  }
  return casts;
}

/** What the regex seam needs from the composition root. */
export interface RegexComposeDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
}

/** The regex compose product: the service + the four portability ops + the chat-turn resolve op. */
export interface RegexComposeResult {
  readonly regex: RegexService;
  /** Injected onto `ChatContext` — the ONE home of the four-scope junction dereference. */
  readonly resolveRegexSources: ResolveRegexSources;
  /** Injected into the card IMPORT path (the `importLorebook` twin). */
  readonly importCardScripts: ImportCardScripts;
  /** Injected into `ExportContext` — the card RE-EMBED. */
  readonly exportCardScripts: ExportCardScripts;
  /** The backup-bundle descriptor's two halves. */
  readonly exportRegexScripts: ExportRegexScripts;
  readonly importRegexScript: ImportRegexScript;
}

export function buildRegex(deps: RegexComposeDeps): RegexComposeResult {
  const { db, now, audit } = deps;
  const newScriptId = minter(ID_PREFIX.regexScript);

  const regex = createRegexService({
    db,
    now,
    newScriptId,
    audit,
    requireChatHost: (principal, chatId) => requireHost({ db, can }, principal, chatId).then((): void => undefined),
    requireChatMember: (principal, chatId) => requireParticipant({ db, can }, principal, chatId).then((): void => undefined),
    resolveRoomDisplayPolicy: makeResolveRoomDisplayPolicy(db),
    resolveVisibleRooms: makeResolveVisibleRooms(db),
    emitUserEvent: publishUserEvent,
  });

  const portabilityCtx = { db, now, newScriptId };

  return {
    regex,
    resolveRegexSources: createResolveRegexSources({ db }),
    importCardScripts: createImportCardScripts(portabilityCtx),
    exportCardScripts: createExportCardScripts({ db }),
    exportRegexScripts: createExportRegexScripts({ db }),
    importRegexScript: createImportRegexScript(portabilityCtx),
  };
}
