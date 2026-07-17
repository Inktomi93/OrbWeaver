// Unit: `isContinueEligible` + `resolveContinueTarget` (features/chat/lib/continue-on-empty) — the
// composer's continue-on-empty-send predicate + the pure target resolver PD-146 wires the Send button to.

import type { ChatId, MessageId } from "@orb/kit/ids";
import { isContinueEligible, resolveContinueTarget } from "../../../../../packages/client/src/features/chat/lib/continue-on-empty";
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

// ── resolveContinueTarget (PD-146) ──────────────────────────────────────────────────────────────────
const CHAT = "chat_1" as ChatId;
const MSG = "message_1" as MessageId;
const ELIGIBLE = { continueOnSend: true, tailRole: "assistant", hasText: false, chatId: CHAT, tailAssistantMessageId: MSG } as const;

test("all conditions met → the {chatId, messageId} target", () => {
  expect(resolveContinueTarget(ELIGIBLE)).toEqual({ chatId: CHAT, messageId: MSG });
});

test("pref off → null (feature disabled)", () => {
  expect(resolveContinueTarget({ ...ELIGIBLE, continueOnSend: false })).toBeNull();
});

test("non-empty draft → null (a real send, never a continue)", () => {
  expect(resolveContinueTarget({ ...ELIGIBLE, hasText: true })).toBeNull();
});

test("non-assistant tail → null", () => {
  expect(resolveContinueTarget({ ...ELIGIBLE, tailRole: "user" })).toBeNull();
});

test("draft / empty chat (no chatId) → null", () => {
  expect(resolveContinueTarget({ ...ELIGIBLE, chatId: null })).toBeNull();
});

test("no tail assistant id → null", () => {
  expect(resolveContinueTarget({ ...ELIGIBLE, tailAssistantMessageId: null })).toBeNull();
});
