// @subject packages/server/src/domain/chat/engine/engine.ts
// Stop after a real partial native response; an unfinished swipe must never replace the selected prose.
import "@orb/testkit/node/composed-real.ts";
import type { ChatBusEvent } from "@orb/contracts/chat";
import { messages, messageVariants } from "@orb/db";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { terminalSseLine } from "@orb/testkit/node/provider-stream.ts";
import { eq } from "drizzle-orm";
import { coreFrame, coreHttpRoom, coreSse } from "./core-physical.ts";

const PARTIAL = "The new reply is not finished";

test("a public swipe stopped after actual partial tokens retains its prior selected variant byte-for-byte", async () => {
  const physicalCloses = new Set<Promise<void>>();
  await using h = await coreHttpRoom([
    (): Response =>
      coreSse([
        coreFrame({ choices: [{ delta: { content: "The selected prior prose." } }] }),
        terminalSseLine({ usage: { promptTokens: 4, completionTokens: 2 } }),
      ]),
    (request): Response => {
      const closed = Promise.withResolvers<void>();
      physicalCloses.add(closed.promise);
      let sent = false;
      return new Response(
        new ReadableStream<Uint8Array>(
          {
            async pull(controller): Promise<void> {
              if (!sent) {
                sent = true;
                controller.enqueue(new TextEncoder().encode(`${coreFrame({ choices: [{ delta: { content: PARTIAL } }] })}\n\n`));
                return;
              }
              const interrupted = Promise.withResolvers<never>();
              const abort = (): void => interrupted.reject(request.signal.reason);
              try {
                request.signal.throwIfAborted();
                request.signal.addEventListener("abort", abort, { once: true });
                await interrupted.promise;
              } finally {
                request.signal.removeEventListener("abort", abort);
                closed.resolve();
              }
            },
            cancel(): void {
              closed.resolve();
            },
          },
          { highWaterMark: 0 },
        ),
        { headers: { "content-type": "text/event-stream" } },
      );
    },
  ]);
  const target = (await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId })).messages[0];
  if (target === undefined) {
    throw new Error("the actual cancelled swipe has no selected target");
  }
  const before = await h.root.db.select().from(messageVariants).where(eq(messageVariants.messageId, target.id)).orderBy(messageVariants.idx);
  const canonBefore = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId));
  const events: ChatBusEvent[] = [];
  const partial = Promise.withResolvers<void>();
  using subscription = new DisposableStack();
  subscription.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId !== h.chatId) {
        return;
      }
      events.push(event);
      if (event.type === "delta" && event.delta.kind === "text" && event.delta.text === PARTIAL) {
        partial.resolve();
      }
    }),
  );
  const running = h.root.services.chat.swipe({ principal: h.owner, chatId: h.chatId, messageId: target.id });
  const settled = Promise.allSettled([running]);
  try {
    await Promise.race([
      partial.promise,
      running.then(() => {
        throw new Error("the real swipe settled before its partial token observation");
      }),
    ]);
    await h.root.services.chat.abort({ principal: h.owner, chatId: h.chatId });
    expect(await running).toMatchObject({ aborted: true, abortReason: "user", messages: [] });
    await Promise.all(physicalCloses);
    expect(physicalCloses.size).toBe(1);
    expect(await h.root.db.select().from(messageVariants).where(eq(messageVariants.messageId, target.id)).orderBy(messageVariants.idx)).toEqual(before);
    expect(await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId))).toEqual(canonBefore);
    expect(events.filter((event) => event.type === "turnAborted")).toMatchObject([{ reason: "user" }]);
    expect(events.map((event) => event.type)).not.toContain("messageCommitted");
    expect(events.map((event) => event.type)).not.toContain("turnCompleted");
  } finally {
    await h.root.services.chat.abort({ principal: h.owner, chatId: h.chatId });
    await settled;
    await Promise.all(physicalCloses);
  }
});
