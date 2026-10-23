// @subject packages/server/src/domain/chat/engine/engine.ts
// A real recursive rule must retain its cascade depth when a peer lease refuses the accepted child.
import type { ChatBusEvent } from "@orb/contracts/chat";
import { chatLocks, closeDb, messages, messageVariants } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import type { HeldStatement } from "@orb/testkit/node/composed";
import { freshHeldDb } from "@orb/testkit/node/composed";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import { eq } from "drizzle-orm";
import { enabledRule } from "../../automation/runtime.fixtures.ts";
import { coreFrame, coreHttpRoom, coreSse } from "./core-physical.ts";

const PEER_LEASE_MS = 60_000;

test("a real depth-two automation child refused by a peer lease closes its accepted slot with its own cascade depth", async () => {
  const held = await freshHeldDb();
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => closeDb(held.db));
  let boundary: HeldStatement | undefined;
  const counterReached = Promise.withResolvers<HeldStatement>();
  const h = ownership.use(
    await coreHttpRoom(
      [
        (): Response => {
          boundary = held.hold(/^insert into "global_variables"/u);
          counterReached.resolve(boundary);
          return coreSse([
            coreFrame({ choices: [{ delta: { content: "The first real automated beat commits." } }] }),
            terminalSseLine({ usage: { promptTokens: 4, completionTokens: 2 } }),
          ]);
        },
      ],
      { server: { db: held.db } },
    ),
  );
  await h.root.services.automation.setGlobalVariable({ principal: h.owner, key: "coreRefusalDepth", value: "0" });
  const rule = await enabledRule(h.root, {
    chatId: h.chatId,
    name: "An actual bounded child refusal",
    trigger: { bus: "chat", type: "messageCommitted" },
    matchAutomationEvents: true,
    predicateCel: "int(global.coreRefusalDepth) < 2",
    actions: [{ type: "set_variable", scope: "global", key: "coreRefusalDepth", op: "inc" }, { type: "trigger_turn" }],
  });
  const events: ChatBusEvent[] = [];
  ownership.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId !== h.chatId) {
        return;
      }
      events.push(event);
    }),
  );
  const running = h.root.services.automation.runRuleNow({ principal: h.owner, ruleId: rule.id });
  const finished = running.then(() => h.root.settleBackground());
  const settled = Promise.allSettled([running, finished]);
  const premature = finished.then(() => {
    throw new Error("the actual recursive automation settled before its held child counter write");
  });
  try {
    const gate = await Promise.race([counterReached.promise, premature]);
    await Promise.race([gate.reached, premature]);
    expect(await running).toEqual({ outcome: "fired" });
    gate.disarm();
    const lease = {
      chatId: h.chatId,
      holder: "controlled-recursive-peer",
      acquiredAt: h.root.clock.now(),
      expiresAt: h.root.clock.now() + PEER_LEASE_MS,
    };
    expect(await h.root.db.select().from(chatLocks).where(eq(chatLocks.chatId, h.chatId))).toEqual([]);
    await h.root.db.insert(chatLocks).values(lease);
    gate.release();
    await finished;
    expect(await h.root.services.automation.getGlobalVariable({ principal: h.owner, key: "coreRefusalDepth" })).toBe("2");
    expect(events.filter((event) => event.type === "turnAccepted")).toHaveLength(2);
    expect(events.filter((event) => event.type === "turnStarted")).toHaveLength(1);
    expect(events.filter((event) => event.type === "turnAborted")).toMatchObject([{ reason: "error", intent: "generate", automationDepth: 2 }]);
    expect(events.filter((event) => event.type === "turnCompleted")).toHaveLength(1);
    expect(
      await h.root.db
        .select({ role: messages.role, initiator: messages.initiator, automationDepth: messages.automationDepth, content: messageVariants.content })
        .from(messages)
        .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
        .where(eq(messages.chatId, h.chatId)),
    ).toMatchObject([{ role: "assistant", initiator: "automation", automationDepth: 1, content: "The first real automated beat commits." }]);
    expect(await h.root.db.select().from(chatLocks).where(eq(chatLocks.chatId, h.chatId))).toEqual([lease]);
    expect(h.requests.filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"))).toHaveLength(1);
  } finally {
    boundary?.release();
    await settled;
  }
});
