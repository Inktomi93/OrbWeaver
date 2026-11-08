// @subject packages/client/src/data/invalidation.ts
import type { Invalidation } from "@orb/client/data";
import { useInvalidation } from "@orb/client/data";
import type { ChatBusEvent, MessageView } from "@orb/contracts/chat";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { AppDataProviders, createClientRuntime } from "@orb/testkit/browser";
import { createSeededIds, FIXTURE_ID_CURSOR } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { makeMessageView } from "@orb/testkit/node/helpers";
import { QueryObserver } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { vi } from "vitest";

const ids = createSeededIds(FIXTURE_ID_CURSOR);

function CaptureInvalidation({ facades }: { readonly facades: Invalidation[] }): null {
  facades.push(useInvalidation());
  return null;
}

// The wire body of one history page; only the ids matter to a delete's carrier.
const page = (messageIds: readonly MessageId[]): unknown => ({
  messages: messageIds.map((id, seq) => ({ id, seq, toolCalls: [] })),
  identities: {},
  previousCursor: null,
  nextCursor: null,
});

test("a room read answered before a delete never lands over the delete's carrier while the burst's refetch waits", async () => {
  const runtime = createClientRuntime("http://chat-wave.test/api/trpc");
  const facades: Invalidation[] = [];
  // biome-ignore lint/correctness/noChildrenProp: The native createElement overload requires the provider's required children prop in its props argument.
  renderToString(createElement(AppDataProviders, { runtime, children: createElement(CaptureInvalidation, { facades }) }));
  const [invalidation] = facades;
  if (invalidation === undefined) {
    throw new Error("The production providers did not expose invalidation");
  }
  const chatId = ids.typeId(ID_PREFIX.chat);
  const kept = ids.typeId(ID_PREFIX.message);
  const deleted = ids.typeId(ID_PREFIX.message);
  const before = page([kept, deleted]);
  const held = Promise.withResolvers<Response>();
  const heldStarted = Promise.withResolvers<void>();
  let reads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>((input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!new URL(url).pathname.includes("chat.listMessages")) {
        return Promise.resolve(Response.json([{ result: { data: null } }]));
      }
      reads += 1;
      if (reads === 1) {
        return Promise.resolve(Response.json([{ result: { data: before } }]));
      }
      if (reads === 2) {
        heldStarted.resolve();
        return held.promise;
      }
      return Promise.resolve(Response.json([{ result: { data: page([kept]) } }]));
    }),
  );
  const options = runtime.trpcProxy.chat.listMessages.queryOptions({ chatId });
  const shown: string[][] = [];
  const unsubscribe = new QueryObserver(runtime.queryClient, options).subscribe((result) => {
    if (result.data !== undefined) {
      shown.push(result.data.messages.map((message) => message.id));
    }
  });
  try {
    await runtime.queryClient.query(options);
    invalidation.invalidate({ type: "messagesDeleted", chatId, messageIds: [ids.typeId(ID_PREFIX.message)] });
    await heldStarted.promise;
    invalidation.invalidate({ type: "messagesDeleted", chatId, messageIds: [deleted] });
    const afterCarrier = shown.length;
    // The server answered this read before it applied the delete.
    held.resolve(Response.json([{ result: { data: before } }]));
    await vi.waitFor(() => {
      expect(reads).toBe(3);
      expect(runtime.queryClient.getQueryState(options.queryKey)?.fetchStatus).toBe("idle");
    });
    expect(shown.slice(afterCarrier).filter((messageIds) => messageIds.includes(deleted))).toEqual([]);
    expect(runtime.queryClient.getQueryData(options.queryKey)?.messages.map((message) => message.id)).toEqual([kept]);
  } finally {
    unsubscribe();
    runtime.queryClient.clear();
    vi.unstubAllGlobals();
  }
});

const viewPage = (messages: readonly MessageView[]): unknown => ({ messages, identities: {}, previousCursor: null, nextCursor: null });

// What a room read answers before and after the event, the event, and whether a shown page lost its carrier.
interface CarrierCase {
  readonly before: readonly MessageView[];
  readonly after: readonly MessageView[];
  readonly event: ChatBusEvent;
  readonly lost: (shown: readonly MessageView[]) => boolean;
}

// The carriers that rewrite a row the page already holds.
const VIEW_CARRIER_KINDS = [
  "messageEdited",
  "messageHidden",
  "variantSelected",
  "reasoningEdited",
  "reasoningCleared",
] as const satisfies readonly ChatBusEvent["type"][];
type ViewCarrierKind = (typeof VIEW_CARRIER_KINDS)[number];
const BEFORE = "The row as the server held it before the event.";
const AFTER = "The row as the event's carrier holds it.";

function rewriteCase(kind: ViewCarrierKind, chatId: ChatId): CarrierCase {
  const row = makeMessageView({ chatId, seq: 1, content: BEFORE });
  const other = makeMessageView({ chatId, seq: 2 });
  const rewritten = { ...row, content: AFTER };
  return {
    before: [row, other],
    after: [rewritten, other],
    event: { type: kind, chatId, messageId: row.id, view: rewritten },
    lost: (shown) => shown.find((message) => message.id === row.id)?.content !== AFTER,
  };
}

// The ghost handover: the reply's commit appends the row the closing turn slot hands its text to.
function handoverCase(chatId: ChatId): CarrierCase {
  const sent = makeMessageView({ chatId, seq: 1 });
  const reply = makeMessageView({ chatId, seq: 2, role: "assistant", content: AFTER });
  return {
    before: [sent],
    after: [sent, reply],
    event: { type: "messageCommitted", chatId, messageId: reply.id, view: reply },
    lost: (shown) => !shown.some((message) => message.id === reply.id),
  };
}

for (const kind of ["messageCommitted", ...VIEW_CARRIER_KINDS] as const) {
  test(`a room read answered before a ${kind} never lands over its carrier`, async () => {
    const runtime = createClientRuntime("http://chat-wave.test/api/trpc");
    const facades: Invalidation[] = [];
    // biome-ignore lint/correctness/noChildrenProp: The native createElement overload requires the provider's required children prop in its props argument.
    renderToString(createElement(AppDataProviders, { runtime, children: createElement(CaptureInvalidation, { facades }) }));
    const [invalidation] = facades;
    if (invalidation === undefined) {
      throw new Error("The production providers did not expose invalidation");
    }
    const chatId = ids.typeId(ID_PREFIX.chat);
    const subject = kind === "messageCommitted" ? handoverCase(chatId) : rewriteCase(kind, chatId);
    const held = Promise.withResolvers<Response>();
    const heldStarted = Promise.withResolvers<void>();
    let reads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>((input) => {
        const url = input instanceof Request ? input.url : String(input);
        if (!new URL(url).pathname.includes("chat.listMessages")) {
          return Promise.resolve(Response.json([{ result: { data: null } }]));
        }
        reads += 1;
        if (reads === 1) {
          return Promise.resolve(Response.json([{ result: { data: viewPage(subject.before) } }]));
        }
        if (reads === 2) {
          heldStarted.resolve();
          return held.promise;
        }
        return Promise.resolve(Response.json([{ result: { data: viewPage(subject.after) } }]));
      }),
    );
    const options = runtime.trpcProxy.chat.listMessages.queryOptions({ chatId });
    const shown: (readonly MessageView[])[] = [];
    const unsubscribe = new QueryObserver(runtime.queryClient, options).subscribe((result) => {
      if (result.data !== undefined) {
        shown.push(result.data.messages);
      }
    });
    try {
      await runtime.queryClient.query(options);
      invalidation.invalidate({ type: "messagesDeleted", chatId, messageIds: [ids.typeId(ID_PREFIX.message)] });
      await heldStarted.promise;
      invalidation.invalidate(subject.event);
      const afterCarrier = shown.length;
      expect(subject.lost(shown.at(-1) ?? [])).toBe(false);
      // The server answered this read before it applied the event.
      held.resolve(Response.json([{ result: { data: viewPage(subject.before) } }]));
      await vi.waitFor(() => {
        expect(reads).toBe(3);
        expect(runtime.queryClient.getQueryState(options.queryKey)?.fetchStatus).toBe("idle");
      });
      expect(shown.slice(afterCarrier).filter(subject.lost)).toEqual([]);
      expect(runtime.queryClient.getQueryData(options.queryKey)?.messages).toEqual(subject.after);
    } finally {
      unsubscribe();
      runtime.queryClient.clear();
      vi.unstubAllGlobals();
    }
  });
}

test("a room read nothing observes keeps its in-flight read across a room event the wave does not refetch it for", async () => {
  const runtime = createClientRuntime("http://chat-wave.test/api/trpc");
  const facades: Invalidation[] = [];
  // biome-ignore lint/correctness/noChildrenProp: The native createElement overload requires the provider's required children prop in its props argument.
  renderToString(createElement(AppDataProviders, { runtime, children: createElement(CaptureInvalidation, { facades }) }));
  const [invalidation] = facades;
  if (invalidation === undefined) {
    throw new Error("The production providers did not expose invalidation");
  }
  const chatId = ids.typeId(ID_PREFIX.chat);
  const first = makeMessageView({ chatId, seq: 1 });
  const landed = [first, makeMessageView({ chatId, seq: 2 })];
  const held = Promise.withResolvers<Response>();
  const heldStarted = Promise.withResolvers<void>();
  let reads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>((input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!new URL(url).pathname.includes("chat.listMessages")) {
        return Promise.resolve(Response.json([{ result: { data: null } }]));
      }
      reads += 1;
      if (reads === 2) {
        heldStarted.resolve();
        return held.promise;
      }
      return Promise.resolve(Response.json([{ result: { data: viewPage([first]) } }]));
    }),
  );
  const options = runtime.trpcProxy.chat.listMessages.queryOptions({ chatId });
  try {
    await runtime.queryClient.query(options);
    const refetch = runtime.queryClient.refetchQueries({ queryKey: options.queryKey, exact: true });
    await heldStarted.promise;
    invalidation.invalidate({ type: "messagesDeleted", chatId, messageIds: [ids.typeId(ID_PREFIX.message)] });
    expect(runtime.queryClient.getQueryState(options.queryKey)?.fetchStatus).toBe("fetching");
    // The flush marks the read stale and, with no observer, refetches nothing.
    await vi.waitFor(() => expect(runtime.queryClient.getQueryState(options.queryKey)?.isInvalidated).toBe(true));
    held.resolve(Response.json([{ result: { data: viewPage(landed) } }]));
    await refetch;
    expect(runtime.queryClient.getQueryData(options.queryKey)?.messages).toEqual(landed);
    expect(reads).toBe(2);
  } finally {
    runtime.queryClient.clear();
    vi.unstubAllGlobals();
  }
});
