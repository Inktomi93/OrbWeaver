// Unit: `isContinueEligible` + `resolveEmptySendAction` (features/chat/lib/continue-on-empty) — the
// composer's empty-Enter classifier: the W-E unified {continue|generate|null} action the Send/empty-Enter
// branch dispatches (continue an assistant tail · generate on a committed non-assistant tail · nothing).

import type { ChatId, MessageId } from "@orb/kit/ids";
import { isContinueEligible, resolveEmptySendAction } from "../../../../../packages/client/src/features/chat/lib/continue-on-empty";
import { expect, test } from "../../../../support/fixtures";

test("assistant tail → eligible", () => {
  expect(isContinueEligible("assistant")).toBe(true);
});

test("user tail → not eligible", () => {
  expect(isContinueEligible("user")).toBe(false);
});

test("system tail → not eligible", () => {
  expect(isContinueEligible("system")).toBe(false);
});

test("no tail (empty chat / draft) → not eligible", () => {
  expect(isContinueEligible(null)).toBe(false);
});

// ── resolveEmptySendAction (W-E) — the unified {continue|generate|null} empty-Enter classifier ──────────
const CHAT = "chat_1" as ChatId;
const MSG = "message_1" as MessageId;
const BOTH_ON = { continueOnSend: true, generateOnEmptySend: true, chatId: CHAT } as const;

test("assistant tail → CONTINUE (extend the reply, wins over generate)", () => {
  expect(resolveEmptySendAction({ ...BOTH_ON, tailRole: "assistant", hasText: false, tailAssistantMessageId: MSG })).toEqual({
    kind: "continue",
    chatId: CHAT,
    messageId: MSG,
  });
});

test("committed user tail → GENERATE (the fork-at-user-tail arm)", () => {
  expect(resolveEmptySendAction({ ...BOTH_ON, tailRole: "user", hasText: false, tailAssistantMessageId: null })).toEqual({
    kind: "generate",
    chatId: CHAT,
  });
});

test("committed empty chat (null tail) → GENERATE", () => {
  expect(resolveEmptySendAction({ ...BOTH_ON, tailRole: null, hasText: false, tailAssistantMessageId: null })).toEqual({
    kind: "generate",
    chatId: CHAT,
  });
});

test("generateOnEmptySend off + non-assistant tail → null (no keyboard generate)", () => {
  expect(resolveEmptySendAction({ ...BOTH_ON, generateOnEmptySend: false, tailRole: "user", hasText: false, tailAssistantMessageId: null })).toBeNull();
});

test("continueOnSend off + assistant tail → falls through to null (assistant tail is never a generate arm)", () => {
  // The assistant tail is continue-eligible, so the generate arm's `!isContinueEligible` guard excludes it —
  // with continue off, an assistant-tail empty Enter does nothing (generate never reroute-generates a reply).
  expect(resolveEmptySendAction({ ...BOTH_ON, continueOnSend: false, tailRole: "assistant", hasText: false, tailAssistantMessageId: MSG })).toBeNull();
});

test("non-empty composer → null (a real send, never continue/generate)", () => {
  expect(resolveEmptySendAction({ ...BOTH_ON, tailRole: null, hasText: true, tailAssistantMessageId: null })).toBeNull();
});

test("draft (no chatId) → null (the keyboard generate arm is committed-only)", () => {
  expect(resolveEmptySendAction({ ...BOTH_ON, tailRole: null, hasText: false, chatId: null, tailAssistantMessageId: null })).toBeNull();
});
