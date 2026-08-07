// The chat router — the THIN verb surface (PD-46), driven through the real ladder via `createCaller`
// (authed). Every case here is a wire-through: the parsed input + the resolved Principal reach the verb, the
// verb's own leak-free refusal surfaces as its tRPC code, and the transport adds no gating of its own.
//
// THE ROOM STREAM'S CASES MOVED WITH ITS GENERATOR (SSE-1 S2): `streamMessages` is gone — the durable-first
// resume, the withhold-not-throw membership gate, the PD-134/PD-135 attach syntheses and the D16 live clamp
// are pinned on the room source at `tests/server/transport/trpc/stream/sources/chat.test.ts`. The one
// subscription left on this router is `impersonateStream` (permanently unfolded, spec §14 decision 2).

import type { ChatBusEvent, ChatMacroNameProducer, MessageView } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG, DEFAULT_ROOM_OVERRIDES } from "@orb/contracts/chat";
import type { CharacterId, ChatId, ChatInjectionId, ChatParticipantId, MessageVariantId, PresetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatService } from "@orb/server/domain/chat";
import { CHAT_OP_CODES, ChatNotFoundError, ChatOperationError } from "@orb/server/domain/chat";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../_support.ts";

const MEMBER = castId<UserId>("user_member");
const NON_MEMBER = castId<UserId>("user_non_member");
const CHAT = castId<ChatId>("chat_1");

// Unwrap a yielded subscription value — `tracked()` yields `[id, data, symbol]`; data is at index 1.
function dataOf(yielded: unknown): ChatBusEvent {
  const value = Array.isArray(yielded) ? yielded[1] : yielded;
  return value as ChatBusEvent;
}

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
  hasContinuation: false,
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
  genStartedAt: null,
  genFinishedAt: null,
  generationId: null,
  contextBoundaryMessageId: null,
  toolCalls: [],
};

// The empty producer fixture (Chat-Macro-Resolution.md §1) — this router test only proves the wire-through,
// not the producer's own resolution (that's `persistence/macro-names.int.test.ts` + `read.int.test.ts`).
const EMPTY_MACRO_NAMES: ChatMacroNameProducer = { characterNames: [], personaNames: [] };

describe("chat.listMessages — the paged canon read (D26), member-gated", () => {
  test("a member pages messages: the parsed cursor/limit reach the verb with the resolved Principal", async () => {
    const listMessages = vi.fn<ChatService["listMessages"]>(async () => ({
      messages: [MESSAGE],
      macroNames: EMPTY_MACRO_NAMES,
      personaAvatars: [],
      characterAvatars: [],
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
    expect(result).toEqual({
      messages: [MESSAGE],
      macroNames: EMPTY_MACRO_NAMES,
      personaAvatars: [],
      characterAvatars: [],
    });
  });

  test("a non-member gets the leak-free NOT_FOUND the verb's requireParticipant gate throws (the getChat collapse)", async () => {
    const listMessages = vi.fn<ChatService["listMessages"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
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
    const listMessageVariants = vi.fn<ChatService["listMessageVariants"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { listMessageVariants } },
    });

    await expect(caller(ctx).chat.listMessageVariants({ chatId: CHAT, messageId: MESSAGE.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
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
    const selectVariant = vi.fn<ChatService["selectVariant"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { selectVariant } },
    });

    await expect(caller(ctx).chat.selectVariant({ chatId: CHAT, messageId: MESSAGE.id, variantId })).rejects.toMatchObject({ code: "NOT_FOUND" });
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
    const continueTurn = vi.fn<ChatService["continueTurn"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { continueTurn } },
    });

    await expect(caller(ctx).chat.continueTurn({ chatId: CHAT, messageId: MESSAGE.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// Lane C (F2) — the continue undo/redo pair: verbs built + int-tested in domain/chat/verbs/turn.ts, never
// on the router. Thin `{chatId, messageId}` pass-throughs (NO steer — they restore the D26 snapshot in
// place, not generate), each returning the restored `MessageView`. A never-continued target throws
// `no_continuation` (ChatOperationError → BAD_REQUEST via the error map, never a 500).
describe("chat.undoContinue / chat.revertContinue — the continue undo/redo pair (Lane C wire-through)", () => {
  test("undoContinue: a thin pass-through — chatId/messageId reach the verb with the resolved Principal", async () => {
    const undoContinue = vi.fn<ChatService["undoContinue"]>(async () => MESSAGE);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { undoContinue } },
    });

    const result = await caller(ctx).chat.undoContinue({ chatId: CHAT, messageId: MESSAGE.id });

    expect(undoContinue).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      messageId: MESSAGE.id,
    });
    expect(result).toEqual(MESSAGE);
  });

  test("revertContinue: a thin pass-through — chatId/messageId reach the verb with the resolved Principal", async () => {
    const revertContinue = vi.fn<ChatService["revertContinue"]>(async () => MESSAGE);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { revertContinue } },
    });

    const result = await caller(ctx).chat.revertContinue({ chatId: CHAT, messageId: MESSAGE.id });

    expect(revertContinue).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      messageId: MESSAGE.id,
    });
    expect(result).toEqual(MESSAGE);
  });

  test("undoContinue on a never-continued target surfaces the verb's `no_continuation` as BAD_REQUEST", async () => {
    const undoContinue = vi.fn<ChatService["undoContinue"]>().mockRejectedValue(new ChatOperationError(CHAT_OP_CODES.noContinuation, "nothing to undo"));
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { undoContinue } },
    });

    await expect(caller(ctx).chat.undoContinue({ chatId: CHAT, messageId: MESSAGE.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("a non-member's foreign chatId surfaces the participant gate's leak-free NOT_FOUND", async () => {
    const revertContinue = vi.fn<ChatService["revertContinue"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { revertContinue } },
    });

    await expect(caller(ctx).chat.revertContinue({ chatId: CHAT, messageId: MESSAGE.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// F6 (guided-generations stickler audit) — the `guided` wire trust boundary. Before `guidedSteerSchema`
// the six turn verbs rode `z.any()` and the domain assumed the shape: a garbage `action` dereferenced
// `undefined.prompt` (assembly/macros.ts) and a non-string `input` hit `.trim()`, so any authed
// participant could 500 the turn with a malformed body. Each verb must now REFUSE garbage as a
// BAD_REQUEST at the transport BEFORE the verb runs (the service mock is never called). RED-ON-OLD: with
// `guided: z.any()` these inputs sail through and the assertion (`not.toHaveBeenCalled` + BAD_REQUEST) fails.
describe("F6 — the guided-steer wire boundary refuses a malformed body (BAD_REQUEST, not a 500)", () => {
  test("send: a garbage guided.action is refused at the boundary; the verb never runs", async () => {
    const sendFn = vi.fn<ChatService["send"]>();
    const ctx = makeContext({ auth: principal("user", { userId: MEMBER }), services: { chat: { send: sendFn } } });

    await expect(
      caller(ctx).chat.send({
        chatId: CHAT,
        content: "hi",
        // biome-ignore lint/suspicious/noExplicitAny: deliberately off-schema — an unknown action is the exact 500 vector F6 closes.
        guided: { action: "nope", input: "x" } as any,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(sendFn).not.toHaveBeenCalled();
  });

  test("swipe: a non-string guided.input is refused at the boundary; the verb never runs", async () => {
    const swipeFn = vi.fn<ChatService["swipe"]>();
    const ctx = makeContext({ auth: principal("user", { userId: MEMBER }), services: { chat: { swipe: swipeFn } } });

    await expect(
      caller(ctx).chat.swipe({
        chatId: CHAT,
        messageId: MESSAGE.id,
        // biome-ignore lint/suspicious/noExplicitAny: deliberately off-schema — a non-string input is the `.trim()` 500 vector.
        guided: { action: "swipe", input: { evil: true } } as any,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(swipeFn).not.toHaveBeenCalled();
  });

  test("continueTurn: an arbitrary placement.role (off the message-role vocab) is refused; the verb never runs", async () => {
    const continueTurn = vi.fn<ChatService["continueTurn"]>();
    const ctx = makeContext({ auth: principal("user", { userId: MEMBER }), services: { chat: { continueTurn } } });

    await expect(
      caller(ctx).chat.continueTurn({
        chatId: CHAT,
        messageId: MESSAGE.id,
        // biome-ignore lint/suspicious/noExplicitAny: deliberately off-schema — a junk role must not reach the provider wire.
        guided: { action: "continue", input: "x", placement: { kind: "inject", role: "wizard" } } as any,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(continueTurn).not.toHaveBeenCalled();
  });

  test("a well-formed guided body still passes the boundary and reaches the verb (the boundary isn't over-tight)", async () => {
    const generate = vi.fn<ChatService["generate"]>(async () => ({ messages: [MESSAGE], aborted: false }));
    const ctx = makeContext({ auth: principal("user", { userId: MEMBER }), services: { chat: { generate } } });

    const guided = { action: "response" as const, input: "hint at the letter", placement: { kind: "system" as const } };
    await caller(ctx).chat.generate({ chatId: CHAT, guided });

    expect(generate).toHaveBeenCalledWith({ principal: expect.objectContaining({ userId: MEMBER }), chatId: CHAT, guided });
  });
});

describe("chat.impersonateStream — the NON-PERSISTING, STREAMING guided-impersonate verb (composer fill)", () => {
  /** An async iterable over fixed deltas (each resolved through a microtask, so it's a genuine async stream) —
   *  the verb returns an AsyncIterable, so a mock just needs one. */
  function deltaStream(deltas: readonly string[]): AsyncIterable<{ delta: string }> {
    let i = 0;
    return {
      [Symbol.asyncIterator]: (): AsyncIterator<{ delta: string }> => ({
        next: (): Promise<IteratorResult<{ delta: string }>> =>
          Promise.resolve(i < deltas.length ? { value: { delta: deltas[i++] as string }, done: false } : { value: undefined, done: true }),
      }),
    };
  }
  /** An async iterable whose first `.next()` throws (the participant gate before any yield). */
  function throwingStream(error: unknown): AsyncIterable<{ delta: string }> {
    return {
      [Symbol.asyncIterator]: (): AsyncIterator<{ delta: string }> => ({
        next: (): Promise<IteratorResult<{ delta: string }>> => Promise.reject(error),
      }),
    };
  }

  test("a thin pass-through: chatId/personaId/guided (incl. the person word) reach the verb; yields text deltas", async () => {
    const impersonateStream = vi.fn<ChatService["impersonateStream"]>(() => deltaStream(["drafted ", "opening line"]));
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { impersonateStream } },
    });

    const guided = {
      action: "impersonate" as const,
      input: "ask about the ruins",
      person: "third" as const,
    };
    const sub = await caller(ctx).chat.impersonateStream({ chatId: CHAT, guided });
    // The router wraps each `{ delta }` in a `tracked()` envelope: `[id, data, symbol]`, data at index 1.
    const deltas: string[] = [];
    for await (const yielded of sub as AsyncIterable<unknown>) {
      const data = Array.isArray(yielded) ? (yielded[1] as { delta: string }) : (yielded as { delta: string });
      deltas.push(data.delta);
    }

    expect(impersonateStream).toHaveBeenCalledWith(
      expect.objectContaining({
        principal: expect.objectContaining({ userId: MEMBER }),
        chatId: CHAT,
        guided,
      }),
    );
    // The deltas stream through in order and accumulate to the full line.
    expect(deltas).toEqual(["drafted ", "opening line"]);
  });

  test("a non-member gets a leak-free NOT_FOUND terminal FRAME (withSubscriptionErrors converts the gate throw)", async () => {
    const impersonateStream = vi.fn<ChatService["impersonateStream"]>(() => throwingStream(new ChatNotFoundError(CHAT)));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { impersonateStream } },
    });

    // The verb's gate throws on the first `.next()`; `withSubscriptionErrors` (router) catches the domain
    // NOT_FOUND and yields a typed `__subscriptionError` terminal frame (code NOT_FOUND) rather than tearing
    // the stream down with an opaque 500 — the client surfaces the code instead of an untyped error.
    const sub = await caller(ctx).chat.impersonateStream({ chatId: CHAT });
    const frames: unknown[] = [];
    for await (const yielded of sub as AsyncIterable<unknown>) {
      frames.push(dataOf(yielded));
    }
    expect(frames).toEqual([expect.objectContaining({ __subscriptionError: true, code: "NOT_FOUND" })]);
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
    const generate = vi.fn<ChatService["generate"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
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
    const editMessage = vi.fn<ChatService["editMessage"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { editMessage } },
    });

    await expect(caller(ctx).chat.editMessage({ chatId: CHAT, messageId: MESSAGE.id, content: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
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
    const setMessageHidden = vi.fn<ChatService["setMessageHidden"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { setMessageHidden } },
    });

    await expect(caller(ctx).chat.setMessageHidden({ chatId: CHAT, messageId: MESSAGE.id, hidden: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
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
    const deleteMessages = vi.fn<ChatService["deleteMessages"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { deleteMessages } },
    });

    await expect(caller(ctx).chat.deleteMessages({ chatId: CHAT, messageIds: [MESSAGE.id] })).rejects.toMatchObject({ code: "NOT_FOUND" });
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
      // A fork is born non-temporary (PD-65 — the flag is set only at `startChat`).
      temporary: false,
      // D121-E: the room display-tier option is OFF on a fresh fork (options never default on).
      hostDisplayScripts: false,
      parentChatId: CHAT,
      forkedAt: 0,
      anchorPersonaId: null,
      participants: [],
      viewerActivePersonaId: null,
      viewerIsHost: true,
      viewerUserId: MEMBER,
      pendingHostUserId: null,
      group: DEFAULT_GROUP_CONFIG,
      roomOverrides: DEFAULT_ROOM_OVERRIDES,
      toolRecurseLimit: null,
      rpg: null,
      background: null,
      opening: null,
      compactSummary: null,
      compactedAtSeq: null,
      createdAt: 0,
      updatedAt: 0,
      macroNames: EMPTY_MACRO_NAMES,
      personaAvatars: [],
      characterAvatars: [],
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
    const forkChat = vi.fn<ChatService["forkChat"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
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
    const setRoomOverrides = vi.fn<ChatService["setRoomOverrides"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { setRoomOverrides } },
    });

    await expect(caller(ctx).chat.setRoomOverrides({ chatId: CHAT, overrides: { mainPrompt: "x" } })).rejects.toMatchObject({ code: "NOT_FOUND" });
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
        worldInfoActivated: [],
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
      worldInfoActivated: [],
      matchedKeys: [],
      compactSummaryIncluded: false,
      memoryIncluded: false,
      guidedInstructionIncluded: false,
      staticCacheBusters: [],
      chatInjectionsIncluded: 0,
      afterHistorySections: [],
      overrideSources: { mainPrompt: "room override" },
    },
    budget: {
      ceilingTokens: 8192,
      ceilingEstimated: false,
      totalTokens: 5,
      sources: [
        {
          source: "system",
          detail: "main prompt",
          tokens: 5,
          parts: [{ label: "main prompt", tokens: 5, text: "SYSTEM: be helpful" }],
          text: "SYSTEM: be helpful",
        },
      ],
      sections: [{ sectionId: "main", tokens: 5, rows: [{ label: "main prompt", tokens: 5 }] }],
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

  test("the preset editor's presetOverride crosses the wire (D121-G) — and is ABSENT when unsent", async () => {
    const previewAssembly = vi.fn<ChatService["previewAssembly"]>(async () => Preview);
    const ctx = makeContext({ auth: principal("user", { userId: MEMBER }), services: { chat: { previewAssembly } } });

    await caller(ctx).chat.previewAssembly({ chatId: CHAT, presetOverride: castId<PresetId>("preset_bound") });
    expect(previewAssembly).toHaveBeenLastCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      presetOverride: "preset_bound",
    });

    // Omitted ⇒ the key never reaches the verb, so every pre-existing caller assembles the room's OWN preset.
    await caller(ctx).chat.previewAssembly({ chatId: CHAT });
    expect(previewAssembly).toHaveBeenLastCalledWith({ principal: expect.objectContaining({ userId: MEMBER }), chatId: CHAT });
  });

  test("a non-host gets the verb's leak-free NOT_FOUND (the host-only debug-surface gate)", async () => {
    const previewAssembly = vi.fn<ChatService["previewAssembly"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { previewAssembly } },
    });

    await expect(caller(ctx).chat.previewAssembly({ chatId: CHAT })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("chat.getShapeTrace — the content-free SHAPE trace (PD-132, host-only)", () => {
  const Trace: Awaited<ReturnType<ChatService["getShapeTrace"]>> = {
    multiCharacter: false,
    stageCounts: { withTail: 2, injected: 2, squashed: 2, named: 2 },
    squashMerges: 0,
    cacheBreakpointFromEnd: 1,
    breakpointDecision: "placed",
    rows: [
      { role: "user", name: "Nate", source: "canon", chars: 12 },
      { role: "assistant", name: "Aria", source: "canon", chars: 40 },
    ],
  };

  test("a thin pass-through: chatId + speakerCharacterId reach the verb with the resolved Principal", async () => {
    const getShapeTrace = vi.fn<ChatService["getShapeTrace"]>(async () => Trace);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { getShapeTrace } },
    });

    const result = await caller(ctx).chat.getShapeTrace({ chatId: CHAT });

    expect(getShapeTrace).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
    });
    expect(result).toEqual(Trace);
  });

  test("a non-host gets the verb's refusal (the host-only inspector gate)", async () => {
    const getShapeTrace = vi.fn<ChatService["getShapeTrace"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { getShapeTrace } },
    });

    await expect(caller(ctx).chat.getShapeTrace({ chatId: CHAT })).rejects.toMatchObject({
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

    expect(setChatInjection).toHaveBeenCalledWith(expect.objectContaining({ chatId: CHAT, id: InjectionId, position: "before_prompt" }));
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
    const listChatInjections = vi.fn<ChatService["listChatInjections"]>(async () => [InjectionView]);
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
    const deleteChatInjection = vi.fn<ChatService["deleteChatInjection"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { deleteChatInjection } },
    });

    await expect(caller(ctx).chat.deleteChatInjection({ chatId: CHAT, injectionId: InjectionId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// The group-roster-controls cluster (task #29 — the cast bar + per-member controls): the two per-member
// setters + forceCharacterTurn were fully implemented in domain/chat (verbs/roster.ts + verbs/turn.ts),
// host-gated via substrate/auth/matrix.ts, but never exposed on this router (the same MISSING-API shape
// the #28 cluster was in). Thin pass-throughs; the leak-free NOT_FOUND collapse is the verb's own gate.

const CHARACTER = castId<CharacterId>("character_aria");

// A minimal ParticipantView the knob setter returns — only the mutated field is asserted; the rest is
// the shape's filler (the same posture the MESSAGE/ForkResult fixtures take).
const PARTICIPANT: Awaited<ReturnType<ChatService["setSeatKnobs"]>> = {
  id: castId<ChatParticipantId>("chat_participant_1"),
  chatId: CHAT,
  kind: "character",
  userId: null,
  characterId: CHARACTER,
  role: "member",
  activePersonaId: null,
  talkativeness: 0.5,
  disabled: false,
  joinedAt: 0,
  joinSeq: 1,
  leftSeq: null,
  joinHistoryVisibility: "from-join",
  displayName: "Aria",
  handle: null,
  avatarAssetId: null,
  avatarHash: null,
};

const PARTICIPANT_ID = castId<ChatParticipantId>("chat_participant_1");

describe("chat.setSeatKnobs — the ONE participantId-keyed AI-seat knob setter (D80 wire-through, host-only)", () => {
  test("a thin pass-through: chatId/participantId/patch reach the verb with the resolved Principal", async () => {
    const setSeatKnobs = vi.fn<ChatService["setSeatKnobs"]>(async () => ({ ...PARTICIPANT, disabled: true, talkativeness: 0.8 }));
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { setSeatKnobs } },
    });

    const result = await caller(ctx).chat.setSeatKnobs({
      chatId: CHAT,
      participantId: PARTICIPANT_ID,
      patch: { disabled: true, talkativeness: 0.8 },
    });

    expect(setSeatKnobs).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      participantId: PARTICIPANT_ID,
      patch: { disabled: true, talkativeness: 0.8 },
    });
    expect(result.disabled).toBe(true);
    expect(result.talkativeness).toBe(0.8);
  });

  test("an empty patch is legal at the wire (both knobs optional)", async () => {
    const setSeatKnobs = vi.fn<ChatService["setSeatKnobs"]>(async () => PARTICIPANT);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { setSeatKnobs } },
    });

    await caller(ctx).chat.setSeatKnobs({ chatId: CHAT, participantId: PARTICIPANT_ID, patch: {} });
    expect(setSeatKnobs).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      participantId: PARTICIPANT_ID,
      patch: {},
    });
  });

  test("a non-host gets the verb's leak-free NOT_FOUND (requireHost gate)", async () => {
    const setSeatKnobs = vi.fn<ChatService["setSeatKnobs"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { setSeatKnobs } },
    });

    await expect(caller(ctx).chat.setSeatKnobs({ chatId: CHAT, participantId: PARTICIPANT_ID, patch: { disabled: true } })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("an out-of-range talkativeness is rejected at the wire before the verb (seatKnobsSchema clamp)", async () => {
    const setSeatKnobs = vi.fn<ChatService["setSeatKnobs"]>(async () => PARTICIPANT);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { setSeatKnobs } },
    });

    await expect(caller(ctx).chat.setSeatKnobs({ chatId: CHAT, participantId: PARTICIPANT_ID, patch: { talkativeness: 1.5 } })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(setSeatKnobs).not.toHaveBeenCalled();
  });
});

describe("chat.forceCharacterTurn — the host summons a member to speak next (task #29 wire-through, host-only)", () => {
  test("a thin pass-through: chatId/characterId reach the verb with the resolved Principal", async () => {
    const forceCharacterTurn = vi.fn<ChatService["forceCharacterTurn"]>(async () => ({
      messages: [MESSAGE],
      aborted: false,
    }));
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { forceCharacterTurn } },
    });

    const result = await caller(ctx).chat.forceCharacterTurn({
      chatId: CHAT,
      characterId: CHARACTER,
    });

    expect(forceCharacterTurn).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      characterId: CHARACTER,
    });
    expect(result.messages).toEqual([MESSAGE]);
  });

  test("a non-host gets the verb's leak-free NOT_FOUND (requireHost gate)", async () => {
    const forceCharacterTurn = vi.fn<ChatService["forceCharacterTurn"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { forceCharacterTurn } },
    });

    await expect(caller(ctx).chat.forceCharacterTurn({ chatId: CHAT, characterId: CHARACTER })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("chat.updateTitle — the LIST-row rename verb (J5 wire-through, host-only)", () => {
  test("a thin pass-through: chatId/title reach the verb with the resolved Principal", async () => {
    const updateTitle = vi.fn<ChatService["updateTitle"]>(async () => undefined);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { updateTitle } },
    });

    const result = await caller(ctx).chat.updateTitle({ chatId: CHAT, title: "A new title" });

    expect(updateTitle).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      title: "A new title",
    });
    expect(result).toBeUndefined();
  });

  test("a null title clears it (the wire accepts string | null)", async () => {
    const updateTitle = vi.fn<ChatService["updateTitle"]>(async () => undefined);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { updateTitle } },
    });

    await caller(ctx).chat.updateTitle({ chatId: CHAT, title: null });

    expect(updateTitle).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      title: null,
    });
  });

  test("a non-host gets the verb's leak-free NOT_FOUND (requireHost gate)", async () => {
    const updateTitle = vi.fn<ChatService["updateTitle"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { updateTitle } },
    });

    await expect(caller(ctx).chat.updateTitle({ chatId: CHAT, title: "x" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("chat.star — the LIST-row star toggle (J5 wire-through, host-only)", () => {
  test("a thin pass-through: chatId/star reach the verb with the resolved Principal", async () => {
    const star = vi.fn<ChatService["star"]>(async () => undefined);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { star } },
    });

    await caller(ctx).chat.star({ chatId: CHAT, star: true });

    expect(star).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      star: true,
    });
  });

  test("a non-host gets the verb's leak-free NOT_FOUND (requireHost gate)", async () => {
    const star = vi.fn<ChatService["star"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { star } },
    });

    await expect(caller(ctx).chat.star({ chatId: CHAT, star: true })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("chat.archive — the LIST-row archive toggle (J5 wire-through, host-only)", () => {
  test("a thin pass-through: chatId/archived reach the verb with the resolved Principal", async () => {
    const archive = vi.fn<ChatService["archive"]>(async () => undefined);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { archive } },
    });

    await caller(ctx).chat.archive({ chatId: CHAT, archived: true });

    expect(archive).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      archived: true,
    });
  });

  test("a non-host gets the verb's leak-free NOT_FOUND (requireHost gate)", async () => {
    const archive = vi.fn<ChatService["archive"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { archive } },
    });

    await expect(caller(ctx).chat.archive({ chatId: CHAT, archived: true })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("chat.delete — the LIST-row delete verb (J5 wire-through, host-only)", () => {
  test("a thin pass-through: chatId reaches the verb with the resolved Principal", async () => {
    const del = vi.fn<ChatService["delete"]>(async () => undefined);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { delete: del } },
    });

    const result = await caller(ctx).chat.delete({ chatId: CHAT });

    expect(del).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
    });
    expect(result).toBeUndefined();
  });

  test("a non-host gets the verb's leak-free NOT_FOUND (requireHost gate)", async () => {
    const del = vi.fn<ChatService["delete"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { delete: del } },
    });

    await expect(caller(ctx).chat.delete({ chatId: CHAT })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("chat.getGroupConfig / chat.setGroupConfig — the group-config wire-through (domain-ahead-of-transport)", () => {
  test("setGroupConfig: a thin pass-through — chatId + the PARSED config reach the verb with the Principal", async () => {
    const setGroupConfig = vi.fn<ChatService["setGroupConfig"]>(async () => DEFAULT_GROUP_CONFIG);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { setGroupConfig } },
    });
    await caller(ctx).chat.setGroupConfig({
      chatId: CHAT,
      config: { output: "narrator", policy: "natural" },
    });
    expect(setGroupConfig).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      // The wire `groupConfigSchema` fully-defaults the lenient input before the verb (narrator ⇒ speakerTags true).
      config: expect.objectContaining({ output: "narrator", policy: "natural", speakerTags: true }),
    });
  });

  test("getGroupConfig: a thin pass-through — chatId reaches the verb; the effective config returns", async () => {
    const getGroupConfigForChat = vi.fn<ChatService["getGroupConfigForChat"]>(async () => DEFAULT_GROUP_CONFIG);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { getGroupConfigForChat } },
    });
    const result = await caller(ctx).chat.getGroupConfig({ chatId: CHAT });
    expect(getGroupConfigForChat).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
    });
    expect(result).toEqual(DEFAULT_GROUP_CONFIG);
  });
});
