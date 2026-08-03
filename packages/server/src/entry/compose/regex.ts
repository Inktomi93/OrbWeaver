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
import { chatParticipants, chats } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { can } from "#domain/admin";
import { parseChatMetadata } from "#domain/chat";
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
import { requireHost, requireParticipant } from "../../domain/chat";
import { publishUserEvent } from "../../transport/trpc";
import { minter } from "./minter";

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
 * The REVERSE-roster room filter (REGROSTER) — "of these rooms, which may this caller see, and what are
 * they called". Built HERE for the same reason `resolveRoomDisplayPolicy` is: rooms carry no `ownerId`
 * (D18), so their scope is `chat_participants` and their NAME is chat's display vocabulary — regex reads
 * neither.
 *
 * PRESENT membership only (`leftSeq IS NULL`): a room the caller has left keeps the attachment row, and
 * naming it would tell an ex-member a room they can no longer open still exists and still runs their
 * script. Absent from the answer is the same leak-free collapse `requireParticipant` makes, without a throw.
 *
 * The NAME is the authored title, trimmed, else the untitled fallback — the chats list's own first and last
 * rungs. Its MIDDLE rung (the participant-name projection, `deriveChatTitle`) is deliberately not re-derived
 * here: it is a per-caller roster+character join that exists to title a chat CARD, and a three-line roster
 * in a 320px context pane is not worth making regex's cheapest read pay for it.
 */
function makeResolveVisibleRooms(db: Db): RegexContext["resolveVisibleRooms"] {
  return async (principal, chatIds) => {
    const rows = await db
      .select({ id: chats.id, title: chats.title })
      .from(chats)
      .innerJoin(chatParticipants, eq(chatParticipants.chatId, chats.id))
      .where(and(inArray(chats.id, [...chatIds]), eq(chatParticipants.userId, principal.userId), isNull(chatParticipants.leftSeq)));
    // Sorted on the DERIVED name, not the raw column: ordering by `chats.title` would bunch every unnamed
    // room at the top under a label the sort never saw. Id breaks the tie so two "Untitled chat"s are stable.
    return rows
      .map((row) => ({ id: row.id, name: (row.title ?? "").trim() || UNTITLED_ROOM }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  };
}

/** The roster's name for a room nobody has renamed. Matches the chats list's own last-rung string so one
 *  unnamed room reads the same in both places. */
const UNTITLED_ROOM = "Untitled chat";

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
