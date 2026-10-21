// @subject packages/server/src/domain/chat/verbs/chat-lifecycle.ts
// @subject packages/server/src/domain/chat/bus.ts
import "@orb/testkit/node/composed-real.ts";
import process from "node:process";
import { setImmediate as physicalTurn } from "node:timers/promises";
import type { ChatBusEvent } from "@orb/contracts/chat";
import { chatEvents, chats, closeDb, messages, messageVariants } from "@orb/db";
import { freshHeldDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { coreFrame, coreHttpRoom } from "../engine/core-physical.ts";

test("deleting an actually streaming room aborts its source and totals the already queued post-delete delta without orphan canon or unhandled rejection", async () => {
  await using lifetime = new AsyncDisposableStack();
  const held = await freshHeldDb();
  lifetime.defer(() => closeDb(held.db));
  const source = Promise.withResolvers<readonly [ReadableStreamDefaultController<Uint8Array>, AbortSignal]>();
  const firstDelta = Promise.withResolvers<void>();
  const stopped = Promise.withResolvers<void>();
  const deletedFan = Promise.withResolvers<boolean>();
  const observedFan = deletedFan.promise.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  const encoder = new TextEncoder();
  let closing = false;
  let ended = false;
  let finishSource: (() => void) | undefined;
  let detachAbort: (() => void) | undefined;
  const h = lifetime.use(
    await coreHttpRoom(
      [
        (request): Response => {
          if (closing) {
            throw new DOMException("the owned physical supplier is closed", "AbortError");
          }
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                const abort = (): void => {
                  stopped.resolve();
                  if (!ended) {
                    ended = true;
                    controller.error(request.signal.reason);
                  }
                };
                request.signal.addEventListener("abort", abort, { once: true });
                detachAbort = () => request.signal.removeEventListener("abort", abort);
                finishSource = () => {
                  if (!ended) {
                    ended = true;
                    controller.close();
                  }
                };
                source.resolve([controller, request.signal]);
                controller.enqueue(encoder.encode(`${coreFrame({ choices: [{ delta: { content: "hel" } }] })}\n\n`));
              },
              cancel() {
                ended = true;
              },
            }),
            { headers: { "content-type": "text/event-stream" } },
          );
        },
      ],
      { server: { db: held.db } },
    ),
  );
  const events: ChatBusEvent[] = [];
  using subscriptions = new DisposableStack();
  subscriptions.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId !== h.chatId) {
        return;
      }
      events.push(event);
      if (event.type === "delta" && event.delta.kind === "text" && event.delta.text === "hel") {
        firstDelta.resolve();
      }
      if (event.type === "chatDeleted") {
        void h.root.db
          .select()
          .from(chats)
          .where(eq(chats.id, h.chatId))
          .get()
          .then((row) => deletedFan.resolve(row === undefined), deletedFan.reject);
      }
    }),
  );
  const unhandled = vi.fn();
  process.on("unhandledRejection", unhandled);
  subscriptions.defer(() => process.off("unhandledRejection", unhandled));
  const sending = h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "A room deleted while the reply streams." });
  const settled = Promise.allSettled([sending]);
  let gate: ReturnType<typeof held.hold> | undefined;
  const failures: unknown[] = [];
  try {
    await Promise.race([
      firstDelta.promise,
      sending.then(() => {
        throw new Error("the actual turn ended before delivering its first delta");
      }),
    ]);
    const [controller, signal] = await source.promise;
    expect(signal.aborted).toBe(false);
    expect(events.filter((event) => event.type === "delta").map((event) => event.delta)).toEqual([{ chatId: h.chatId, kind: "text", text: "hel" }]);
    gate = held.hold(/insert into "chat_events"/u);
    controller.enqueue(encoder.encode(`${coreFrame({ choices: [{ delta: { content: "lo" } }] })}\n\n`));
    await Promise.race([
      gate.reached,
      sending.then(() => {
        throw new Error("the native second delta never reached the actual durable writer");
      }),
    ]);
    gate.disarm();
    await h.root.services.chat.delete({ principal: h.owner, chatId: h.chatId });
    expect(signal.aborted).toBe(true);
    await stopped.promise;
    expect(events.filter(({ type }) => type === "chatDeleted")).toEqual([{ type: "chatDeleted", chatId: h.chatId }]);
    expect(await observedFan).toEqual({ value: true });
    expect(await h.root.db.select().from(chats).where(eq(chats.id, h.chatId))).toEqual([]);
    gate.release();
    expect(await sending).toMatchObject({ aborted: true });
    await h.root.settleBackground();
    await physicalTurn();
    expect(unhandled.mock.calls).toEqual([]);
    expect(events.filter(({ type }) => type === "chatDeleted")).toEqual([{ type: "chatDeleted", chatId: h.chatId }]);
    expect(events.filter((event) => event.type === "delta").map((event) => event.delta.text)).toEqual(["hel"]);
    expect(await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId))).toEqual([]);
    expect(await h.root.db.select().from(messageVariants)).toEqual([]);
    expect(await h.root.db.select().from(chatEvents).where(eq(chatEvents.chatId, h.chatId))).toEqual([]);
    expect(h.requests.filter(({ method }) => method === "POST")).toHaveLength(1);
  } catch (error) {
    failures.push(error);
  } finally {
    closing = true;
    try {
      gate?.release();
    } catch (error) {
      failures.push(error);
    }
    try {
      finishSource?.();
    } catch (error) {
      failures.push(error);
    }
    const results = await settled;
    detachAbort?.();
    for (const result of results) {
      if (result.status === "rejected" && !failures.includes(result.reason)) {
        failures.push(result.reason);
      }
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "the physical delete race or its owned cleanup failed");
  }
});
