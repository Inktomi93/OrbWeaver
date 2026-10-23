// @subject packages/server/src/domain/chat/engine/engine.ts
// Hold or refuse actual durable delta writes; production still owns its drain and total publisher.
import { setImmediate as physicalTurn } from "node:timers/promises";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { LogLevel } from "@orb/contracts/settings";
import { chatEvents, chatLocks, closeDb, messages, messageVariants } from "@orb/db";
import { ProviderError } from "@orb/inference";
import { logRing } from "@orb/server/foundation/observability";
import { expect, test } from "@orb/testkit/node";
import type { HeldStatement } from "@orb/testkit/node/composed";
import { freshHeldDb } from "@orb/testkit/node/composed";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import { eq, sql } from "drizzle-orm";
import { coreFrame, coreHttpRoom, coreSse } from "./core-physical.ts";

const CORE_LOG_LEVEL = "warn" satisfies LogLevel;
const PARTIAL = "The partial physical reply.";

test.for([
  { label: "success", failed: false },
  { label: "provider failure", failed: true },
] as const)("native $label cannot settle before its real durable delta finishes", async (row) => {
  const held = await freshHeldDb();
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => closeDb(held.db));
  let gate: HeldStatement | undefined;
  const providerDone = Promise.withResolvers<void>();
  const h = ownership.use(
    await coreHttpRoom(
      [
        (): Response => {
          const boundary = held.hold(/^insert into "chat_events"/u);
          gate = boundary;
          let next = 0;
          return new Response(
            new ReadableStream<Uint8Array>(
              {
                async pull(controller): Promise<void> {
                  if (next++ === 0) {
                    controller.enqueue(new TextEncoder().encode(`${coreFrame({ choices: [{ delta: { content: PARTIAL } }] })}\n\n`));
                    return;
                  }
                  await boundary.reached;
                  providerDone.resolve();
                  if (row.failed) {
                    controller.error(new Error("controlled physical stream refusal"));
                  } else {
                    controller.enqueue(new TextEncoder().encode(`${terminalSseLine({ usage: { promptTokens: 4, completionTokens: 2 } })}\n\ndata: [DONE]\n\n`));
                    controller.close();
                  }
                },
              },
              { highWaterMark: 0 },
            ),
            { headers: { "content-type": "text/event-stream" } },
          );
        },
      ],
      { server: { db: held.db, logLevel: CORE_LOG_LEVEL } },
    ),
  );
  const character = h.characters[0];
  if (character === undefined) {
    throw new Error("the actual drain room has no seated character");
  }
  const events: ChatBusEvent[] = [];
  ownership.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId === h.chatId) {
        events.push(event);
      }
    }),
  );
  let complete = false;
  const running = h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: character.id }).finally(() => {
    complete = true;
  });
  const settled = Promise.allSettled([running]);
  const premature = running.then(() => {
    throw new Error("the actual drain control settled before its physical provider terminal");
  });
  try {
    await Promise.race([providerDone.promise, premature]);
    for (let turn = 0; turn < 10; turn += 1) {
      await physicalTurn();
    }
    expect(complete).toBe(false);
    expect(events.map((event) => event.type)).not.toContain("turnCompleted");
    expect(events.map((event) => event.type)).not.toContain("turnAborted");
    gate?.release();
    const [result] = await settled;
    expect(result).toMatchObject(
      row.failed
        ? {
            status: "rejected",
            reason: expect.objectContaining({
              kind: "unknown",
              retryable: false,
              apiErrorStatus: 200,
              message: expect.stringContaining("Failed to process successful response"),
              cause: expect.objectContaining({ message: "Failed to process successful response" }),
            }),
          }
        : { status: "fulfilled", value: { aborted: false } },
    );
    expect(result.status === "rejected" && result.reason instanceof ProviderError).toBe(row.failed);
    const canon = await h.root.db
      .select({ content: messageVariants.content })
      .from(messages)
      .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
      .where(eq(messages.chatId, h.chatId));
    expect(canon).toEqual(row.failed ? [] : [{ content: PARTIAL }]);
    expect(events.filter((event) => event.type === "turnCompleted" || event.type === "turnAborted")).toMatchObject(
      row.failed ? [{ type: "turnAborted", reason: "error" }] : [{ type: "turnCompleted" }],
    );
    expect(events.flatMap((event) => (event.type === "delta" && event.delta.kind === "text" ? [event.delta.text] : []))).toEqual([PARTIAL]);
    expect(await h.root.db.select().from(chatLocks).where(eq(chatLocks.chatId, h.chatId))).toEqual([]);
  } finally {
    gate?.release();
    await settled;
  }
});

test("the real total publisher reports a dropped durable delta but the paid turn still commits and completes", async () => {
  await using h = await coreHttpRoom(
    [
      (): Response =>
        coreSse([coreFrame({ choices: [{ delta: { content: PARTIAL } }] }), terminalSseLine({ usage: { promptTokens: 4, completionTokens: 2 } })]),
    ],
    { server: { logLevel: CORE_LOG_LEVEL } },
  );
  await h.root.db.run(
    sql`CREATE TEMP TRIGGER refuse_core_delta BEFORE INSERT ON ${chatEvents} WHEN NEW."type" = 'delta' BEGIN SELECT RAISE(ABORT, 'controlled durable delta refusal'); END`,
  );
  const outcome = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toMatchObject([{ role: "assistant", content: PARTIAL }]);
  const persisted = await h.root.db.select().from(chatEvents).where(eq(chatEvents.chatId, h.chatId));
  expect(persisted.filter((event) => event.type === "delta")).toEqual([]);
  expect(persisted.filter((event) => event.type === "turnCompleted")).toHaveLength(1);
  expect(persisted.filter((event) => event.type === "turnAborted")).toEqual([]);
  const logs = logRing.recent(100).filter((line) => line.includes(h.chatId));
  expect(logs.some((line) => line.includes("durable append failed on a live chat — retrying"))).toBe(true);
  expect(logs.some((line) => line.includes("event dropped, its replay slot is permanently missing"))).toBe(true);
});
