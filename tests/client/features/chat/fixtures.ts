// Chat CT fixtures — plain client read-model literals (the support/factories are DB-row builders for
// a different layer). Kept OUT of _ct-stories.tsx so that module exports only components
// (lint useComponentExportOnlyModules). Imported by the stories + the .ct.tsx assertions.

import type { CastEntry, MessageView } from "@orb/contracts/chat";
import type { ParticipantRole } from "@orb/contracts/identity";
import type { ChatId, MessageId, MessageVariantId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

/** The `chat.listMessages` wire shape (MessagesPage — packages/server/src/domain/chat/contract/
 *  views.ts). A plain client read-model literal (see the header) — the return type CHANGED from a
 *  bare `MessageView[]` (Chat-Macro-Resolution.md §1/§3; the D137 kind-polymorphic `cast`). */
export interface MessagesPageFixture {
  readonly messages: readonly MessageView[];
  readonly cast: readonly CastEntry[];
}

/** Wrap a `chat.listMessages` stub's messages array into its actual `MessagesPage` wire shape. The
 *  default empty cast is still a real (if empty) shape, never routeTrpc's generic unlisted-procedure
 *  `null`. */
export function makeMessagesPage(messages: readonly MessageView[], cast: readonly CastEntry[] = []): MessagesPageFixture {
  return { messages, cast };
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

/** A fully-valid `MessageView` literal (the client read model — slot ⋈ selected variant). */
export function makeMessageView(overrides: Partial<MessageView> = {}): MessageView {
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
    cacheReadTokens: null,
    cacheWriteTokens: null,
    contextWindow: null,
    costUsd: null,
    ttftMs: null,
    genStartedAt: null,
    genFinishedAt: null,
    generationId: null,
    contextBoundaryMessageId: null,
    ...overrides,
  };
}

/** The `chat.listChats` row shape (ChatSummary — packages/server/src/domain/chat/contract/views.ts).
 *  A plain client read-model literal (see the header); `participantNames` is names-only, while
 *  `participantCharacterIds` is what the row resolves its PORTRAIT from (F7). Ids are plain strings —
 *  the wire shape routeTrpc fulfills. */
export interface ChatSummaryFixture {
  readonly id: string;
  readonly title: string | null;
  readonly star: boolean;
  readonly archived: boolean;
  readonly parentChatId: string | null;
  readonly lastMessageAt: number | null;
  readonly messageCount: number;
  readonly participantNames: readonly string[];
  readonly participantCharacterIds: readonly string[];
  /** The server-resolved scent line (null = nothing this caller may see). */
  readonly lastMessagePreview: string | null;
  /** The rpg game marker (`metadata.rpg` presence). */
  readonly isGame: boolean;
  readonly viewerRole: ParticipantRole;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** A fully-valid `ChatSummary` literal — the chats-list row. */
export function makeChatSummary(overrides: Partial<ChatSummaryFixture> = {}): ChatSummaryFixture {
  return {
    id: "chat_ct_list_1",
    title: "A grand adventure",
    star: false,
    archived: false,
    parentChatId: null,
    lastMessageAt: FROZEN_AT,
    messageCount: 4,
    participantNames: ["Aria Nightshade"],
    participantCharacterIds: [],
    lastMessagePreview: null,
    isGame: false,
    viewerRole: "host",
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
    ...overrides,
  };
}
