// A DRAFT greeting rendered as a NORMAL message row (J2/J3 — decision #1: greeting = a `MessageView`
// through the existing `MessageRow`, NOT a bespoke preview). ST/neo both render the opening as message
// #0 (ST `first_mes` via `addOneMessage`; neo `synthMessageView` → `MessageRow`) — this mirrors that so a
// new chat is character-first from frame one instead of an anonymous "No messages yet." void.
//
// A draft has no server row, so the id is SYNTHETIC + DETERMINISTIC per founding character — a stable
// React key AND a stable edit-mode key (the id-keyed `state/message-edit-draft` store the row's Edit
// reuses). The synthetic `chatId`/`variantId` are never used for a server call: the greeting row's Edit
// and Swipe route to the draft-config store, never a chat verb (decision #2, the handler-level branch in
// `message-row.tsx`).

import type { MessageView } from "@orb/contracts/chat";
import type { CharacterId, ChatId, MessageId, MessageVariantId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

/** Binds a draft greeting row to its draft-config edit seam (decision #2 — handler-level draft routing,
 *  NOT a visual "mode"). `MessageRow` reads this to route Edit → `setDraftGreeting` and to render the
 *  greeting-swipe strip over `variants` (the card's `greetings[]`) instead of the committed verbs. */
export interface GreetingBinding {
  readonly draftKey: string;
  readonly characterId: CharacterId;
  /** The founding character's `greetings[]` — the swipe alternates (`[0]` = the first message). */
  readonly variants: readonly string[];
}

// A greeting shows no timestamp yet (the per-message metadata row is a later appearance task), so a fixed
// epoch is honest AND satisfies the client-determinism gate (no `Date.now()`/`new Date()` in render).
const DRAFT_GREETING_EPOCH = 0;
const DRAFT_CHAT_ID = castId<ChatId>("draft");

/** Build a valid `MessageView` for one founding character's shown greeting (assistant role, the card's
 *  `characterId` stamped so `{{char}}`/attribution/color all resolve). `seq` orders the greet-all rows. */
export function synthGreetingRow(characterId: CharacterId, content: string, seq: number): MessageView {
  return {
    id: castId<MessageId>(`draft-greeting_${characterId}`),
    toolCalls: [],
    chatId: DRAFT_CHAT_ID,
    seq,
    role: "assistant",
    authorUserId: null,
    characterId,
    personaId: null,
    excludedFromPrompt: false,
    createdAt: DRAFT_GREETING_EPOCH,
    editedAt: null,
    selectedVariantId: castId<MessageVariantId>(`draft-greeting-variant_${characterId}`),
    selectedVariantIdx: 0,
    variantCount: 1,
    hasContinuation: false,
    content,
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
  };
}
