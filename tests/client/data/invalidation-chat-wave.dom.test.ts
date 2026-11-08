// @subject packages/client/src/data/invalidation.ts
import type { Invalidation } from "@orb/client/data";
import { useInvalidation } from "@orb/client/data";
import type { MessageId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { AppDataProviders, createClientRuntime } from "@orb/testkit/browser";
import { createSeededIds, FIXTURE_ID_CURSOR } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
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
