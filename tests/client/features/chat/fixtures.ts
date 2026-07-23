// Chat CT fixtures — plain client read-model literals (the support/factories are DB-row builders for
// a different layer). Kept OUT of _ct-stories.tsx so that module exports only components
// (lint useComponentExportOnlyModules). Imported by the stories + the .ct.tsx assertions.

import type { ChatMacroNameProducer, MessageView, PersonaAvatarEntry } from "@orb/contracts/chat";
import type { ChatId, MessageId, MessageVariantId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

/** The `chat.listMessages` wire shape (MessagesPage — packages/server/src/domain/chat/contract/
 *  views.ts). A plain client read-model literal (see the header) — the return type CHANGED from a
 *  bare `MessageView[]` (Chat-Macro-Resolution.md §1/§3). */
export interface MessagesPageFixture {
  readonly messages: readonly MessageView[];
  readonly macroNames: ChatMacroNameProducer;
  readonly personaAvatars: readonly PersonaAvatarEntry[];
}

/** The empty `ChatMacroNameProducer` (Chat-Macro-Resolution.md §1) — the CT default for a chat with no
 *  roster/history-persona ids to resolve; still a real (if empty) shape, never routeTrpc's generic
 *  unlisted-procedure `null`. */
export function makeMacroNameProducer(overrides: Partial<ChatMacroNameProducer> = {}): ChatMacroNameProducer {
  return {
    characterNames: [],
    personaNames: [],
    ...overrides,
  };
}

/** Wrap a `chat.listMessages` stub's messages array into its actual `MessagesPage` wire shape. */
export function makeMessagesPage(messages: readonly MessageView[], macroNames: ChatMacroNameProducer = makeMacroNameProducer()): MessagesPageFixture {
  return { messages, macroNames, personaAvatars: [] };
}

/** The fixed chat the stories address — the CT's routeTrpc/routeChatStream key off this id. */
export const CHAT_ID = castId<ChatId>("chat_ct_keystone");
/** The chat a committed `ComposerStory` addresses — its own id (distinct from `CHAT_ID`) so the
 *  composer suite's turn slots never collide with the message-list suite's in the shared store. */
export const COMPOSER_CHAT_ID = castId<ChatId>("chat_ct_composer");
const FROZEN_AT = 1_750_000_000_000;



/** A fully-valid `MessageView` literal (the client read model — slot ⋈ selected variant). */
export function makeMessageView(overrides: Partial<MessageView> = {}): MessageView {
  return {
    id: castId<MessageId>("msg_ct_1"),
    toolCalls: [],
    chatId: CHAT_ID,
    seq: 1,
    role: "assistant",
    authorUserId: null,
    characterId: null,
    personaId: null,
    excludedFromPrompt: false,
    createdAt: FROZEN_AT,
    editedAt: null,
    selectedVariantId: castId<MessageVariantId>("mv_ct_1"),
    selectedVariantIdx: 0,
    variantCount: 1,
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
 *  A plain client read-model literal (see the header); `participantNames` is names-only (the list card
 *  has no avatars). Ids are plain strings — the wire shape routeTrpc fulfills. */
export interface ChatSummaryFixture {
  readonly id: string;
  readonly title: string | null;
  readonly star: boolean;
  readonly archived: boolean;
  readonly parentChatId: string | null;
  readonly lastMessageAt: number | null;
  readonly messageCount: number;
  readonly participantNames: readonly string[];
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
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
    ...overrides,
  };
}
