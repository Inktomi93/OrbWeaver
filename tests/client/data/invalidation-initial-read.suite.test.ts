// A committed bus event cannot disappear beneath an older initial HTTP response.
import { createInvalidation, createTrpcClient, createTrpcProxy } from "@orb/client/data";
import { __resetBusDupBursts } from "@orb/client/lib";
import type { MessageView } from "@orb/contracts/chat";
import type { AutomationRuleId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { QueryExecuteOptions } from "@tanstack/react-query";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { vi } from "vitest";
import { runAfterViewTransition, withViewTransition } from "../../../packages/client/src/lib/view-transition.ts";
import { expect, test } from "../../support/fixtures.ts";
import { makeMessageView } from "../features/chat/fixtures.ts";

const CHAT_ID = castId<ChatId>("chat_initial_invalidation");
const RULE_ID = castId<AutomationRuleId>("automationrule_initial_invalidation");

interface InitialReadContext {
  readonly queryClient: QueryClient;
  readonly trpc: ReturnType<typeof createTrpcProxy>;
  readonly invalidation: ReturnType<typeof createInvalidation>;
  readonly initial: ReturnType<typeof Promise.withResolvers<never[]>>;
  readonly options: Pick<QueryExecuteOptions<never[]>, "queryKey" | "queryFn">;
  readonly terminal: () => void;
  readonly reads: () => number;
}

function setup(): InitialReadContext {
  __resetBusDupBursts();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY, gcTime: Number.POSITIVE_INFINITY } } });
  const trpc = createTrpcProxy(createTrpcClient("http://localhost/api/trpc"), queryClient);
  const invalidation = createInvalidation({ queryClient, trpc });
  const initial = Promise.withResolvers<never[]>();
  let reads = 0;
  const options = {
    queryKey: trpc.automation.listChatActivity.queryKey({ chatId: CHAT_ID, limit: 30 }),
    queryFn: (): Promise<never[]> => {
      reads += 1;
      return reads === 1 ? initial.promise : Promise.resolve([]);
    },
  };
  const terminal = (): void => invalidation.invalidateAutomation({ type: "ruleFired", chatId: CHAT_ID, ruleId: RULE_ID });
  return { queryClient, trpc, invalidation, initial, options, terminal, reads: (): number => reads };
}

test("a terminal during an active initial read owes exactly one trailing read, even for a burst", async () => {
  const context = setup();
  const observer = new QueryObserver(context.queryClient, context.options);
  const unsubscribe = observer.subscribe(() => undefined);
  try {
    const initialRead = context.queryClient.query(context.options);
    context.terminal();
    context.terminal();
    expect(context.reads()).toBe(1);
    context.initial.resolve([]);
    await initialRead;
    expect(context.reads()).toBe(2);
  } finally {
    unsubscribe();
    context.queryClient.clear();
  }
});

test("a suspended initial read remains stale until its observer mounts; a read with no event stays fresh", async () => {
  for (const committed of [false, true]) {
    const context = setup();
    try {
      const initialRead = context.queryClient.query(context.options);
      if (committed) {
        context.terminal();
      }
      context.initial.resolve([]);
      await initialRead;
      expect(context.queryClient.getQueryState(context.options.queryKey)?.isInvalidated).toBe(committed);
      expect(context.reads()).toBe(1);
      const observer = new QueryObserver(context.queryClient, context.options);
      const unsubscribe = observer.subscribe(() => undefined);
      try {
        expect(context.reads()).toBe(committed ? 2 : 1);
      } finally {
        unsubscribe();
      }
    } finally {
      context.queryClient.clear();
    }
  }
});

test("a failed initial read keeps its error without an invalidation retry loop", async () => {
  const context = setup();
  try {
    const read = context.queryClient.query(context.options);
    const rejected = expect(read).rejects.toThrow("initial read failed");
    context.terminal();
    context.initial.reject(new Error("initial read failed"));
    await rejected;
    expect(context.reads()).toBe(1);
    expect(context.queryClient.getQueryState(context.options.queryKey)?.status).toBe("error");
  } finally {
    context.queryClient.clear();
  }
});

test("removing an initial query cancels its obligation instead of invalidating a replacement with the same key", async () => {
  const context = setup();
  try {
    const read = context.queryClient.query(context.options);
    const canceled = expect(read).rejects.toThrow();
    context.terminal();
    context.queryClient.removeQueries({ queryKey: context.options.queryKey, exact: true });
    context.queryClient.setQueryData(context.options.queryKey, []);
    context.initial.resolve([]);
    await canceled;
    expect(context.queryClient.getQueryState(context.options.queryKey)?.isInvalidated).toBe(false);
    expect(context.reads()).toBe(1);
  } finally {
    context.queryClient.clear();
  }
});

test("mark-only invalidations survive initial settlement without fetching, and a later active request is not lost", async () => {
  const context = setup();
  const observer = new QueryObserver(context.queryClient, context.options);
  const unsubscribe = observer.subscribe(() => undefined);
  try {
    const read = context.queryClient.query(context.options);
    context.invalidation.invalidateFilters([{ queryKey: context.options.queryKey, refetchType: "none" }]);
    context.initial.resolve([]);
    await read;
    expect(context.reads()).toBe(1);
    expect(context.queryClient.getQueryState(context.options.queryKey)?.isInvalidated).toBe(true);
    context.terminal();
    expect(context.reads()).toBe(2);
  } finally {
    unsubscribe();
    context.queryClient.clear();
  }
});

test("initial-read refresh targets retain native active, inactive, all and merged requests", async () => {
  for (const { targets, observed } of [
    { targets: ["none", "active"], observed: true },
    { targets: ["inactive"], observed: false },
    { targets: ["active", "inactive"], observed: false },
    { targets: ["all"], observed: false },
  ] as const) {
    const context = setup();
    const observer = new QueryObserver(context.queryClient, context.options);
    const unsubscribe = observed ? observer.subscribe(() => undefined) : (): void => undefined;
    try {
      const read = context.queryClient.query(context.options);
      for (const refetchType of targets) {
        context.invalidation.invalidateFilters([{ queryKey: context.options.queryKey, refetchType }]);
      }
      context.initial.resolve([]);
      await read;
      expect(context.reads(), targets.join(",")).toBe(2);
    } finally {
      unsubscribe();
      context.queryClient.clear();
    }
  }
});

test("canceling an initial read drops the obligation without reviving its old response", async () => {
  const context = setup();
  try {
    const read = context.queryClient.query(context.options);
    const canceled = expect(read).rejects.toThrow();
    context.terminal();
    await context.queryClient.cancelQueries({ queryKey: context.options.queryKey, exact: true });
    context.queryClient.setQueryData(context.options.queryKey, []);
    context.initial.resolve([]);
    await canceled;
    expect(context.queryClient.getQueryState(context.options.queryKey)?.isInvalidated).toBe(false);
    expect(context.reads()).toBe(1);
  } finally {
    context.queryClient.clear();
  }
});

test("a terminal does not carry an unrelated in-flight query into the trailing refresh", async () => {
  const context = setup();
  const otherKey = context.trpc.tag.listTags.queryKey();
  const other = Promise.withResolvers<never[]>();
  try {
    const initial = context.queryClient.query(context.options);
    const unrelated = context.queryClient.query({ queryKey: otherKey, queryFn: () => other.promise });
    context.terminal();
    context.initial.resolve([]);
    other.resolve([]);
    await Promise.all([initial, unrelated]);
    expect(context.queryClient.getQueryState(context.options.queryKey)?.isInvalidated).toBe(true);
    expect(context.queryClient.getQueryState(otherKey)?.isInvalidated).toBe(false);
  } finally {
    context.queryClient.clear();
  }
});

test("an initial canon carrier patches the row without consuming the full-read invalidation", async () => {
  const context = setup();
  const key = context.trpc.chat.listMessages.queryKey({ chatId: CHAT_ID });
  const initial = Promise.withResolvers<{ messages: MessageView[]; identities: never[] }>();
  const view = makeMessageView({ chatId: CHAT_ID, content: "committed view" });
  try {
    const read = context.queryClient.query({ queryKey: [...key], queryFn: () => initial.promise });
    context.invalidation.invalidate({ type: "messageCommitted", chatId: CHAT_ID, messageId: view.id, view });
    initial.resolve({ messages: [makeMessageView({ id: view.id, chatId: CHAT_ID, content: "old response" })], identities: [] });
    await read;
    expect(context.queryClient.getQueryData<{ messages: MessageView[] }>(key)?.messages[0]?.content).toBe("committed view");
    expect(context.queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  } finally {
    context.queryClient.clear();
  }
});

test("two seam instances share one trailing refresh after native transition settlement and cannot hit a replacement", async () => {
  for (const replaced of [false, true]) {
    const context = setup();
    const observer = new QueryObserver(context.queryClient, context.options);
    const unsubscribe = observer.subscribe(() => undefined);
    const transition = Promise.withResolvers<void>();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("document", {
      querySelector: () => null,
      startViewTransition: (update: () => void) => {
        update();
        return { ready: Promise.resolve(), finished: transition.promise, updateCallbackDone: Promise.resolve() };
      },
    });
    try {
      const initialRead = context.queryClient.query(context.options);
      context.terminal();
      const other = createInvalidation({ queryClient: context.queryClient, trpc: context.trpc });
      other.invalidateAutomation({ type: "ruleFired", chatId: CHAT_ID, ruleId: RULE_ID });
      withViewTransition(() => undefined);
      context.initial.resolve([]);
      await initialRead;
      expect(context.reads()).toBe(1);
      if (replaced) {
        context.queryClient.removeQueries({ queryKey: context.options.queryKey, exact: true });
        context.queryClient.setQueryData(context.options.queryKey, []);
      }
      const flushed = Promise.withResolvers<void>();
      runAfterViewTransition(() => flushed.resolve());
      transition.resolve();
      await flushed.promise;
      expect(context.reads()).toBe(replaced ? 1 : 2);
      if (!replaced) {
        await context.queryClient.query(context.options);
      }
      expect(context.queryClient.getQueryState(context.options.queryKey)?.isInvalidated).toBe(false);
    } finally {
      transition.resolve();
      await transition.promise;
      vi.unstubAllGlobals();
      unsubscribe();
      context.queryClient.clear();
    }
  }
});
