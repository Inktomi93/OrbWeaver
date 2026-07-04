// Chat CT fixtures — plain client read-model literals (the support/factories are DB-row builders for
// a different layer). Kept OUT of _ct-stories.tsx so that module exports only components
// (lint useComponentExportOnlyModules). Imported by the stories + the .ct.tsx assertions.

import type { MessageView } from "@orb/contracts/chat";
import type { ChatId, MessageId, MessageVariantId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

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
    ...overrides,
  };
}
