// @subject packages/client/src/data/invalidation.ts
import type { Invalidation } from "@orb/client/data";
import { useInvalidation } from "@orb/client/data";
import type { MessageView } from "@orb/contracts/chat";
import { ID_PREFIX } from "@orb/kit/ids";
import { AppDataProviders, createClientRuntime } from "@orb/testkit/browser";
import { createSeededIds, FIXTURE_ID_CURSOR } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { makeMessageView, makeTagView } from "@orb/testkit/node/helpers";
import { notifyManager, QueryObserver } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { vi } from "vitest";

const ids = createSeededIds(FIXTURE_ID_CURSOR);

function CaptureInvalidation({ facades }: { readonly facades: Invalidation[] }): null {
  facades.push(useInvalidation(), useInvalidation());
  return null;
}

class InitialRead implements Disposable {
  readonly runtime = createClientRuntime("http://initial-read.test/api/trpc");
  readonly options = this.runtime.trpcProxy.tag.listTags.queryOptions();
  readonly initial = Promise.withResolvers<Response>();
  readonly unrelated = Promise.withResolvers<Response>();
  readonly unrelatedStarted = Promise.withResolvers<void>();
  readonly unrelatedRows: [] = [];
  readonly requestStarted = Promise.withResolvers<void>();
  readonly started = this.requestStarted.promise;
  readonly tag = makeTagView({ name: "Before commit" });
  readonly before = [this.tag];
  readonly after = [makeTagView({ id: this.tag.id, name: "After commit" })];
  readonly invalidation: Invalidation;
  readonly otherFacade: Invalidation;
  private readCount = 0;

  constructor() {
    const facades: Invalidation[] = [];
    // biome-ignore lint/correctness/noChildrenProp: The native createElement overload requires the provider's required children prop in its props argument.
    renderToString(createElement(AppDataProviders, { runtime: this.runtime, children: createElement(CaptureInvalidation, { facades }) }));
    const [invalidation, otherFacade] = facades;
    if (invalidation === undefined || otherFacade === undefined) {
      throw new Error("The production providers did not expose invalidation");
    }
    this.invalidation = invalidation;
    this.otherFacade = otherFacade;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>((input) => {
        const url = input instanceof Request ? input.url : String(input);
        if (new URL(url).pathname === "/api/trpc/persona.list") {
          this.unrelatedStarted.resolve();
          return this.unrelated.promise;
        }
        if (new URL(url).pathname !== "/api/trpc/tag.listTags") {
          return Promise.reject(new Error(`Unscripted initial-read request: ${url}`));
        }
        this.readCount += 1;
        if (this.readCount === 1) {
          this.requestStarted.resolve();
          // The remote response can finish after the client has canceled its read.
          return this.initial.promise;
        }
        return Promise.resolve(Response.json([{ result: { data: this.after } }]));
      }),
    );
  }

  release(): void {
    this.initial.resolve(Response.json([{ result: { data: this.before } }]));
  }

  refuse(): void {
    this.initial.resolve(Response.json([{ error: { message: "Initial read refused", code: -32_600, data: { code: "BAD_REQUEST", httpStatus: 400 } } }]));
  }

  reads(): number {
    return this.readCount;
  }

  [Symbol.dispose](): void {
    this.release();
    this.unrelated.resolve(Response.json([{ result: { data: this.unrelatedRows } }]));
    this.runtime.queryClient.clear();
    vi.unstubAllGlobals();
  }
}

test("an event burst across hook facades reconciles an active initial read exactly once without staling unrelated reads", async () => {
  using context = new InitialRead();
  const { queryClient } = context.runtime;
  const observer = new QueryObserver(queryClient, context.options);
  const unsubscribe = observer.subscribe(() => undefined);
  try {
    const initial = queryClient.query(context.options);
    await context.started;
    const unrelatedOptions = context.runtime.trpcProxy.persona.list.queryOptions();
    const unrelatedRead = queryClient.query(unrelatedOptions);
    await context.unrelatedStarted.promise;
    context.invalidation.invalidateUser({ type: "tagsChanged" });
    context.otherFacade.invalidateUser({ type: "tagsChanged" });
    context.release();
    context.unrelated.resolve(Response.json([{ result: { data: context.unrelatedRows } }]));
    await initial;
    expect(queryClient.getQueryState(context.options.queryKey)?.fetchStatus).toBe("fetching");
    await queryClient.query(context.options);
    await unrelatedRead;
    expect(queryClient.getQueryState(unrelatedOptions.queryKey)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryData(unrelatedOptions.queryKey)).toEqual(context.unrelatedRows);
    expect(queryClient.getQueryData(context.options.queryKey)).toEqual(context.after);
    expect(context.reads()).toBe(2);
    expect(queryClient.getQueryState(context.options.queryKey)?.isInvalidated).toBe(false);
  } finally {
    unsubscribe();
  }
});

for (const notified of [false, true]) {
  test(`an inactive initial read ${notified ? "retains notification debt until mount" : "without an event remains fresh on mount"}`, async () => {
    using context = new InitialRead();
    const { queryClient } = context.runtime;
    const initial = queryClient.query(context.options);
    await context.started;
    if (notified) {
      context.invalidation.invalidateUser({ type: "tagsChanged" });
    }
    context.release();
    await initial;
    expect(queryClient.getQueryData(context.options.queryKey)).toEqual(context.before);
    expect(queryClient.getQueryState(context.options.queryKey)?.isInvalidated).toBe(notified);
    expect(queryClient.getQueryState(context.options.queryKey)?.fetchStatus).toBe("idle");
    const observer = new QueryObserver(queryClient, context.options);
    const unsubscribe = observer.subscribe(() => undefined);
    try {
      expect(queryClient.getQueryState(context.options.queryKey)?.fetchStatus).toBe(notified ? "fetching" : "idle");
      await queryClient.query(context.options);
      expect(queryClient.getQueryData(context.options.queryKey)).toEqual(notified ? context.after : context.before);
      expect(context.reads()).toBe(notified ? 2 : 1);
    } finally {
      unsubscribe();
    }
  });
}

test("mark-only debt survives initial settlement and a later active event reconciles it", async () => {
  using context = new InitialRead();
  const { queryClient } = context.runtime;
  const observer = new QueryObserver(queryClient, context.options);
  const unsubscribe = observer.subscribe(() => undefined);
  try {
    const initial = queryClient.query(context.options);
    await context.started;
    context.invalidation.invalidateFilters([{ queryKey: context.options.queryKey, refetchType: "none" }]);
    context.release();
    await initial;
    expect(queryClient.getQueryState(context.options.queryKey)).toMatchObject({ isInvalidated: true, fetchStatus: "idle" });
    expect(context.reads()).toBe(1);
    context.invalidation.invalidateUser({ type: "tagsChanged" });
    await queryClient.query(context.options);
    expect(queryClient.getQueryData(context.options.queryKey)).toEqual(context.after);
    expect(context.reads()).toBe(2);
  } finally {
    unsubscribe();
  }
});

test("active and inactive requests across facades merge into one inactive reconciliation", async () => {
  using context = new InitialRead();
  const { queryClient } = context.runtime;
  const initial = queryClient.query(context.options);
  await context.started;
  context.invalidation.invalidateFilters([{ queryKey: context.options.queryKey, refetchType: "active" }]);
  context.otherFacade.invalidateFilters([{ queryKey: context.options.queryKey, refetchType: "inactive" }]);
  context.release();
  await initial;
  expect(queryClient.getQueryState(context.options.queryKey)?.fetchStatus).toBe("fetching");
  await queryClient.query(context.options);
  expect(queryClient.getQueryData(context.options.queryKey)).toEqual(context.after);
  expect(context.reads()).toBe(2);
});

test("a refused initial read keeps its error instead of starting an invalidation retry", async () => {
  using context = new InitialRead();
  const { queryClient } = context.runtime;
  const initial = queryClient.query(context.options);
  const refused = expect(initial).rejects.toThrow("Initial read refused");
  await context.started;
  context.invalidation.invalidateUser({ type: "tagsChanged" });
  context.refuse();
  await refused;
  expect(queryClient.getQueryState(context.options.queryKey)).toMatchObject({ status: "error", fetchStatus: "idle", data: undefined });
  expect(context.reads()).toBe(1);
});

test("a delete carrier that beats a room's initial read is applied when the read lands", async () => {
  const runtime = createClientRuntime("http://initial-read.test/api/trpc");
  const facades: Invalidation[] = [];
  // biome-ignore lint/correctness/noChildrenProp: The native createElement overload requires the provider's required children prop in its props argument.
  renderToString(createElement(AppDataProviders, { runtime, children: createElement(CaptureInvalidation, { facades }) }));
  const [invalidation] = facades;
  if (invalidation === undefined) {
    throw new Error("The production providers did not expose invalidation");
  }
  const chatId = ids.typeId(ID_PREFIX.chat);
  const kept = makeMessageView({ chatId, seq: 1 });
  const deleted = makeMessageView({ chatId, seq: 2 });
  const page = (messages: readonly MessageView[]): unknown => ({ messages, identities: {}, previousCursor: null, nextCursor: null });
  const initial = Promise.withResolvers<Response>();
  const started = Promise.withResolvers<void>();
  // The follow-up read stays open so the initial read's rows are what the reader sees until it answers.
  const followUp = Promise.withResolvers<Response>();
  let reads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>((input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (new URL(url).pathname !== "/api/trpc/chat.listMessages") {
        return Promise.reject(new Error(`Unscripted initial-read request: ${url}`));
      }
      reads += 1;
      if (reads === 1) {
        started.resolve();
        return initial.promise;
      }
      return followUp.promise;
    }),
  );
  const { queryClient } = runtime;
  const options = runtime.trpcProxy.chat.listMessages.queryOptions({ chatId });
  const observer = new QueryObserver(queryClient, options);
  const shown: (readonly string[])[] = [];
  // A rendered reader subscribes through a batched notification and reads the result when the batch flushes.
  const unsubscribe = observer.subscribe(
    notifyManager.batchCalls(() => {
      const messages = observer.getCurrentResult().data?.messages;
      if (messages !== undefined) {
        shown.push(messages.map((message) => message.id));
      }
    }),
  );
  try {
    await started.promise;
    invalidation.invalidate({ type: "messagesDeleted", chatId, messageIds: [deleted.id] });
    // The server answered the initial read before it applied the delete.
    initial.resolve(Response.json([{ result: { data: page([kept, deleted]) } }]));
    await vi.waitFor(() => {
      expect(reads).toBe(2);
      expect(shown).not.toEqual([]);
    });
    expect(shown).toEqual(shown.map(() => [kept.id]));
    followUp.resolve(Response.json([{ result: { data: page([kept]) } }]));
    await vi.waitFor(() => expect(queryClient.getQueryState(options.queryKey)?.fetchStatus).toBe("idle"));
    expect(shown.filter((messageIds) => messageIds.includes(deleted.id))).toEqual([]);
    expect(queryClient.getQueryData(options.queryKey)?.messages).toEqual([kept]);
  } finally {
    unsubscribe();
    followUp.resolve(Response.json([{ result: { data: page([kept]) } }]));
    queryClient.clear();
    vi.unstubAllGlobals();
  }
});

for (const termination of ["cancel", "remove"] as const) {
  test(`${termination} drops initial-read debt without reviving old bytes or invalidating a replacement`, async () => {
    using context = new InitialRead();
    const { queryClient } = context.runtime;
    const initial = queryClient.query(context.options);
    const canceled = expect(initial).rejects.toThrow("CancelledError");
    await context.started;
    context.invalidation.invalidateUser({ type: "tagsChanged" });
    if (termination === "remove") {
      queryClient.removeQueries({ queryKey: context.options.queryKey, exact: true });
    } else {
      await queryClient.cancelQueries({ queryKey: context.options.queryKey, exact: true });
    }
    const replacement = queryClient.query(context.options);
    context.release();
    await canceled;
    await replacement;
    expect(queryClient.getQueryData(context.options.queryKey)).toEqual(context.after);
    expect(queryClient.getQueryState(context.options.queryKey)).toMatchObject({ isInvalidated: false, fetchStatus: "idle" });
    expect(context.reads()).toBe(2);
  });
}
