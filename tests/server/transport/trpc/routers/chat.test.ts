// chat.streamMessages — the per-chat SSE subscription (PD-46's stream half; core/Tier-4-Transport.md §5).
// Load-bearing: on RECONNECT (`lastEventId`) it replays the durable `chat_events` rows with
// `seq > lastEventId` (via the member-gated `chat.replayChatEvents`) BEFORE draining live; the membership
// gate WITHHOLDS-not-throws (a NOT_FOUND probe yields nothing and keeps the stream open — the
// draft-tolerant subscribe + the kicked-member cutoff), and the per-yield gate runs on EVERY live event.
// Driven through the real ladder via `createCaller` (authed); the live bus is transport module state.

import type { ChatBusEvent, ChatMacroNameProducer, MessageView } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG, DEFAULT_ROOM_OVERRIDES } from "@orb/contracts/chat";
import type { ChatId, ChatInjectionId, MessageVariantId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatService } from "@orb/server/domain/chat";
import { ChatNotFoundError } from "@orb/server/domain/chat";
import { publishChatEvent } from "@orb/server/transport/trpc";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures";
import { caller, makeContext, principal } from "../_support.ts";

const MEMBER = castId<UserId>("user_member");
const NON_MEMBER = castId<UserId>("user_non_member");
const CHAT = castId<ChatId>("chat_1");
const BOUNDS = { minSeq: 1, maxSeq: 3 };

const event = (type: "chatUpdated" | "chatDeleted" = "chatUpdated"): ChatBusEvent => ({
  type,
  chatId: CHAT,
});

// Unwrap a yielded subscription value — `tracked()` yields `[id, data, symbol]`; data is at index 1.
function dataOf(yielded: unknown): ChatBusEvent {
  const value = Array.isArray(yielded) ? yielded[1] : yielded;
  return value as ChatBusEvent;
}
function idOf(yielded: unknown): string {
  return (Array.isArray(yielded) ? yielded[0] : "") as string;
}

describe("chat.streamMessages — durable-first resume", () => {
  test("replays durable rows newer than lastEventId, ascending, before going live", async () => {
    const replayChatEvents = vi.fn<ChatService["replayChatEvents"]>(async ({ afterSeq }) => [
      { seq: (afterSeq ?? 0) + 1, event: event("chatDeleted") },
      { seq: (afterSeq ?? 0) + 2, event: event() },
    ]);
    const chatEventBounds = vi.fn<ChatService["chatEventBounds"]>(async () => BOUNDS);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { replayChatEvents, chatEventBounds } },
    });

    const sub = await caller(ctx).chat.streamMessages({ chatId: CHAT, lastEventId: "5" });
    const iterator = sub[Symbol.asyncIterator]();
    const first = await iterator.next();
    const second = await iterator.next();
    await iterator.return?.(undefined);

    // The durable replay ran with the resume cursor, member-gated…
    expect(replayChatEvents).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      afterSeq: 5,
    });
    // …and the missed events replay ASCENDING with their durable seq as the tracked id.
    expect(idOf(first.value)).toBe("6");
    expect(dataOf(first.value).type).toBe("chatDeleted");
    expect(idOf(second.value)).toBe("7");
  });

  test("withhold-not-throw: a NOT_FOUND gate silences yields (pre-start subscribe / kicked member) without tearing down", async () => {
    // The gate flips: not-a-member (event 1) → member (event 2) → kicked (event 3) → member (event 4).
    const verdicts = [false, true, false, true];
    let call = 0;
    const chatEventBounds = vi.fn<ChatService["chatEventBounds"]>(() => {
      const allowed = verdicts[call] ?? true;
      call += 1;
      return allowed ? Promise.resolve(BOUNDS) : Promise.reject(new ChatNotFoundError(CHAT));
    });
    const replayChatEvents = vi.fn<ChatService["replayChatEvents"]>(async () => []);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { replayChatEvents, chatEventBounds } },
    });

    // First subscribe (no lastEventId): no durable replay — live only.
    const sub = await caller(ctx).chat.streamMessages({ chatId: CHAT });
    const iterator = sub[Symbol.asyncIterator]();
    const firstYield = iterator.next();

    // Publish 4 live events; the gate withholds 1 and 3.
    publishChatEvent({ seq: 1, event: event("chatDeleted") });
    publishChatEvent({ seq: 2, event: event() });
    const first = await firstYield;
    publishChatEvent({ seq: 3, event: event("chatDeleted") });
    publishChatEvent({ seq: 4, event: event() });
    const second = await iterator.next();
    await iterator.return?.(undefined);

    // Only the gate-passing events came through (1 and 3 withheld; the stream never errored).
    expect(idOf(first.value)).toBe("2");
    expect(idOf(second.value)).toBe("4");
    expect(replayChatEvents).not.toHaveBeenCalled();
  });
});

// A minimal MessageView fixture — the router test only proves the wire-through, not the view shape.
const MESSAGE: MessageView = {
  id: castId<MessageView["id"]>("message_1"),
  chatId: CHAT,
  seq: 1,
  role: "assistant",
  authorUserId: null,
  characterId: null,
  personaId: null,
  excludedFromPrompt: false,
  createdAt: 0,
  editedAt: null,
  selectedVariantId: castId<MessageView["selectedVariantId"]>("message_variant_1"),
  selectedVariantIdx: 0,
  variantCount: 1,
  content: "hi",
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
};

// The empty producer fixture (Chat-Macro-Resolution.md §1) — this router test only proves the wire-through,
// not the producer's own resolution (that's `persistence/macro-names.int.test.ts` + `read.int.test.ts`).
const EMPTY_MACRO_NAMES: ChatMacroNameProducer = { characterNames: [], personaNames: [] };

describe("chat.listMessages — the paged canon read (D26), member-gated", () => {
  test("a member pages messages: the parsed cursor/limit reach the verb with the resolved Principal", async () => {
    const listMessages = vi.fn<ChatService["listMessages"]>(async () => ({
      messages: [MESSAGE],
      macroNames: EMPTY_MACRO_NAMES,
    }));
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { listMessages } },
    });

    const result = await caller(ctx).chat.listMessages({ chatId: CHAT, beforeSeq: 10, limit: 20 });

    expect(listMessages).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      beforeSeq: 10,
      limit: 20,
    });
    expect(result).toEqual({ messages: [MESSAGE], macroNames: EMPTY_MACRO_NAMES });
  });

  test("a non-member gets the leak-free NOT_FOUND the verb's requireParticipant gate throws (the getChat collapse)", async () => {
    const listMessages = vi
      .fn<ChatService["listMessages"]>()
      .mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { listMessages } },
    });

    await expect(caller(ctx).chat.listMessages({ chatId: CHAT })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("chat.listMessageVariants — the swipe strip's step-target resolver (D26 full sibling set)", () => {
  test("a thin pass-through: chatId/messageId reach the verb with the resolved Principal", async () => {
    const variants = [
      { variantId: castId<MessageVariantId>("message_variant_1"), idx: 0 },
      { variantId: castId<MessageVariantId>("message_variant_2"), idx: 1 },
    ];
    const listMessageVariants = vi.fn<ChatService["listMessageVariants"]>(async () => variants);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { listMessageVariants } },
    });

    const result = await caller(ctx).chat.listMessageVariants({
      chatId: CHAT,
      messageId: MESSAGE.id,
    });

    expect(listMessageVariants).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      messageId: MESSAGE.id,
    });
    expect(result).toEqual(variants);
  });

  test("a foreign-chat messageId surfaces the verb's leak-free NOT_FOUND", async () => {
    const listMessageVariants = vi
      .fn<ChatService["listMessageVariants"]>()
      .mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { listMessageVariants } },
    });

    await expect(
      caller(ctx).chat.listMessageVariants({ chatId: CHAT, messageId: MESSAGE.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("chat.selectVariant — the swipe strip's step-BACK verb (task #19 wire-through)", () => {
  test("a thin pass-through: chatId/messageId/variantId reach the verb with the resolved Principal", async () => {
    const variantId = castId<MessageVariantId>("message_variant_2");
    const selectVariant = vi.fn<ChatService["selectVariant"]>(async () => MESSAGE);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { selectVariant } },
    });

    const result = await caller(ctx).chat.selectVariant({
      chatId: CHAT,
      messageId: MESSAGE.id,
      variantId,
    });

    expect(selectVariant).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      messageId: MESSAGE.id,
      variantId,
    });
    expect(result).toEqual(MESSAGE);
  });

  test("a sibling-ownership miss (a variantId from a DIFFERENT slot) surfaces the verb's leak-free NOT_FOUND", async () => {
    const variantId = castId<MessageVariantId>("message_variant_other_slot");
    const selectVariant = vi
      .fn<ChatService["selectVariant"]>()
      .mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { selectVariant } },
    });

    await expect(
      caller(ctx).chat.selectVariant({ chatId: CHAT, messageId: MESSAGE.id, variantId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// The three guided-generations verbs (chat-surface-lane task #27 — the composer WAND): all were fully
// implemented in domain/chat/verbs/turn.ts but never exposed on this router (the same MISSING-API shape
// selectVariant/abort were in). Each is a thin pass-through, incl. an untouched `guided` steer object.

describe("chat.continueTurn — the guided-continue verb (composer wand wire-through)", () => {
  test("a thin pass-through: chatId/messageId/guided reach the verb with the resolved Principal", async () => {
    const continueTurn = vi.fn<ChatService["continueTurn"]>(async () => ({
      messages: [MESSAGE],
      aborted: false,
    }));
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { continueTurn } },
    });

    const guided = { action: "continue" as const, input: "steer it darker" };
    const result = await caller(ctx).chat.continueTurn({
      chatId: CHAT,
      messageId: MESSAGE.id,
      guided,
    });

    expect(continueTurn).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      messageId: MESSAGE.id,
      guided,
    });
    expect(result.messages).toEqual([MESSAGE]);
  });

  test("a non-assistant / missing target surfaces the verb's leak-free NOT_FOUND", async () => {
    const continueTurn = vi
      .fn<ChatService["continueTurn"]>()
      .mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { continueTurn } },
    });

    await expect(
      caller(ctx).chat.continueTurn({ chatId: CHAT, messageId: MESSAGE.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("chat.impersonate — the guided-impersonate verb (composer wand wire-through)", () => {
  test("a thin pass-through: chatId/personaId/guided (incl. the person word) reach the verb", async () => {
    const impersonate = vi.fn<ChatService["impersonate"]>(async () => ({
      messages: [MESSAGE],
      aborted: false,
    }));
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { impersonate } },
    });

    const guided = {
      action: "impersonate" as const,
      input: "ask about the ruins",
      person: "third",
    };
    const result = await caller(ctx).chat.impersonate({ chatId: CHAT, guided });

    expect(impersonate).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      guided,
    });
    expect(result.messages).toEqual([MESSAGE]);
  });

  test("a non-member gets the verb's leak-free NOT_FOUND (requireParticipant gate)", async () => {
    const impersonate = vi
      .fn<ChatService["impersonate"]>()
      .mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { impersonate } },
    });

    await expect(caller(ctx).chat.impersonate({ chatId: CHAT })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("chat.generate — the guided-response verb (composer wand wire-through)", () => {
  test("a thin pass-through: chatId/speakerCharacterId/guided reach the verb", async () => {
    const generate = vi.fn<ChatService["generate"]>(async () => ({
      messages: [MESSAGE],
      aborted: false,
    }));
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { generate } },
    });

    const guided = { action: "response" as const, input: "hint at the letter" };
    const result = await caller(ctx).chat.generate({ chatId: CHAT, guided });

    expect(generate).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      guided,
    });
    expect(result.messages).toEqual([MESSAGE]);
  });

  test("a non-member gets the verb's leak-free NOT_FOUND (requireParticipant gate)", async () => {
    const generate = vi
      .fn<ChatService["generate"]>()
      .mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { generate } },
    });

    await expect(caller(ctx).chat.generate({ chatId: CHAT })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

// The per-message ACTION cluster's four verbs — all were fully implemented in domain/chat but never
// exposed on this router (the same MISSING-API shape selectVariant/abort were in). Each is a thin
// pass-through; the leak-free NOT_FOUND collapse is proven once per verb (the same shape every other
// leak-free test above proves — the router adds no gating of its own, it only forwards).

describe("chat.editMessage — edit-in-place's save verb (chat-surface lane wire-through)", () => {
  test("a thin pass-through: chatId/messageId/content reach the verb with the resolved Principal", async () => {
    const editMessage = vi.fn<ChatService["editMessage"]>(async () => MESSAGE);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { editMessage } },
    });

    const result = await caller(ctx).chat.editMessage({
      chatId: CHAT,
      messageId: MESSAGE.id,
      content: "edited content",
    });

    expect(editMessage).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      messageId: MESSAGE.id,
      content: "edited content",
    });
    expect(result).toEqual(MESSAGE);
  });

  test("a non-author non-host gets the verb's leak-free NOT_FOUND (author-or-host gate)", async () => {
    const editMessage = vi
      .fn<ChatService["editMessage"]>()
      .mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { editMessage } },
    });

    await expect(
      caller(ctx).chat.editMessage({ chatId: CHAT, messageId: MESSAGE.id, content: "x" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("chat.setMessageHidden — the hide-from-AI toggle (chat-surface lane wire-through)", () => {
  test("a thin pass-through: chatId/messageId/hidden reach the verb with the resolved Principal", async () => {
    const setMessageHidden = vi.fn<ChatService["setMessageHidden"]>(async () => ({
      ...MESSAGE,
      excludedFromPrompt: true,
    }));
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { setMessageHidden } },
    });

    const result = await caller(ctx).chat.setMessageHidden({
      chatId: CHAT,
      messageId: MESSAGE.id,
      hidden: true,
    });

    expect(setMessageHidden).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      messageId: MESSAGE.id,
      hidden: true,
    });
    expect(result.excludedFromPrompt).toBe(true);
  });

  test("a non-author non-host gets the verb's leak-free NOT_FOUND (author-or-host gate)", async () => {
    const setMessageHidden = vi
      .fn<ChatService["setMessageHidden"]>()
      .mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { setMessageHidden } },
    });

    await expect(
      caller(ctx).chat.setMessageHidden({ chatId: CHAT, messageId: MESSAGE.id, hidden: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("chat.deleteMessages — the bulk delete verb (chat-surface lane wire-through)", () => {
  test("a thin pass-through: chatId/messageIds reach the verb with the resolved Principal", async () => {
    const deleteMessages = vi.fn<ChatService["deleteMessages"]>(async () => undefined);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { deleteMessages } },
    });

    const result = await caller(ctx).chat.deleteMessages({
      chatId: CHAT,
      messageIds: [MESSAGE.id],
    });

    expect(deleteMessages).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      messageIds: [MESSAGE.id],
    });
    expect(result).toBeUndefined();
  });

  test("a member deleting another's slot without host role gets the verb's leak-free NOT_FOUND", async () => {
    const deleteMessages = vi
      .fn<ChatService["deleteMessages"]>()
      .mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { deleteMessages } },
    });

    await expect(
      caller(ctx).chat.deleteMessages({ chatId: CHAT, messageIds: [MESSAGE.id] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("chat.forkChat — the deep-copy-into-a-new-chat verb (chat-surface lane wire-through)", () => {
  const ForkedChat = castId<ChatId>("chat_forked_1");
  // A minimal ChatDetail literal — this router test only proves the wire-through, not the view shape
  // (the same posture the file-header MESSAGE fixture takes).
  const ForkResult: Awaited<ReturnType<ChatService["forkChat"]>> = {
    chat: {
      id: ForkedChat,
      title: "Forked chat",
      star: false,
      archived: false,
      parentChatId: CHAT,
      forkedAt: 0,
      anchorPersonaId: null,
      participants: [],
      group: DEFAULT_GROUP_CONFIG,
      roomOverrides: DEFAULT_ROOM_OVERRIDES,
      opening: null,
      compactSummary: null,
      compactedAtSeq: null,
      createdAt: 0,
      updatedAt: 0,
      macroNames: EMPTY_MACRO_NAMES,
    },
  };

  test("a thin pass-through: chatId/throughSeq/title reach the verb with the resolved Principal", async () => {
    const forkChat = vi.fn<ChatService["forkChat"]>(async () => ForkResult);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { forkChat } },
    });

    const result = await caller(ctx).chat.forkChat({
      chatId: CHAT,
      throughSeq: MESSAGE.seq,
      title: "Forked chat",
    });

    expect(forkChat).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      throughSeq: MESSAGE.seq,
      title: "Forked chat",
    });
    expect(result.chat.id).toBe(ForkedChat);
    expect(result.chat.parentChatId).toBe(CHAT);
  });

  test("a non-member gets the verb's leak-free NOT_FOUND (requireParticipant gate)", async () => {
    const forkChat = vi
      .fn<ChatService["forkChat"]>()
      .mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { forkChat } },
    });

    await expect(caller(ctx).chat.forkChat({ chatId: CHAT })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

// The CONTEXT-panel cluster (task #28 — room-overrides · preview-request · manual injections): all were
// fully implemented in domain/chat (verbs/roster.ts, verbs/read.ts, verbs/chat-lifecycle.ts) — host/member
// gated via substrate/auth/matrix.ts — but never exposed on this router (the same MISSING-API shape the
// clusters above were in). Thin pass-throughs; the leak-free NOT_FOUND collapse is the verb's own gate.

describe("chat.setRoomOverrides — the per-chat prompt overrides write (task #28 wire-through, host-only)", () => {
  test("a thin pass-through: chatId/overrides reach the verb with the resolved Principal", async () => {
    const overrides = { mainPrompt: "Be terse.", scenario: "A rainy dock at midnight." };
    const setRoomOverrides = vi.fn<ChatService["setRoomOverrides"]>(async () => overrides);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { setRoomOverrides } },
    });

    const result = await caller(ctx).chat.setRoomOverrides({ chatId: CHAT, overrides });

    expect(setRoomOverrides).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      overrides,
    });
    expect(result).toEqual(overrides);
  });

  test("a stray key is stripped at the boundary (roomOverridesSchema.strict allowlist) — the verb sees only the four fields", async () => {
    const setRoomOverrides = vi.fn<ChatService["setRoomOverrides"]>(async () => ({}));
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { setRoomOverrides } },
    });

    // A rogue field must fail the strict wire schema before ever reaching the verb (a host-only allowlist).
    await expect(
      caller(ctx).chat.setRoomOverrides({
        chatId: CHAT,
        // biome-ignore lint/suspicious/noExplicitAny: deliberately off-schema input to prove the strict boundary rejects it.
        overrides: { mainPrompt: "ok", rogue: "nope" } as any,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(setRoomOverrides).not.toHaveBeenCalled();
  });

  test("a non-host gets the verb's leak-free NOT_FOUND (requireHost gate)", async () => {
    const setRoomOverrides = vi
      .fn<ChatService["setRoomOverrides"]>()
      .mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { setRoomOverrides } },
    });

    await expect(
      caller(ctx).chat.setRoomOverrides({ chatId: CHAT, overrides: { mainPrompt: "x" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("chat.previewAssembly — the assembled-prompt preview + trace (task #28 wire-through, host-only)", () => {
  const Preview: Awaited<ReturnType<ChatService["previewAssembly"]>> = {
    prompt: {
      static: "SYSTEM: be helpful",
      dynamic: "",
      afterHistory: [],
      sendHistory: true,
      trace: {
        staticSections: ["main_prompt"],
        dynamicSections: [],
        worldInfoIncluded: 0,
        worldInfoDropped: [],
        matchedKeys: [],
        compactSummaryIncluded: false,
        memoryIncluded: false,
        guidedInstructionIncluded: false,
        staticCacheBusters: [],
        chatInjectionsIncluded: 0,
        afterHistorySections: [],
        overrideSources: { mainPrompt: "room override" },
      },
    },
    trace: {
      staticSections: ["main_prompt"],
      dynamicSections: [],
      worldInfoIncluded: 0,
      worldInfoDropped: [],
      matchedKeys: [],
      compactSummaryIncluded: false,
      memoryIncluded: false,
      guidedInstructionIncluded: false,
      staticCacheBusters: [],
      chatInjectionsIncluded: 0,
      afterHistorySections: [],
      overrideSources: { mainPrompt: "room override" },
    },
  };

  test("a thin pass-through: chatId reaches the verb with the resolved Principal; the preview+trace return verbatim", async () => {
    const previewAssembly = vi.fn<ChatService["previewAssembly"]>(async () => Preview);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { previewAssembly } },
    });

    const result = await caller(ctx).chat.previewAssembly({ chatId: CHAT });

    expect(previewAssembly).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
    });
    expect(result).toEqual(Preview);
  });

  test("a non-host gets the verb's leak-free NOT_FOUND (the host-only debug-surface gate)", async () => {
    const previewAssembly = vi
      .fn<ChatService["previewAssembly"]>()
      .mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { previewAssembly } },
    });

    await expect(caller(ctx).chat.previewAssembly({ chatId: CHAT })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("chat.setChatInjection / listChatInjections / deleteChatInjection — the manual-injections CRUD (task #28 wire-through)", () => {
  const InjectionId = castId<ChatInjectionId>("chat_injection_1");
  const InjectionView: Awaited<ReturnType<ChatService["listChatInjections"]>>[number] = {
    id: InjectionId,
    position: "in_chat",
    depth: 2,
    role: "system",
    content: "Remember: it is raining.",
  };

  test("setChatInjection CREATE (no id): the authored fields reach the verb with the resolved Principal", async () => {
    const setChatInjection = vi.fn<ChatService["setChatInjection"]>(async () => InjectionView);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { setChatInjection } },
    });

    const result = await caller(ctx).chat.setChatInjection({
      chatId: CHAT,
      position: "in_chat",
      depth: 2,
      role: "system",
      content: "Remember: it is raining.",
    });

    expect(setChatInjection).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      position: "in_chat",
      depth: 2,
      role: "system",
      content: "Remember: it is raining.",
    });
    expect(result).toEqual(InjectionView);
  });

  test("setChatInjection UPDATE (id present): the id reaches the verb (upsert)", async () => {
    const setChatInjection = vi.fn<ChatService["setChatInjection"]>(async () => InjectionView);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { setChatInjection } },
    });

    await caller(ctx).chat.setChatInjection({
      chatId: CHAT,
      id: InjectionId,
      position: "before_prompt",
      depth: 0,
      role: "user",
      content: "updated",
    });

    expect(setChatInjection).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: CHAT, id: InjectionId, position: "before_prompt" }),
    );
  });

  test("setChatInjection rejects an off-axis position before the verb (the wire enum)", async () => {
    const setChatInjection = vi.fn<ChatService["setChatInjection"]>(async () => InjectionView);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { setChatInjection } },
    });

    await expect(
      caller(ctx).chat.setChatInjection({
        chatId: CHAT,
        // biome-ignore lint/suspicious/noExplicitAny: deliberately off-enum to prove the wire schema rejects it.
        position: "somewhere" as any,
        depth: 0,
        role: "system",
        content: "x",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(setChatInjection).not.toHaveBeenCalled();
  });

  test("listChatInjections: a thin pass-through returning the splice-ordered list (member-gated)", async () => {
    const listChatInjections = vi.fn<ChatService["listChatInjections"]>(async () => [
      InjectionView,
    ]);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { listChatInjections } },
    });

    const result = await caller(ctx).chat.listChatInjections({ chatId: CHAT });

    expect(listChatInjections).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
    });
    expect(result).toEqual([InjectionView]);
  });

  test("deleteChatInjection: chatId/injectionId reach the verb with the resolved Principal (host-only)", async () => {
    const deleteChatInjection = vi.fn<ChatService["deleteChatInjection"]>(async () => undefined);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { deleteChatInjection } },
    });

    const result = await caller(ctx).chat.deleteChatInjection({
      chatId: CHAT,
      injectionId: InjectionId,
    });

    expect(deleteChatInjection).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      injectionId: InjectionId,
    });
    expect(result).toBeUndefined();
  });

  test("a non-host deleting an injection gets the verb's leak-free NOT_FOUND (requireHost gate)", async () => {
    const deleteChatInjection = vi
      .fn<ChatService["deleteChatInjection"]>()
      .mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { deleteChatInjection } },
    });

    await expect(
      caller(ctx).chat.deleteChatInjection({ chatId: CHAT, injectionId: InjectionId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
