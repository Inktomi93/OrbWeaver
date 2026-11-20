// A server shutdown that cuts a reply after text streamed keeps that text as the reply, stored as cut by the
// shutdown rather than by the member's Stop, with the cut call's spend estimated.
// @subject packages/server/src/domain/chat/engine/engine.ts
// @subject packages/server/src/domain/chat/active-turns.ts

import type { ChatBusEvent, TurnAbortReason } from "@orb/contracts/chat";
import { messages, messageVariants } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { freshHeldDb } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { coreFrame, coreHttpRoom, corePartialReply } from "../engine/core-physical.ts";

const KEPT = "The lantern gutters as the door";
const SHUTDOWN = "shutdown" satisfies TurnAbortReason;

test("a shutdown after streamed text keeps it as the reply, marked shutdown and never as the member's Stop", async () => {
  using held = await freshHeldDb();
  const partial = corePartialReply([coreFrame({ choices: [{ delta: { content: KEPT } }] })]);
  await using h = await coreHttpRoom([partial.respond], { server: { db: held.db } });
  const events: ChatBusEvent[] = [];
  const seen = Promise.withResolvers<void>();
  using subscription = new DisposableStack();
  subscription.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId !== h.chatId) {
        return;
      }
      events.push(event);
      if (event.type === "delta" && event.delta.kind === "text" && event.delta.text.includes(KEPT)) {
        seen.resolve();
      }
    }),
  );
  const running = h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Tell me what you see." });
  const settled = Promise.allSettled([running]);
  try {
    await Promise.race([
      seen.promise,
      running.then(() => {
        throw new Error("the turn settled before its streamed text reached the bus");
      }),
    ]);
    // The process closing disposes the chat graph, whose active-turns registry aborts the in-flight turn.
    await h[Symbol.asyncDispose]();
    const outcome = await running;
    expect(outcome).toMatchObject({ aborted: true, abortReason: SHUTDOWN });
    expect(outcome.messages.map(({ role, content }) => [role, content])).toEqual([
      ["user", "Tell me what you see."],
      ["assistant", KEPT],
    ]);
  } finally {
    await settled;
  }
  expect((await held.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq)).map(({ role }) => role)).toEqual([
    "user",
    "assistant",
  ]);
  expect(await held.db.select().from(messageVariants).where(eq(messageVariants.content, KEPT))).toMatchObject([
    { content: KEPT, finishReason: null, terminalReason: SHUTDOWN, tokenProvenance: "estimated" },
  ]);
  const types = events.map(({ type }) => type);
  expect(types).not.toContain("turnCompleted");
  expect(types.indexOf("messageCommitted")).toBeLessThan(types.indexOf("turnAborted"));
  expect(events.filter((event) => event.type === "turnAborted")).toMatchObject([{ reason: SHUTDOWN }]);
});
