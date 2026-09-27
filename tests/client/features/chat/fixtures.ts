// Chat CT fixtures — plain client read-model literals (the support/factories are DB-row builders for
// a different layer). Kept OUT of _ct-stories.tsx so that module exports only components
// (lint useComponentExportOnlyModules). Imported by the stories + the .ct.tsx assertions.

import type { ChatIdentity, MessageView } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { ParticipantRole } from "@orb/contracts/identity";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { CharacterId, ChatId, MessageId, MessageVariantId, UserConnectionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { makeResolvedView } from "../../../support/factories/resolved-connection.ts";
import { testModelId, testProviderId } from "../../../support/inference-identities.ts";
import type { TrpcInput, TrpcRoutes, TrpcWireOutput } from "../../../support/node/route-trpc.ts";

/** The `chat.listMessages` wire shape (MessagesPage — packages/server/src/domain/chat/contract/
 *  views.ts). A plain client read-model literal (see the header) — the return type CHANGED from a
 *  bare `MessageView[]` (Chat-Macro-Resolution.md §1/§3; the D137 kind-polymorphic `cast`). */
export type MessagesPageFixture = TrpcWireOutput<"chat.listMessages">;

/** Wrap a `chat.listMessages` stub's messages array into its actual `MessagesPage` wire shape. The
 *  default empty cast is still a real (if empty) shape, never routeTrpc's generic unlisted-procedure
 *  `null`. */
export function makeMessagesPage(messages: readonly MessageView[], identities: readonly ChatIdentity[] = []): MessagesPageFixture {
  return { messages, identities };
}

/** The `chat.listChats` wire shape (`ChatListPage`) — keyset page + the server's real census. */
export type ChatListPageFixture = TrpcWireOutput<"chat.listChats">;

/**
 * An INPUT-AWARE `chat.listChats` responder — the stub applies the same narrowing the server does
 * (`characterId` · `search` · `limit` · `cursor`), so a CT drives the real semantics instead of a stub that
 * hands back everything no matter what the surface asked. That distinction became load-bearing on 2026-08-09,
 * when the per-character scope and the search predicate BOTH moved server-side: a fixed-array stub would have
 * made every filter/search CT pass by ignoring the very input under test.
 *
 * The search arm matches title · `participantNames` · `lastMessagePreview`. The server's own name arm reads
 * CHARACTER SEAT names, which this row shape does not carry separately — `participantNames` is its stand-in,
 * and it is the same string the row renders.
 *
 * It PAGES (2026-08-14, the `character.list` twin's shape): the stub used to answer every request with the
 * first `limit` rows and `nextCursor: null`, so no CT could ever reach a second page — which is precisely why
 * the client-side page-window eviction (`maxPages: 5`, head page unrecoverable) lived behind a green chat CT
 * suite. Ordering is the ARRAY's; the cursor is the last served row's `(recencyAt, id)`, the real wire shape.
 */
export function chatListResponder(all: readonly ScopedChatSummaryFixture[]): (input: TrpcInput<"chat.listChats">) => ChatListPageFixture {
  return (input): ChatListPageFixture => {
    const args = input ?? {};
    const needle = args.search?.trim().toLowerCase() ?? "";
    const scoped = all.filter((chat) => args.characterId === undefined || chat.filterCharacterIds.includes(args.characterId));
    const matched = scoped.filter(
      (chat) =>
        needle === "" ||
        (chat.title?.toLowerCase().includes(needle) ?? false) ||
        (chat.lastMessagePreview?.toLowerCase().includes(needle) ?? false) ||
        chat.participantNames.some((name) => name.toLowerCase().includes(needle)),
    );
    const cursorId = args.cursor?.id;
    const from = cursorId === undefined ? 0 : matched.findIndex((chat) => chat.id === cursorId) + 1;
    const limit = args.limit ?? matched.length;
    const items = matched.slice(from, from + limit).map(({ filterCharacterIds: _filterCharacterIds, ...chat }) => chat);
    const last = items.at(-1);
    return {
      items,
      // A FULL page always carries a cursor — the verb mints one from a full page without a lookahead peek
      // (`domain/chat/verbs/read.ts`), so exhaustion is discovered on the next (short) fetch. Reproduced here
      // or the tail-fetch guard stops one page early.
      nextCursor: items.length === limit && last !== undefined ? { recencyAt: last.lastMessageAt ?? last.updatedAt, id: last.id } : null,
      totalCount: matched.length,
      // The census the server takes over the whole scope, never this page.
      viewerLastTurnAt: matched.reduce<number | null>(
        (latest, chat) => (chat.viewerLastTurnAt !== null && (latest === null || chat.viewerLastTurnAt > latest) ? chat.viewerLastTurnAt : latest),
        null,
      ),
    };
  };
}

/** The fixed chat the stories address — the CT's routeTrpc/routeOrbSocket key off this id. */
export const CHAT_ID = castId<ChatId>("chat_ct_keystone");
/** The chat a committed `ComposerStory` addresses — its own id (distinct from `CHAT_ID`) so the
 *  composer suite's turn slots never collide with the message-list suite's in the shared store. */
export const COMPOSER_CHAT_ID = castId<ChatId>("chat_ct_composer");

/** The `unavailableReason` the slash-command stories' `/locked` fake returns — shared with the CT that
 *  asserts it, and homed HERE (not on the story module) because a `.ct.tsx` may import only components
 *  from a story module (Playwright's CT transform double-declares a mixed value+component import). */
export const SLASH_LOCKED_REASON = "Locked in this room — join it first.";
const FROZEN_AT = 1_750_000_000_000;

/** The viewer's one connection row in the ambient feed — the row their chat role resolves to. */
const AMBIENT_CONNECTION = {
  id: "user_connection_ctambient001",
  ownerId: "user_ct_viewer",
  label: "Everyday chat",
  providerId: "openrouter",
  providerLabel: "OpenRouter",
  credentialId: null,
  baseUrl: null,
  model: "openai/gpt-5-mini",
  api: "auto",
  declared: null,
  extras: null,
  transport: null,
  modelCheck: "listed",
  allowBackground: true,
  promptCache: null,
  tasks: ["chat"],
  createdAt: FROZEN_AT,
  updatedAt: FROZEN_AT,
} as const satisfies TrpcWireOutput<"connection.list">[number];

/**
 * THE AMBIENT READS OF A MOUNTED CHAT TREE (#637) — spread into every `routeTrpc` call in this feature so
 * the pipelines behind them actually RUN.
 *
 * WHY THIS EXISTS. These four are nobody's SUBJECT: a composer CT is about the composer, not about the
 * display-script tier or the pre-send gate. But `routeTrpc` answers an unlisted procedure `null` by design,
 * and `null` is not a view — `useDisplayScripts` falls to its `?? NO_SCRIPTS` arm and `useSendAvailability`
 * to its `!verdict` arm, so BOTH pipelines ran INERT in 13 chat CT files and a regression inside either was
 * invisible to every one of them (the #629 census found them; #637 fed them). Feeding them with honest
 * DEFAULTS is the point: the hooks now execute their real select/dedup/resolve paths against real wire
 * shapes instead of short-circuiting on a null.
 *
 * THEY ARE DEFAULTS, NOT A CEILING. A file whose subject IS one of these overrides it by listing the same
 * key AFTER the spread (`{ ...CHAT_AMBIENT_ROUTES, "chat.checkSendAvailability": … }`) — composer.ct.tsx's
 * engine-off/engine-down/no-connection arms are exactly that, and they still win.
 */
export const CHAT_AMBIENT_ROUTES: TrpcRoutes<
  | "settings.getUserSettings"
  | "preset.list"
  | "regex.listScripts"
  | "regex.listRoomDisplayScripts"
  | "chat.checkSendAvailability"
  | "rosterPreset.list"
  | "stream.attach"
  | "chat.listReactions"
  | "plugin.listDisplayTransforms"
  | "notifications.presence"
  | "connection.list"
  | "connection.resolveChatCapability"
> = {
  // The viewer's settings row, at the production defaults (`userSettingsSchema.parse({})`) — the same shape
  // the workloads/admin CTs feed. Real config, so a reader that keys off a tier gets a tier.
  "settings.getUserSettings": {
    userId: castId<UserId>("user_ct_viewer"),
    schemaVersion: 1,
    config: DEFAULT_USER_SETTINGS,
    configUnreadable: null,
    updatedAt: FROZEN_AT,
  },
  // The context band's PRESET chip (#860) resolves the viewer's active preset by name against the library
  // (`chat-context-band.tsx`); the defaults above seed `null` (the built-in), so an EMPTY library is the
  // honest companion — the chip prints "Built-in preset" and the read pipeline runs for real.
  "preset.list": [],
  // The two display-tier reads `useDisplayScripts` composes. EMPTY is the honest default (the host broadcast
  // toggle is off by default and a fresh viewer owns no scripts) — but empty ARRAYS run `displaySlice` and the
  // dedup path for real, where `null` skipped them.
  "regex.listScripts": [],
  "regex.listRoomDisplayScripts": [],
  // The pre-send serveability verdict. `available: true` is the un-refused arm every non-availability CT
  // assumes; a null previously reached the same rendering through `!verdict`, which is why the gate's own
  // resolve path never ran.
  "chat.checkSendAvailability": { available: true },
  // The saved-roster library (#26) — the new-chat picker's "Start from a saved roster" gate reads it. EMPTY is the
  // honest default (a fresh viewer owns no saved casts → the opener hides); the opener's own CT overrides it
  // after the spread with a populated list.
  "rosterPreset.list": [],
  // The room bus's attach MUTATION. NOTE THE CORRECTION (#637): `stream.attach` is NOT a subscription and was
  // never on the EventSource path the #629 instrument fix excluded — `use-orb-socket.ts` states plainly that
  // attach/detach "ride the BATCHED HTTP" link and only `stream.connect` is the SSE leg. So it is a genuine
  // unstubbed mutation, not the instrument reporting its own posture. Its result is never read
  // (`await client.stream.attach.mutate(…)` discards it), so feeding `null` changes nothing observable — it
  // simply stops a real mutation riding the lenient null fulfil.
  "stream.attach": null,
  // B6's per-row reaction WINDOW — read by every COMMITTED row's action strip, so it is ambient to any CT that
  // mounts a transcript rather than a fact about reactions. EMPTY is the honest default (a fresh room has no
  // reactions), and an empty GROUPS array runs the grouping path for real where `null` would skip it. B7: the
  // read is a VIEW carrying the room's resolved `reactionsEnabled` verdict — ON here, the shipped posture (a
  // transcript CT should see the same doors production defaults to). A CT whose SUBJECT is reactions
  // overrides it after the spread (message-reactions.ct.tsx does exactly that).
  "chat.listReactions": { reactionsEnabled: true, groups: [] },
  // The plugin DISPLAY-transform gate (seam 14, U6) — read once per room by every committed
  // row's `MessageContent`. EMPTY is the honest default (a fresh viewer has no plugins), and an empty ARRAY
  // exercises the real gate path (`hasTransforms === false` ⇒ zero per-row calls) where `null` would only
  // exercise the defensive arm.
  "plugin.listDisplayTransforms": [],
  // The roster's live-presence read (#1039) — ambient to any CT that mounts the Members tab, which is the
  // context panel's DEFAULT tab, so it is ambient to the whole context-bracket family rather than a fact
  // about presence. EMPTY is the honest default (a CT browser holds no live socket for any seat, so nobody
  // IS online) and, unlike `null`, it is a RESOLVED answer — the rows run the real projection and render the
  // offline arm, where a null would leave every seat on the UNKNOWN branch and the pipeline inert. A CT whose
  // SUBJECT is presence overrides it after the spread.
  "notifications.presence": { onlineUserIds: [] },
  // The room's connection readouts (item 0024): the composer's next-turn line reads the host viewer's chat
  // role and names it against the viewer's own rows, and the swipe credit resolves connection ids against the
  // same list. The honest default is a viewer whose chat role resolves to a row they own, so both pipelines
  // run their named arm. A CT whose SUBJECT is a readout overrides these after the spread.
  "connection.list": [AMBIENT_CONNECTION],
  // The FULL wire view, built by the shared factory (capability parsed through the contract's schema), so a
  // capability reader mounted beside the composer gets a real descriptor rather than a partial.
  "connection.resolveChatCapability": makeResolvedView({
    connectionId: castId<UserConnectionId>(AMBIENT_CONNECTION.id),
    providerId: testProviderId(AMBIENT_CONNECTION.providerId),
    model: testModelId(AMBIENT_CONNECTION.model),
  }),
};

/**
 * THE ROOM'S CANON READS at their EMPTY-but-real defaults (#637) — the second half of the feed, for the
 * composer-family CTs that mount a room tree without being about the room.
 *
 * Kept apart from {@link CHAT_AMBIENT_ROUTES} because these two ARE the subject in plenty of files: the
 * separation keeps "I am feeding a pipeline that is not my subject" legible against "I am supplying my
 * subject's data". Same override rule — list the key after the spread and it wins.
 *
 * The `chat.getChat` literal is a PARTIAL `ChatDetail`, the posture every roster stub in this feature already
 * takes (message-list-surface.ct's ROSTER_STUB, chats-section.ct's `chatDetail`): only the fields a reader
 * actually reaches for, every one of them at the honest empty/default value — a solo-less roster, no anchor
 * persona, no room overrides, the default group config, no RPG pointer, and a viewer who IS the host (the
 * un-gated arm every non-permission CT assumes).
 */
export const CHAT_ROOM_ROUTES: TrpcRoutes<"chat.getChat" | "chat.listMessages"> = {
  "chat.getChat": {
    title: null,
    participants: [],
    identities: [],
    anchorPersonaId: null,
    group: DEFAULT_GROUP_CONFIG,
    rpg: null,
    viewerIsHost: true,
  },
  "chat.listMessages": { messages: [], identities: [] },
};

/** A fully-valid `MessageView` literal (the client read model — slot ⋈ selected variant). */
export function makeMessageView(overrides: Partial<MessageView> = {}): MessageView {
  const tokenProvenance =
    overrides.tokenProvenance ??
    ((overrides.tokensIn !== null && overrides.tokensIn !== undefined) || (overrides.tokensOut !== null && overrides.tokensOut !== undefined)
      ? "measured"
      : "unrecorded");
  return {
    id: castId<MessageId>("msg_ct_1"),
    toolCalls: [],
    chatId: CHAT_ID,
    seq: 1,
    role: "assistant",
    kind: "standard",
    authorUserId: null,
    characterId: null,
    personaId: null,
    excludedFromPrompt: false,
    createdAt: FROZEN_AT,
    editedAt: null,
    selectedVariantId: castId<MessageVariantId>("mv_ct_1"),
    selectedVariantIdx: 0,
    variantCount: 1,
    hasContinuation: false,
    content: "Hello there",
    reasoning: null,
    model: null,
    provider: null,
    finishReason: null,
    stopReason: null,
    terminalReason: null,
    tokensIn: null,
    tokensOut: null,
    tokenProvenance,
    costProvenance: overrides.costProvenance ?? "unrecorded",
    cacheReadTokens: null,
    cacheWriteTokens: null,
    contextWindow: null,
    costUsd: null,
    ttftMs: null,
    genStartedAt: null,
    genFinishedAt: null,
    generationId: null,
    connectionId: null,
    contextBoundaryMessageId: null,
    ...overrides,
  };
}

/** The `chat.listChats` row shape (ChatSummary — packages/server/src/domain/chat/contract/views.ts).
 *  A plain client read-model literal (see the header); `participantNames` is names-only and
 *  `participantPortraits` is what the row PAINTS its leading slot from (F7 + #192 — the seats ride the row
 *  now; there is no character-library read to stub for a portrait). Ids are plain strings — the wire shape
 *  routeTrpc fulfills. */
interface ChatSummaryFixture {
  readonly id: string;
  readonly title: string | null;
  readonly starred: boolean;
  readonly archived: boolean;
  readonly lastMessageAt: number | null;
  /** When the viewer last spoke here (null = never): Home resumes the viewer's own room and tells a first-run
   *  account apart from one that has spoken. */
  readonly viewerLastTurnAt: number | null;
  readonly messageCount: number;
  readonly participantNames: readonly string[];
  /** The row's own character seats, in seat order — the leading portrait / AvatarStack (#192). Branded,
   *  because `characterId` is a NAME POSITION the ids gate reads, and a fixture that declares it `string`
   *  is the same compile-time hole in a test that it would be in a source file. Build one with
   *  {@link makeSeatPortrait} rather than a bare literal. */
  readonly participantPortraits: readonly { readonly characterId: CharacterId; readonly name: string; readonly avatarHash: string | null }[];
  /** The server-resolved scent line (null = nothing this caller may see). */
  readonly lastMessagePreview: string | null;
  /** The rpg game marker — a LIVE game (`isRpgEngaged` over the pointer). */
  readonly isGame: boolean;
  /** #863(f) — a game that EXISTS here but is switched off; the row wears the quiet paused marker. */
  readonly gamePaused: boolean;
  readonly viewerRole: ParticipantRole;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** Harness-only character projection metadata. `chatListResponder` consumes and strips this before returning
 *  the wire row, so tests can prove the server-narrowed query without reviving a removed `ChatSummary` field. */
export interface ScopedChatSummaryFixture extends ChatSummaryFixture {
  readonly filterCharacterIds: readonly string[];
}

/** ONE seat on a chat row (`ChatSummary.participantPortraits`) — the branded id minted from a plain
 *  fixture string, so a CT names its characters the way it always has. */
export function makeSeatPortrait(
  id: string,
  name: string,
  avatarHash: string | null = null,
): { characterId: CharacterId; name: string; avatarHash: string | null } {
  return { characterId: castId<CharacterId>(id), name, avatarHash };
}

/** A fully-valid `ChatSummary` literal — the chats-list row. */
export function makeChatSummary(overrides: Partial<ScopedChatSummaryFixture> = {}): ScopedChatSummaryFixture {
  return {
    id: "chat_ct_list_1",
    title: "A grand adventure",
    starred: false,
    archived: false,
    lastMessageAt: FROZEN_AT,
    viewerLastTurnAt: FROZEN_AT,
    messageCount: 4,
    participantNames: ["Aria Nightshade"],
    filterCharacterIds: [],
    participantPortraits: [],
    lastMessagePreview: null,
    isGame: false,
    gamePaused: false,
    viewerRole: "host",
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
    ...overrides,
  };
}
