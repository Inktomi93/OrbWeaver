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

import type { LiveOnlyChatBusEvent } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { chatParticipants, chats } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { and, eq, isNull } from "drizzle-orm";
import { can } from "#domain/admin";
import { parseChatMetadata } from "#domain/chat";
import type {
  ExportCardScripts,
  ExportRegexScripts,
  ImportCardScripts,
  ImportGlobalScripts,
  ImportPresetScripts,
  ImportRegexScript,
  RegexContext,
  RegexService,
  ResolveRegexSources,
} from "#domain/regex";
import {
  createExportCardScripts,
  createExportRegexScripts,
  createImportCardScripts,
  createImportGlobalScripts,
  createImportPresetScripts,
  createImportRegexScript,
  createRegexService,
  createResolveRegexSources,
} from "#domain/regex";
import type { AuditEntry } from "#foundation/observability";
import { requireHost, requireParticipant } from "../../domain/chat/index.ts";
import { publishUserEvent } from "../../transport/trpc/index.ts";
import { minter } from "./minter.ts";
import { createDeleteReachCapture, createEmitRoomRegexChanged, createFanRegexScriptRooms } from "./room-reach.ts";
import { createResolveVisibleRooms } from "./visible-rooms.ts";

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

/** What the regex seam needs from the composition root. */
export interface RegexComposeDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  /** chat's DURABLE-APPEND-FREE live fan — the entity→room bridge's emit surface (the world-info precedent).
   *  Threaded here for #1733: regex's chat-arm writes and its library-row switch both have a member-visible
   *  projection in rooms, and `regexChanged` is a per-USER channel that never reaches them. */
  readonly emitChatEventLive: (event: LiveOnlyChatBusEvent) => void;
}

/** The regex compose product: the service + the four portability ops + the chat-turn resolve op. */
export interface RegexComposeResult {
  readonly regex: RegexService;
  /** Injected onto `ChatContext` — the ONE home of the four-scope junction dereference. */
  readonly resolveRegexSources: ResolveRegexSources;
  /** Injected into the card IMPORT path (the `importLorebook` twin). */
  readonly importCardScripts: ImportCardScripts;
  /** The ST profile import's PRESET-scoped lift (`extensions.regex_scripts` on a chat-completion preset). */
  readonly importPresetScripts: ImportPresetScripts;
  /** The ST profile import's GLOBAL lift (`extension_settings.regex` → `global_regex_scripts`). */
  readonly importGlobalScripts: ImportGlobalScripts;
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
    // The SHARED leak-safe reverse-room read — regex's original, promoted to `compose/visible-rooms.ts`
    // when databank and preset became its second and third consumers (#276/#279).
    resolveVisibleRooms: createResolveVisibleRooms(db),
    emitUserEvent: publishUserEvent,
    // #1733 — the ROOM plane. Both arms live at the composition root for the same reason the guards do: the
    // fan is chat's bus and the reach is SQL over chat's junction, and regex may import neither.
    emitRoomRegexChanged: createEmitRoomRegexChanged(deps.emitChatEventLive),
    fanRegexScriptRooms: createFanRegexScriptRooms(db, deps.emitChatEventLive),
    // #1746 — the DELETE arm of the same reach: `chat_regex_scripts` CASCADEs with the library row, so the
    // two remove verbs snapshot through this BEFORE their delete and fan the confirmed set after.
    captureRoomReachForDelete: createDeleteReachCapture(db, deps.emitChatEventLive).regex,
  });

  const portabilityCtx = { db, now, newScriptId };

  return {
    regex,
    resolveRegexSources: createResolveRegexSources({ db }),
    importCardScripts: createImportCardScripts(portabilityCtx),
    importPresetScripts: createImportPresetScripts(portabilityCtx),
    importGlobalScripts: createImportGlobalScripts(portabilityCtx),
    exportCardScripts: createExportCardScripts({ db }),
    exportRegexScripts: createExportRegexScripts({ db }),
    importRegexScript: createImportRegexScript(portabilityCtx),
  };
}
