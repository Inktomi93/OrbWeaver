// A Stop that lands after the reply finished streaming but before its save keeps the whole reply under the
// provider's own finish and measured spend; a lease lost at the same point keeps nothing.
// @subject packages/server/src/domain/chat/engine/engine.ts

import type { ChatBusEvent, TokenProvenance, TurnAbortReason } from "@orb/contracts/chat";
import type { NormalizedFinishReason } from "@orb/contracts/inference";
import { chatLocks, messages } from "@orb/db";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot, HeldStatement } from "@orb/testkit/node/composed";
import { freshHeldDb, readRoomCanon } from "@orb/testkit/node/composed";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import { eq } from "drizzle-orm";
import { coreFrame, coreHttpRoom, coreSse } from "../engine/core-physical.ts";

const FULL = "The whole reply arrived before the Stop.";
const USER_STOP = "user" satisfies TurnAbortReason;
const STALE = "stale" satisfies TurnAbortReason;
// The finish the terminal frame reports by default, and the provenance of usage the provider measured.
const PROVIDER_STOP = "stop" satisfies NormalizedFinishReason;
const MEASURED = "measured" satisfies TokenProvenance;

function finishedReply(): Response {
  return coreSse([
    coreFrame({ choices: [{ delta: { reasoning: "Weigh the door." } }] }),
    coreFrame({ choices: [{ delta: { content: FULL } }] }),
    terminalSseLine({ usage: { promptTokens: 4, completionTokens: 2 } }),
  ]);
}

/**
 * Send, and park the turn's first durable event after its last text delta reached the bus. That event is
 * written after the stream finished and before the save, so whatever `atStop` does lands in that window.
 */
async function sendHeldAfterStream(
  h: ChatRoot,
  hold: (pattern: RegExp, arrivals?: number) => HeldStatement,
  atStop: () => Promise<void>,
): Promise<{ readonly running: ReturnType<ChatRoot["root"]["services"]["chat"]["send"]>; readonly events: readonly ChatBusEvent[] }> {
  const events: ChatBusEvent[] = [];
  const parked = Promise.withResolvers<HeldStatement>();
  using subscription = new DisposableStack();
  subscription.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId !== h.chatId) {
        return;
      }
      events.push(event);
      if (event.type === "delta" && event.delta.kind === "text" && event.delta.text.includes(FULL)) {
        parked.resolve(hold(/^insert into "chat_events"/u, 1));
      }
    }),
  );
  const running = h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Tell me what you see." });
  const settled = Promise.allSettled([running]);
  const gate = await Promise.race([
    parked.promise,
    running.then((): never => {
      throw new Error("the turn settled before its last text delta reached the bus");
    }),
  ]);
  try {
    await gate.reached;
    await atStop();
  } finally {
    gate.release();
  }
  await settled;
  return { running, events };
}

test("a Stop after the stream finished but before the save keeps the whole reply under its own finish and spend", async () => {
  using held = await freshHeldDb();
  await using h = await coreHttpRoom([finishedReply], { server: { db: held.db } });
  const { running, events } = await sendHeldAfterStream(h, held.hold, async () => {
    await h.root.services.chat.abort({ principal: h.owner, chatId: h.chatId });
  });
  const outcome = await running;
  await h.root.settleBackground();
  expect(outcome).toMatchObject({ aborted: true, abortReason: USER_STOP });
  expect(outcome.messages.map(({ role, content }) => [role, content])).toEqual([
    ["user", "Tell me what you see."],
    ["assistant", FULL],
  ]);
  const kept = present((await readRoomCanon(h.root, h.owner, h.chatId)).at(-1));
  // The provider finished this text, so it stores as finished, with the measured usage rather than an estimate.
  expect(kept).toMatchObject({
    role: "assistant",
    content: FULL,
    reasoning: "Weigh the door.",
    finishReason: PROVIDER_STOP,
    tokensIn: 4,
    tokensOut: 2,
    tokenProvenance: MEASURED,
  });
  expect(kept.terminalReason).not.toBe(USER_STOP);
  const types = events.map(({ type }) => type);
  expect(types).not.toContain("turnCompleted");
  expect(types.indexOf("messageCommitted")).toBeLessThan(types.indexOf("turnAborted"));
  expect(events.filter((event) => event.type === "turnAborted")).toMatchObject([{ reason: USER_STOP }]);
});

test("a lease lost after the stream finished but before the save keeps nothing: the stale abort is unchanged", async () => {
  using held = await freshHeldDb();
  await using h = await coreHttpRoom([finishedReply], { server: { db: held.db } });
  const { running, events } = await sendHeldAfterStream(h, held.hold, async () => {
    // Another replica took the room's lease while this turn was between its stream and its save.
    const stolen = await h.root.db.update(chatLocks).set({ holder: "controlled-replacement-replica" }).where(eq(chatLocks.chatId, h.chatId)).returning();
    expect(stolen).toHaveLength(1);
  });
  expect(await running).toMatchObject({ aborted: true, abortReason: STALE });
  await h.root.settleBackground();
  expect((await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId))).map(({ role }) => role)).toEqual(["user"]);
  expect(events.filter((event) => event.type === "turnAborted")).toMatchObject([{ reason: STALE }]);
  expect(events.filter((event) => event.type === "messageCommitted").map((event) => event.view?.role)).toEqual(["user"]);
});
