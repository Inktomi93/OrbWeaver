// @subject packages/client/src/data/invalidation.ts
import type { Invalidation } from "@orb/client/data";
import { pressForPage, useInvalidation } from "@orb/client/data";
import type { MessageId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { AppDataProviders, createClientRuntime } from "@orb/testkit/browser";
import { createSeededIds, FIXTURE_ID_CURSOR } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { InfiniteData } from "@tanstack/react-query";
import { InfiniteQueryObserver } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { vi } from "vitest";

const ids = createSeededIds(FIXTURE_ID_CURSOR);
const TAIL = "tail";
const OLDER = "older";

function CaptureInvalidation({ facades }: { readonly facades: Invalidation[] }): null {
  facades.push(useInvalidation());
  return null;
}

// The slice of a history page the room's carriers reconcile, plus this query's own cursor.
interface Page {
  readonly messages: readonly { readonly id: MessageId; readonly seq: number }[];
  readonly previous: string | null;
}

// A press survives as many room events as it has attempts to spare: each event costs it one read.
for (const events of [1, 2] as const) {
  test(`a press for older history still lands its page when ${String(events)} room ${events === 1 ? "event cancels" : "events cancel"} its reads in separate waves`, async () => {
    const runtime = createClientRuntime("http://chat-press.test/api/trpc");
    const facades: Invalidation[] = [];
    // biome-ignore lint/correctness/noChildrenProp: The native createElement overload requires the provider's required children prop in its props argument.
    renderToString(createElement(AppDataProviders, { runtime, children: createElement(CaptureInvalidation, { facades }) }));
    const [invalidation] = facades;
    if (invalidation === undefined) {
      throw new Error("The production providers did not expose invalidation");
    }
    const { queryClient } = runtime;
    const chatId = ids.typeId(ID_PREFIX.chat);
    // The room's own history key, so the room's events reach this query exactly as they reach the transcript's.
    const queryKey = runtime.trpcProxy.chat.listMessages.infiniteQueryKey({ chatId });
    const tail: Page = { messages: [{ id: ids.typeId(ID_PREFIX.message), seq: 2 }], previous: OLDER };
    const older: Page = { messages: [{ id: ids.typeId(ID_PREFIX.message), seq: 1 }], previous: null };
    const server = { olderReads: 0, answering: false };
    const held: (() => void)[] = [];
    const observer = new InfiniteQueryObserver<Page, Error, InfiniteData<Page>, typeof queryKey, string>(queryClient, {
      queryKey,
      initialPageParam: TAIL,
      queryFn: ({ pageParam }) => {
        if (pageParam === TAIL) {
          return Promise.resolve(tail);
        }
        server.olderReads += 1;
        return server.answering ? Promise.resolve(older) : new Promise<Page>((resolve) => held.push(() => resolve(older)));
      },
      getPreviousPageParam: (first) => first.previous ?? undefined,
      getNextPageParam: () => undefined,
    });
    const unsubscribe = observer.subscribe(() => undefined);
    try {
      await vi.waitFor(() => expect(observer.getCurrentResult().data?.pages).toHaveLength(1));
      const press = pressForPage((options) => observer.fetchPreviousPage(options), 1, "previous");
      // Each event lands only once the press is reading again since the last one, so each is its own wave.
      for (let sent = 0; sent < events; sent += 1) {
        await vi.waitFor(() => {
          expect(server.olderReads).toBeGreaterThan(sent);
          expect(queryClient.getQueryState(queryKey)?.fetchStatus).toBe("fetching");
        });
        invalidation.invalidate({ type: "messagesDeleted", chatId, messageIds: [ids.typeId(ID_PREFIX.message)] });
      }
      server.answering = true;
      for (const release of held) {
        release();
      }
      expect(await press).toEqual([older, tail]);
    } finally {
      unsubscribe();
      queryClient.clear();
    }
  });
}

const EVENTS_PER_WAVE = 3;

// A wave is the events delivered before its flush timer runs; frames arrive in tasks of their own, so each event here
// waits for the next task while the timer is held.
test("a press for older history spends one attempt per wave however many events and tasks the wave spans", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  const runtime = createClientRuntime("http://chat-press.test/api/trpc");
  const facades: Invalidation[] = [];
  // biome-ignore lint/correctness/noChildrenProp: The native createElement overload requires the provider's required children prop in its props argument.
  renderToString(createElement(AppDataProviders, { runtime, children: createElement(CaptureInvalidation, { facades }) }));
  const [invalidation] = facades;
  if (invalidation === undefined) {
    throw new Error("The production providers did not expose invalidation");
  }
  const { queryClient } = runtime;
  const chatId = ids.typeId(ID_PREFIX.chat);
  const queryKey = runtime.trpcProxy.chat.listMessages.infiniteQueryKey({ chatId });
  const tail: Page = { messages: [{ id: ids.typeId(ID_PREFIX.message), seq: 2 }], previous: OLDER };
  const older: Page = { messages: [{ id: ids.typeId(ID_PREFIX.message), seq: 1 }], previous: null };
  const server = { olderReads: 0, answering: false };
  const observer = new InfiniteQueryObserver<Page, Error, InfiniteData<Page>, typeof queryKey, string>(queryClient, {
    queryKey,
    initialPageParam: TAIL,
    queryFn: ({ pageParam }) => {
      if (pageParam === TAIL) {
        return Promise.resolve(tail);
      }
      server.olderReads += 1;
      return server.answering ? Promise.resolve(older) : new Promise<Page>(() => undefined);
    },
    getPreviousPageParam: (first) => first.previous ?? undefined,
    getNextPageParam: () => undefined,
  });
  const unsubscribe = observer.subscribe(() => undefined);
  const nextTask = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
  try {
    await vi.waitFor(() => expect(observer.getCurrentResult().data?.pages).toHaveLength(1));
    const press = pressForPage((options) => observer.fetchPreviousPage(options), 1, "previous");
    for (const wave of [0, 1]) {
      await vi.waitFor(() => {
        expect(server.olderReads).toBeGreaterThan(wave);
        expect(queryClient.getQueryState(queryKey)?.fetchStatus).toBe("fetching");
      });
      for (let sent = 0; sent < EVENTS_PER_WAVE; sent += 1) {
        invalidation.invalidate({ type: "messagesDeleted", chatId, messageIds: [ids.typeId(ID_PREFIX.message)] });
        await nextTask();
      }
      server.answering = wave === 1;
      vi.runOnlyPendingTimers();
    }
    expect(await press).toEqual([older, tail]);
  } finally {
    unsubscribe();
    queryClient.clear();
    vi.useRealTimers();
  }
});
