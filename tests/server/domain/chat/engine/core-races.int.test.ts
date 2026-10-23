// @subject packages/server/src/domain/chat/engine/engine.ts
// Physical admission and SQLite boundaries distinguish heartbeat loss, commit fencing and genuine seq retry.
import type { ChatBusEvent } from "@orb/contracts/chat";
import { chatLocks, closeDb, messages, messageVariants, ownerStats } from "@orb/db";
import { freshHeldDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { terminalSseLine } from "@orb/testkit/node/provider-stream.ts";
import { eq } from "drizzle-orm";
import { coreFrame, coreHeldReply, coreHttpRoom, coreSse } from "./core-physical.ts";

test.for([
  { label: "intact", stolen: false },
  { label: "stolen before a heartbeat", stolen: true },
] as const)("a real $label lease reaches the pre-write authority fence with a live signal", async (row) => {
  const physical = coreHeldReply();
  await using h = await coreHttpRoom([physical.respond]);
  const character = h.characters[0];
  if (character === undefined) {
    throw new Error("the actual commit-fence room has no voice");
  }
  const now = h.root.clock.now();
  const running = h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: character.id });
  const settled = Promise.allSettled([running]);
  try {
    const signal = await Promise.race([
      physical.reached,
      running.then(() => {
        throw new Error("the real fence case settled before HTTP admission");
      }),
    ]);
    const lease = await h.root.db.select().from(chatLocks).where(eq(chatLocks.chatId, h.chatId)).get();
    if (lease === undefined) {
      throw new Error("the actual commit-fence turn owns no real lease");
    }
    const replacement = { ...lease, holder: "controlled-fence-replacement" };
    if (row.stolen) {
      await h.root.db.update(chatLocks).set(replacement).where(eq(chatLocks.chatId, h.chatId));
    }
    physical.release();
    const [result] = await settled;
    expect(result).toMatchObject(
      row.stolen
        ? { status: "fulfilled", value: { aborted: true, abortReason: "stale", messages: [] } }
        : { status: "fulfilled", value: { aborted: false, messages: [{ content: "The held reply finishes." }] } },
    );
    expect(signal.aborted).toBe(false);
    expect(h.root.clock.now()).toBe(now);
    expect(
      await h.root.db
        .select({ content: messageVariants.content })
        .from(messages)
        .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
        .where(eq(messages.chatId, h.chatId)),
    ).toEqual(row.stolen ? [] : [{ content: "The held reply finishes." }]);
    expect(await h.root.db.select().from(chatLocks).where(eq(chatLocks.chatId, h.chatId))).toEqual(row.stolen ? [replacement] : []);
  } finally {
    physical.release();
    await settled;
  }
});

test("an actual competing public canon write forces one SQLite seq retry without a second paid generation", async () => {
  const held = await freshHeldDb();
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => closeDb(held.db));
  let sends = 0;
  const h = ownership.use(
    await coreHttpRoom(
      [
        (): Response => {
          sends += 1;
          return coreSse([
            coreFrame({ choices: [{ delta: { content: "A raced paid reply." } }] }),
            terminalSseLine({ usage: { promptTokens: 4, completionTokens: 2 } }),
          ]);
        },
      ],
      { server: { db: held.db } },
    ),
  );
  const events: ChatBusEvent[] = [];
  ownership.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId === h.chatId) {
        events.push(event);
      }
    }),
  );
  const boundary = held.hold(/^insert into "messages"/u);
  const running = h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });
  const settled = Promise.allSettled([running]);
  try {
    await Promise.race([
      boundary.reached,
      running.then(() => {
        throw new Error("the real seq race settled before its first SQLite write");
      }),
    ]);
    boundary.disarm();
    const raced = await h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "A real competing user row." });
    expect(raced.aborted).toBe(false);
    expect(raced.messages).toMatchObject([{ role: "user", seq: 1, content: "A real competing user row." }]);
    boundary.release();
    const outcome = await running;
    expect(outcome.aborted).toBe(false);
    expect(outcome.messages).toMatchObject([{ role: "assistant", seq: 2, content: "A raced paid reply." }]);
    expect(
      await h.root.db
        .select({ seq: messages.seq, role: messages.role, content: messageVariants.content })
        .from(messages)
        .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
        .where(eq(messages.chatId, h.chatId))
        .orderBy(messages.seq),
    ).toEqual([
      { seq: 1, role: "user", content: "A real competing user row." },
      { seq: 2, role: "assistant", content: "A raced paid reply." },
    ]);
    expect(sends).toBe(1);
    expect(await h.root.db.select().from(ownerStats).where(eq(ownerStats.ownerId, h.owner.userId)).get()).toMatchObject({
      assistantTurns: 1,
      userTurns: 1,
      tokensIn: 4,
      tokensOut: 2,
    });
    expect(events.filter((event) => event.type === "turnAborted")).toEqual([]);
  } finally {
    boundary.release();
    await settled;
  }
});

test("a physical provider error named AbortError remains a fault when the actual turn signal is live", async () => {
  let observed: AbortSignal | undefined;
  await using h = await coreHttpRoom([
    (request): Response => {
      observed = request.signal;
      const failure = new Error("controlled provider fault named AbortError");
      failure.name = "AbortError";
      throw failure;
    },
  ]);
  const character = h.characters[0];
  if (character === undefined) {
    throw new Error("the actual provider-fault room has no voice");
  }
  const pending = h.root.timers.pending();
  const events: ChatBusEvent[] = [];
  using subscription = new DisposableStack();
  subscription.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId === h.chatId) {
        events.push(event);
      }
    }),
  );
  const [result] = await Promise.allSettled([h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: character.id })]);
  expect(result.status).toBe("rejected");
  if (observed === undefined) {
    throw new Error("the native provider boundary was never reached");
  }
  expect(observed.aborted).toBe(false);
  expect(events.filter((event) => event.type === "turnAborted")).toMatchObject([{ reason: "error" }]);
  expect(events.map((event) => event.type)).not.toContain("turnCompleted");
  expect(await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId))).toEqual([]);
  expect(await h.root.db.select().from(chatLocks).where(eq(chatLocks.chatId, h.chatId))).toEqual([]);
  expect(h.root.timers.pending()).toBe(pending);
});
