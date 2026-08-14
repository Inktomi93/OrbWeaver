// The no-refetch CARRIER (data/invalidation-carrier.ts): what a canon event WRITES on its way through the
// seam, as opposed to what it stales (invalidation.test.ts's three filter contracts). Driven against a REAL
// `QueryClient` + the REAL tRPC options proxy — never a hand-mock, because the whole subject is whether the
// patch lands on the exact key `chat.listMessages` serves (the proxy IS the key factory).
//
// WHY IT EXISTS: the event's `view` is the contract's own "no-refetch carrier", and the seam used to refetch
// while never applying it — so the room rendered the PRE-event row for the whole round trip. That is the
// measured 100-400 ms tail flash on every turn (`domain/chat/verbs/turn.ts` FLAG[aux-turns-have-no-accept]):
// `turnCompleted` closes the turn slot synchronously, the ghost unmounts, and the canon row underneath is
// still the OLD variant until the wire answers.

import { applyCanonView, createTrpcClient, createTrpcProxy } from "@orb/client/data";
import type { ChatBusEvent, MessageView } from "@orb/contracts/chat";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { QueryClient } from "@tanstack/react-query";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";
import { makeMessageView } from "../features/chat/fixtures.ts";

const CHAT_ID = castId<ChatId>("chat_carriertest_0001");
const MESSAGE_ID = castId<MessageId>("msg_carriertest_0001");
const OTHER_MESSAGE_ID = castId<MessageId>("msg_carriertest_0002");

/** Fresh client + proxy per test — no shared cache state to bleed across assertions. */
function setup(): { readonly queryClient: QueryClient; readonly trpc: ReturnType<typeof createTrpcProxy> } {
  const queryClient = new QueryClient();
  return { queryClient, trpc: createTrpcProxy(createTrpcClient("http://localhost/api/trpc"), queryClient) };
}

/** A REAL `MessageView` (the shared client fixture — never a hand-shaped literal: the carrier's whole point
 *  is that it IS the row `listMessages` serves). */
function view(id: MessageId, content: string): MessageView {
  return makeMessageView({ id, chatId: CHAT_ID, content });
}

/** A `MessagesPage`-shaped cache value — the wire shape `chat.listMessages` serves. */
function page(messages: readonly MessageView[]): { readonly messages: readonly MessageView[]; readonly cast: readonly never[] } {
  return { messages, cast: [] };
}

/** The rows in the cached page, id+content only (what the patch is allowed to move). */
function cachedRows(queryClient: QueryClient, queryKey: readonly unknown[]): unknown {
  const data = queryClient.getQueryData<{ readonly messages: readonly MessageView[] }>([...queryKey]);
  return data?.messages.map((m) => ({ id: m.id, content: m.content }));
}

/** The six canon members that CARRY a view — the contract's own family ("Canon mutations (view = the
 *  no-refetch carrier)"). Spelled as whole events (not a loop over a type string) so each one is a REAL
 *  `ChatBusEvent`: a member that later drops its `view` field fails to compile HERE. */
const VIEW_CARRIER_EVENTS: readonly ChatBusEvent[] = [
  { type: "messageCommitted", chatId: CHAT_ID, messageId: MESSAGE_ID, view: view(MESSAGE_ID, "after messageCommitted") },
  { type: "messageEdited", chatId: CHAT_ID, messageId: MESSAGE_ID, view: view(MESSAGE_ID, "after messageEdited") },
  { type: "messageHidden", chatId: CHAT_ID, messageId: MESSAGE_ID, view: view(MESSAGE_ID, "after messageHidden") },
  { type: "variantSelected", chatId: CHAT_ID, messageId: MESSAGE_ID, view: view(MESSAGE_ID, "after variantSelected") },
  { type: "reasoningEdited", chatId: CHAT_ID, messageId: MESSAGE_ID, view: view(MESSAGE_ID, "after reasoningEdited") },
  { type: "reasoningCleared", chatId: CHAT_ID, messageId: MESSAGE_ID, view: view(MESSAGE_ID, "after reasoningCleared") },
];

describe("applyCanonView — the view carrier written into the room's message list", () => {
  test("REPLACES its row in place (the swipe's new variant, with no wire read)", () => {
    const { queryClient, trpc } = setup();
    const key = trpc.chat.listMessages.queryKey({ chatId: CHAT_ID });
    queryClient.setQueryData([...key], page([view(OTHER_MESSAGE_ID, "Ping?"), view(MESSAGE_ID, "old variant")]) as never);

    applyCanonView(queryClient, trpc, { type: "messageCommitted", chatId: CHAT_ID, messageId: MESSAGE_ID, view: view(MESSAGE_ID, "new variant") });

    expect(cachedRows(queryClient, key)).toEqual([
      { id: OTHER_MESSAGE_ID, content: "Ping?" },
      { id: MESSAGE_ID, content: "new variant" },
    ]);
  });

  test("APPENDS at the tail for a row the page has never seen (a fresh reply / the caller's own send)", () => {
    const { queryClient, trpc } = setup();
    const key = trpc.chat.listMessages.queryKey({ chatId: CHAT_ID });
    queryClient.setQueryData([...key], page([view(OTHER_MESSAGE_ID, "Ping?")]) as never);

    applyCanonView(queryClient, trpc, { type: "messageCommitted", chatId: CHAT_ID, messageId: MESSAGE_ID, view: view(MESSAGE_ID, "the reply") });

    expect(cachedRows(queryClient, key)).toEqual([
      { id: OTHER_MESSAGE_ID, content: "Ping?" },
      { id: MESSAGE_ID, content: "the reply" },
    ]);
  });

  test("applies for EVERY view-carrying member (edit/hide/variantSelected/reasoning*, not just the commit)", () => {
    // The carrier is a property of the EVENT FAMILY, so this is applied structurally — every member here,
    // or an edit/hide/select would silently go back to waiting on the wire like the commit used to.
    for (const event of VIEW_CARRIER_EVENTS) {
      const { queryClient, trpc } = setup();
      const key = trpc.chat.listMessages.queryKey({ chatId: CHAT_ID });
      queryClient.setQueryData([...key], page([view(MESSAGE_ID, "before")]) as never);

      applyCanonView(queryClient, trpc, event);

      expect(cachedRows(queryClient, key)).toEqual([{ id: MESSAGE_ID, content: `after ${event.type}` }]);
    }
  });

  test("a view-LESS event leaves the page byte-identical (the raced-delete arm never blanks a row)", () => {
    const { queryClient, trpc } = setup();
    const key = trpc.chat.listMessages.queryKey({ chatId: CHAT_ID });
    const before = page([view(MESSAGE_ID, "untouched")]);
    queryClient.setQueryData([...key], before as never);

    applyCanonView(queryClient, trpc, { type: "messageCommitted", chatId: CHAT_ID, messageId: MESSAGE_ID });

    expect(queryClient.getQueryData([...key])).toBe(before); // same reference — no rewrite at all
  });

  test("a NON-carrier event is untouched (messagesDeleted moves rows the carrier cannot describe)", () => {
    const { queryClient, trpc } = setup();
    const key = trpc.chat.listMessages.queryKey({ chatId: CHAT_ID });
    const before = page([view(MESSAGE_ID, "untouched")]);
    queryClient.setQueryData([...key], before as never);

    applyCanonView(queryClient, trpc, { type: "messagesDeleted", chatId: CHAT_ID, messageIds: [MESSAGE_ID] });

    expect(queryClient.getQueryData([...key])).toBe(before);
  });

  test("no cached page for the chat ⇒ no entry is created (a background room never gains a phantom list)", () => {
    const { queryClient, trpc } = setup();
    const key = trpc.chat.listMessages.queryKey({ chatId: CHAT_ID });

    applyCanonView(queryClient, trpc, { type: "messageCommitted", chatId: CHAT_ID, messageId: MESSAGE_ID, view: view(MESSAGE_ID, "the reply") });

    expect(queryClient.getQueryData([...key])).toBeUndefined();
  });
});
