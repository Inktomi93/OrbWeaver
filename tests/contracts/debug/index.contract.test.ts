// @orb/contracts/debug — the `/api/_debug/*` response shapes the e2e harness parses.

import { chatInspectionSchema, rpgTracesResponseSchema, wireCaptureSchema, wireCapturesResponseSchema } from "@orb/contracts/debug";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

const CHAT_ID = mintTypeId(ID_PREFIX.chat);
const TURN_ID = mintTypeId(ID_PREFIX.chatTurn);
const MESSAGE_ID = mintTypeId(ID_PREFIX.message);
const CHARACTER_ID = mintTypeId(ID_PREFIX.character);

const CAPTURE = { chatId: CHAT_ID, api: "chat-completions", wire: "openai-compat", providerId: "vllm", model: "m", at: 1, body: { messages: [] } };

test("a capture carries providerId, and the retired `backend` key is refused", () => {
  expect(wireCaptureSchema.safeParse(CAPTURE).success).toBe(true);
  const { providerId: _providerId, ...withoutProvider } = CAPTURE;
  expect(wireCaptureSchema.safeParse({ ...withoutProvider, backend: "vllm" }).success).toBe(false);
});

test("a chatless probe capture and a reply-bearing one both parse", () => {
  const { chatId: _chatId, ...chatless } = CAPTURE;
  expect(wireCaptureSchema.safeParse(chatless).success).toBe(true);
  expect(wireCaptureSchema.safeParse({ ...CAPTURE, responseHeaders: { "request-id": "r" }, responseBody: "data: {}" }).success).toBe(true);
});

test("the captures response needs its enabled flag and a matching list", () => {
  expect(wireCapturesResponseSchema.safeParse({ enabled: true, count: 1, captures: [CAPTURE] }).success).toBe(true);
  expect(wireCapturesResponseSchema.safeParse({ count: 1, captures: [CAPTURE] }).success).toBe(false);
});

test("a chat inspection parses with raw table rows, and a not-found one has null chat", () => {
  const found = {
    found: true,
    chat: {
      id: CHAT_ID,
      title: null,
      starred: false,
      archived: false,
      temporary: false,
      startedAt: null,
      parentChatId: null,
      forkedAt: null,
      streamSeq: 0,
      createdAt: 1,
      updatedAt: 1,
    },
    participants: [{ id: "p", kind: "character", role: "host", userId: null, characterId: CHARACTER_ID, characterName: "A" }],
    messages: [
      {
        id: MESSAGE_ID,
        seq: 1,
        role: "assistant",
        authorUserId: null,
        characterId: CHARACTER_ID,
        personaId: null,
        selectedVariantId: null,
        excludedFromPrompt: false,
        content: "hi",
        model: null,
        provider: null,
      },
    ],
    sessionFrameCount: 0,
    recentEvents: [{ id: mintTypeId(ID_PREFIX.chatEvent), seq: 1, type: "messageCommitted", createdAt: 1 }],
  };
  expect(chatInspectionSchema.safeParse(found).success).toBe(true);
  expect(chatInspectionSchema.safeParse({ ...found, found: false, chat: null, participants: [], messages: [], recentEvents: [] }).success).toBe(true);
  expect(chatInspectionSchema.safeParse({ ...found, chat: { ...found.chat, unreadColumn: 1 } }).success).toBe(false);
  expect(chatInspectionSchema.safeParse({ ...found, messages: [{ ...found.messages[0], seq: "1" }] }).success).toBe(false);
});

test("the traces response parses each phase and refuses an unknown one", () => {
  const events = [
    { seq: 1, at: 1, event: { phase: "mount", chatId: CHAT_ID, toolNames: ["update_scene"] } },
    { seq: 2, at: 2, event: { phase: "flushed", chatId: CHAT_ID, turnId: TURN_ID, outcome: "wrote", droppedReason: null } },
  ];
  expect(rpgTracesResponseSchema.safeParse({ count: 2, events }).success).toBe(true);
  expect(rpgTracesResponseSchema.safeParse({ count: 1, events: [{ seq: 1, at: 1, event: { phase: "settled", chatId: CHAT_ID } }] }).success).toBe(false);
  expect(
    rpgTracesResponseSchema.safeParse({
      count: 1,
      events: [{ seq: 1, at: 1, event: { phase: "flushed", chatId: CHAT_ID, turnId: TURN_ID, outcome: "unknown", droppedReason: null } }],
    }).success,
  ).toBe(false);
});
