// @subject packages/server/src/domain/automation/substrate/run-now.ts
// @subject packages/server/src/domain/automation/service.ts
import { setImmediate as physicalTurn } from "node:timers/promises";
import { ruleRefusalReason } from "@orb/contracts/automation";
import type { ChatBusEvent } from "@orb/contracts/chat";
import { automationFires, chats, closeDb } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  freshHeldDb,
  seedCorpusConnections,
  seedRecallRoom,
} from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { enabledRule } from "../runtime.fixtures.ts";

test("a transform-only rule produces no manual fire and reports the public transform_not_runnable refusal", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const { chat } = await root.services.chat.startChat({ principal, characterIds: [], opening: "none" });
  const rule = await enabledRule(root, {
    chatId: chat.id,
    name: "Draft pipeline only",
    trigger: { bus: "chat", type: "turnStarted" },
    actions: [{ type: "transform_draft", target: "user_input", template: "x" }],
  });
  await expect(root.services.automation.runRuleNow({ principal, ruleId: rule.id })).rejects.toMatchObject({
    code: ruleRefusalReason("transform_not_runnable"),
  });
  expect(await root.services.automation.listFires({ principal, ruleId: rule.id })).toEqual([]);
});

test("a manual variable rule runs at depth zero against a synthesized fact and performs its real effect", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const { chat } = await root.services.chat.startChat({ principal, characterIds: [], opening: "none" });
  const rule = await enabledRule(root, {
    chatId: chat.id,
    name: "Manual synthesized fact",
    trigger: { bus: "chat", type: "messageCommitted" },
    predicateCel: "has(event.message)",
    actions: [{ type: "set_variable", scope: "chat", key: "mood", op: "set", value: "grim" }],
  });
  expect(await root.services.automation.runRuleNow({ principal, ruleId: rule.id })).toEqual({ outcome: "fired" });
  expect(await root.services.chat.getRuntimeVariables({ principal, chatId: chat.id })).toMatchObject({ mood: "grim" });
  const fires = await root.services.automation.listFires({ principal, ruleId: rule.id });
  expect(fires).toHaveLength(1);
  expect(fires[0]).toMatchObject({ outcome: "fired" });
  expect(fires[0]).not.toHaveProperty("automationDepth");
  expect(await root.db.select().from(automationFires).where(eq(automationFires.ruleId, rule.id)).get()).toMatchObject({ automationDepth: 0 });
});

test("a manual run raised while the bus dispatch holds a real variable write queues on the same owned lane", async () => {
  const held = await freshHeldDb();
  await using database = new AsyncDisposableStack();
  database.defer(() => closeDb(held.db));
  await using root = await createServerHarness({ db: held.db });
  const principal = await root.principalFor(root.ownerId);
  const { chat } = await root.services.chat.startChat({ principal, characterIds: [], opening: "none" });
  const rule = await enabledRule(root, {
    chatId: chat.id,
    name: "One lane for both entries",
    trigger: { bus: "chat", type: "chatOpened" },
    actions: [{ type: "set_variable", scope: "global", key: "beats", op: "inc" }],
  });
  const gate = held.hold(/insert into "global_variables"/u);
  const bus = root.services.automation.handleEvent({ type: "chatOpened", chatId: chat.id });
  let manual: Promise<unknown> | undefined;
  let manualSettled = false;
  try {
    await gate.reached;
    gate.disarm();
    manual = root.services.automation.runRuleNow({ principal, ruleId: rule.id }).finally(() => {
      manualSettled = true;
    });
    await physicalTurn();
    expect(manualSettled, "the manual operation cannot finish while its sibling owns the chat lane").toBe(false);
    expect(await root.services.automation.getGlobalVariable({ principal, key: "beats" })).toBeNull();
  } finally {
    gate.release();
    await Promise.all([bus, manual]);
  }
  expect(await root.services.automation.getGlobalVariable({ principal, key: "beats" })).toBe("2");
  expect((await root.services.automation.listFires({ principal, ruleId: rule.id })).map((fire) => fire.outcome)).toEqual(["fired", "fired"]);
});

test("a real triggered turn raises its same-chat event without deadlocking the manual lane", async () => {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The keeper records the next beat.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  let turns = 0;
  const providerFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions") && ++turns > 2) {
      throw new Error("the physical reentry script has no third turn");
    }
    return await physical.execute(request);
  };
  await using root = await createServerHarness({ providerFetch });
  using subscription = new DisposableStack();
  const events: ChatBusEvent[] = [];
  subscription.defer(root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => events.push(event)));
  const principal = await root.principalFor(root.ownerId);
  await seedCorpusConnections(root, principal);
  const chatId = await seedRecallRoom(await root.internalCallerFor(root.ownerId));
  await root.services.chat.setGroupConfig({ principal, chatId, config: { output: "per-speaker", policy: "list", allowSelfResponses: true } });
  expect(await root.db.select({ startedAt: chats.startedAt }).from(chats).where(eq(chats.id, chatId)).get()).toMatchObject({ startedAt: root.clock.now() });
  await root.services.automation.setGlobalVariable({ principal, key: "beats", value: "0" });
  const rule = await enabledRule(root, {
    chatId,
    name: "Native same-chat reentry",
    trigger: { bus: "chat", type: "messageCommitted" },
    matchAutomationEvents: true,
    predicateCel: "int(global.beats) < 2",
    actions: [{ type: "set_variable", scope: "global", key: "beats", op: "inc" }, { type: "trigger_turn" }],
  });
  expect(await root.services.automation.runRuleNow({ principal, ruleId: rule.id })).toEqual({ outcome: "fired" });
  await root.settleBackground();
  const fires = await root.db.select().from(automationFires).where(eq(automationFires.ruleId, rule.id)).orderBy(automationFires.automationDepth);
  expect(
    {
      beats: await root.services.automation.getGlobalVariable({ principal, key: "beats" }),
      turns,
      fires: fires.map((fire) => [fire.outcome, fire.automationDepth, fire.detail]),
      committed: events.filter((event) => event.type === "messageCommitted").length,
      aborted: events.filter((event) => event.type === "turnAborted"),
    },
    JSON.stringify(events.filter((event) => event.type === "turnAborted" || event.type === "turnCompleted" || event.type === "messageCommitted")),
  ).toEqual({
    beats: "2",
    turns: 2,
    committed: 2,
    aborted: [],
    fires: [
      ["fired", 0, { runNow: true, byUserId: root.ownerId }],
      ["fired", 1, null],
      ["predicate_false", 2, null],
    ],
  });
});
