// The central invalidation seam (data/invalidation.ts header): ONE exhaustive event→filters map +
// ONE `invalidateFilters` chokepoint — the neo lesson was invalidation sprawl (81 call sites, no
// map), not queryKey drift. This pins the map's actual DISPATCH behavior against a REAL `QueryClient`
// + a REAL tRPC options proxy (never a hand-mock — a mock erases exactly the queryKey/queryFilter
// shape this seam exists to get right): a canon-mutation event invalidates the room + message-list +
// chat-list reads; a stream-transient event ("nothing" map entries) invalidates NONE of them; the
// mutation-facing `invalidateFilters` chokepoint (what `createEntityMutation.onSettled` calls) marks
// its target stale too. `QueryClient.invalidateQueries` MARKS a matched query `isInvalidated` even
// with no active observer (only the optional refetch needs one) — so this needs no mounted query,
// no network: `createTrpcClient()` never fires a request until something actually queries.

import { createInvalidation, createTrpcClient, createTrpcProxy } from "@orb/client/data";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { QueryClient } from "@tanstack/react-query";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

const CHAT_ID = castId<ChatId>("chat_invalidationtest");
const MESSAGE_ID = castId<MessageId>("msg_invalidationtest0");

/** Fresh client + proxy per test — no shared cache state to bleed across assertions. */
function setup(): ReturnType<typeof createInvalidation> & {
  readonly queryClient: QueryClient;
  readonly trpc: ReturnType<typeof createTrpcProxy>;
} {
  const queryClient = new QueryClient();
  const trpc = createTrpcProxy(createTrpcClient("http://localhost/api/trpc"), queryClient);
  return { ...createInvalidation({ queryClient, trpc }), queryClient, trpc };
}

function isInvalidated(queryClient: QueryClient, queryKey: readonly unknown[]): boolean {
  return (
    queryClient.getQueryCache().find({ queryKey: [...queryKey] })?.state.isInvalidated ?? false
  );
}

describe("invalidation — the bus half (invalidate)", () => {
  test("a canon-mutation event invalidates the room read + message-list + chat-list", () => {
    const { invalidate, queryClient, trpc } = setup();
    const getChatKey = trpc.chat.getChat.queryKey({ chatId: CHAT_ID });
    const listMessagesKey = trpc.chat.listMessages.queryKey({ chatId: CHAT_ID });
    const listChatsKey = trpc.chat.listChats.queryKey();
    // A minimal stand-in cache value — this test asserts on `isInvalidated`, never the shape, so a
    // full `ChatView` fixture would be padding; the cast documents that deliberately.
    queryClient.setQueryData(getChatKey, { id: CHAT_ID } as never);
    queryClient.setQueryData(listMessagesKey, []);
    queryClient.setQueryData(listChatsKey, []);

    const event: ChatBusEvent = {
      type: "messageCommitted",
      chatId: CHAT_ID,
      messageId: MESSAGE_ID,
    };
    invalidate(event);

    expect(isInvalidated(queryClient, getChatKey)).toBe(true);
    expect(isInvalidated(queryClient, listMessagesKey)).toBe(true);
    expect(isInvalidated(queryClient, listChatsKey)).toBe(true);
  });

  test("a stream-transient event (the 'nothing' map entries) invalidates NOTHING", () => {
    const { invalidate, queryClient, trpc } = setup();
    const getChatKey = trpc.chat.getChat.queryKey({ chatId: CHAT_ID });
    queryClient.setQueryData(getChatKey, { id: CHAT_ID } as never);
    expect(isInvalidated(queryClient, getChatKey)).toBe(false);

    const event: ChatBusEvent = {
      type: "delta",
      chatId: CHAT_ID,
      delta: { chatId: CHAT_ID, kind: "text", text: "partial token" },
    };
    invalidate(event);

    // The delta map entry is `nothing` — the read model is untouched by a mid-stream token.
    expect(isInvalidated(queryClient, getChatKey)).toBe(false);
  });

  test("wiBookAttached invalidates BOTH the world-info reads and the room (assembly pool changed)", () => {
    const { invalidate, queryClient, trpc } = setup();
    const getChatKey = trpc.chat.getChat.queryKey({ chatId: CHAT_ID });
    const worldInfoKey = trpc.worldInfo.listBooks.queryKey();
    queryClient.setQueryData(getChatKey, { id: CHAT_ID } as never);
    queryClient.setQueryData(worldInfoKey, []);

    invalidate({
      type: "wiBookAttached",
      chatId: CHAT_ID,
      bookId: castId("book_x"),
    } as ChatBusEvent);

    expect(isInvalidated(queryClient, getChatKey)).toBe(true);
    expect(isInvalidated(queryClient, worldInfoKey)).toBe(true);
  });
});

describe("invalidation — the mutation half (invalidateFilters)", () => {
  test("createEntityMutation's onSettled chokepoint marks its target filter stale", () => {
    const { invalidateFilters, queryClient, trpc } = setup();
    const listTagsKey = trpc.tag.listTags.queryKey();
    queryClient.setQueryData(listTagsKey, []);
    expect(isInvalidated(queryClient, listTagsKey)).toBe(false);

    invalidateFilters([trpc.tag.listTags.queryFilter()]);

    expect(isInvalidated(queryClient, listTagsKey)).toBe(true);
  });

  test("invalidateFilters with an empty array (an event's explicit []) touches nothing", () => {
    const { invalidateFilters, queryClient, trpc } = setup();
    const listTagsKey = trpc.tag.listTags.queryKey();
    queryClient.setQueryData(listTagsKey, []);

    invalidateFilters([]);

    expect(isInvalidated(queryClient, listTagsKey)).toBe(false);
  });
});
