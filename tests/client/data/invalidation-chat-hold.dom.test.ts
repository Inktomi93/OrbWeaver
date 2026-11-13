// @subject packages/client/src/data/invalidation.ts
// A chat wave replaces a stale in-flight read with a refetch held until the flush. The held query function must reach
// that refetch alone: any other fetch reads at once, and a retired held refetch never reads.
import type { Invalidation } from "@orb/client/data";
import { useInvalidation } from "@orb/client/data";
import type { MessageId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { AppDataProviders, createClientRuntime } from "@orb/testkit/browser";
import { createSeededIds, FIXTURE_ID_CURSOR } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { InfiniteData, QueryKey } from "@tanstack/react-query";
import { InfiniteQueryObserver } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { vi } from "vitest";

const ids = createSeededIds(FIXTURE_ID_CURSOR);
const TAIL = "tail";

function CaptureInvalidation({ facades }: { readonly facades: Invalidation[] }): null {
  facades.push(useInvalidation());
  return null;
}

// The slice of a history page the room's carriers reconcile.
interface Page {
  readonly messages: readonly { readonly id: MessageId; readonly seq: number }[];
}

type HistoryObserver = InfiniteQueryObserver<Page, Error, InfiniteData<Page>, QueryKey, string>;

class HeldRoom implements Disposable {
  readonly runtime = createClientRuntime("http://chat-hold.test/api/trpc");
  readonly chatId = ids.typeId(ID_PREFIX.chat);
  readonly queryKey = this.runtime.trpcProxy.chat.listMessages.infiniteQueryKey({ chatId: this.chatId });
  readonly invalidation: Invalidation;
  /** Every call of the room's own query function, held or not. */
  reads = 0;
  holding = false;
  private readonly tail: Page = { messages: [{ id: ids.typeId(ID_PREFIX.message), seq: 1 }] };

  constructor() {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const facades: Invalidation[] = [];
    // biome-ignore lint/correctness/noChildrenProp: The native createElement overload requires the provider's required children prop in its props argument.
    renderToString(createElement(AppDataProviders, { runtime: this.runtime, children: createElement(CaptureInvalidation, { facades }) }));
    const [invalidation] = facades;
    if (invalidation === undefined) {
      throw new Error("The production providers did not expose invalidation");
    }
    this.invalidation = invalidation;
  }

  observer(): HistoryObserver {
    return new InfiniteQueryObserver<Page, Error, InfiniteData<Page>, QueryKey, string>(this.runtime.queryClient, {
      queryKey: this.queryKey,
      initialPageParam: TAIL,
      queryFn: (): Promise<Page> => {
        this.reads += 1;
        return this.holding ? new Promise<Page>(() => undefined) : Promise.resolve(this.tail);
      },
      getPreviousPageParam: (): undefined => undefined,
      getNextPageParam: (): undefined => undefined,
    });
  }

  [Symbol.dispose](): void {
    this.runtime.queryClient.clear();
    vi.useRealTimers();
  }
}

/** Loads the tail, starts a read that never answers, then sends a room event so the wave holds a refetch. Returns the
 *  stale read's own promise, which settles once whatever replaced it does. */
async function holdRefetch(room: HeldRoom, observer: HistoryObserver): Promise<{ readonly stale: Promise<unknown> }> {
  await vi.waitFor(() => expect(observer.getCurrentResult().data?.pages).toHaveLength(1));
  room.holding = true;
  const stale = observer.refetch();
  expect(room.reads).toBe(2);
  room.invalidation.invalidate({ type: "messagesDeleted", chatId: room.chatId, messageIds: [ids.typeId(ID_PREFIX.message)] });
  // The held refetch replaced the stale read and reads nothing before the flush.
  expect(room.reads).toBe(2);
  expect(room.runtime.queryClient.getQueryState(room.queryKey)?.fetchStatus).toBe("fetching");
  room.holding = false;
  return { stale };
}

test("a refetch another path starts during a wave reads through the room's own query function at once", async () => {
  using room = new HeldRoom();
  const observer = room.observer();
  const unsubscribe = observer.subscribe(() => undefined);
  try {
    const { stale } = await holdRefetch(room, observer);
    // A client-wide refetch runs the query's stored options, which the held refetch must have restored.
    const clientWide = room.runtime.queryClient.refetchQueries({ queryKey: room.queryKey, exact: true });
    expect(room.reads).toBe(3);
    const concurrent = room.observer().refetch();
    expect(room.reads).toBe(4);
    vi.runOnlyPendingTimers();
    await Promise.all([stale, clientWide, concurrent]);
    await vi.waitFor(() => expect(room.runtime.queryClient.getQueryState(room.queryKey)?.fetchStatus).toBe("idle"));
  } finally {
    unsubscribe();
  }
});

test("a held refetch a cancelQueries revert rolls back after the flush still owes the next mount its read", async () => {
  using room = new HeldRoom();
  const observer = room.observer();
  const unsubscribe = observer.subscribe(() => undefined);
  const { stale } = await holdRefetch(room, observer);
  // The held refetch reads at the flush, and the server does not answer it.
  room.holding = true;
  vi.runOnlyPendingTimers();
  await vi.waitFor(() => expect(room.reads).toBe(3));
  // An optimistic write cancels the reads under its key before it patches; the cancel reverts the held refetch.
  await room.runtime.queryClient.cancelQueries({ queryKey: room.queryKey });
  await stale;
  expect(room.runtime.queryClient.getQueryState(room.queryKey)?.fetchStatus).toBe("idle");
  room.holding = false;
  unsubscribe();
  const remount = room.observer();
  const unsubscribeRemount = remount.subscribe(() => undefined);
  try {
    await vi.waitFor(() => expect(room.reads).toBe(4));
    await vi.waitFor(() => expect(room.runtime.queryClient.getQueryState(room.queryKey)?.fetchStatus).toBe("idle"));
  } finally {
    unsubscribeRemount();
  }
});

test("a held refetch whose query is removed before the flush never reads", async () => {
  using room = new HeldRoom();
  const observer = room.observer();
  const unsubscribe = observer.subscribe(() => undefined);
  const { stale } = await holdRefetch(room, observer);
  unsubscribe();
  room.runtime.queryClient.removeQueries({ queryKey: room.queryKey, exact: true });
  vi.runOnlyPendingTimers();
  await stale;
  // The positive control: a fresh read of the same room reads through its own function once the wave has flushed.
  const fresh = room.observer();
  const unsubscribeFresh = fresh.subscribe(() => undefined);
  try {
    await vi.waitFor(() => expect(fresh.getCurrentResult().data?.pages).toHaveLength(1));
    expect(room.reads).toBe(3);
  } finally {
    unsubscribeFresh();
  }
});
