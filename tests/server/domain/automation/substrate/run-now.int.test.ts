// @subject packages/server/src/domain/automation/substrate/run-now.ts
// @subject packages/server/src/domain/automation/service.ts
import { setImmediate as physicalTurn } from "node:timers/promises";
import { ruleRefusalReason } from "@orb/contracts/automation";
import type { ChatBusEvent } from "@orb/contracts/chat";
import { automationFires, automationRules, chats, closeDb } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  freshDb,
  freshHeldDb,
  seedCorpusConnections,
  seedRecallRoom,
} from "@orb/testkit/node/composed";
import { eq, sql } from "drizzle-orm";
import { enabledRule, storedRule } from "../runtime.fixtures.ts";

function statementText(input: unknown): string | null {
  if (typeof input === "string") {
    return input;
  }
  if (typeof input === "object" && input !== null && "sql" in input && typeof input.sql === "string") {
    return input.sql;
  }
  return null;
}

test("a failed index refresh after manual auto-disable preserves the committed run and retries at the event door", async () => {
  let armed = false;
  let refreshReads = 0;
  const db = await freshDb(
    (client) =>
      new Proxy(client, {
        get(target, property): unknown {
          const operation: unknown = Reflect.get(target, property, target);
          if (typeof operation !== "function") {
            return operation;
          }
          if (property !== "execute") {
            return operation.bind(target);
          }
          return (...args: readonly unknown[]): unknown => {
            const text = statementText(args[0]);
            if (armed && text !== null && /select distinct .* from "automation_rules"/u.test(text)) {
              refreshReads += 1;
              if (refreshReads === 1) {
                return Promise.reject(new Error("synthetic index read refusal"));
              }
            }
            return Reflect.apply(operation, target, args);
          };
        },
      }),
  );
  await using database = new AsyncDisposableStack();
  database.defer(() => closeDb(db));
  await using root = await createServerHarness({ db });
  const principal = await root.principalFor(root.ownerId);
  const { chat } = await root.services.chat.startChat({ principal, characterIds: [], opening: "none" });
  const rule = await enabledRule(root, {
    chatId: chat.id,
    name: "Corrupt stored actions",
    trigger: { bus: "chat", type: "chatOpened" },
    actions: [{ type: "set_variable", scope: "global", key: "corrupt", op: "set", value: "must not run" }],
  });
  const healthy = await enabledRule(root, {
    chatId: chat.id,
    name: "Actual retry witness",
    trigger: { bus: "chat", type: "chatOpened" },
    actions: [{ type: "set_variable", scope: "global", key: "retry-witness", op: "inc" }],
  });
  await root.db.run(sql`UPDATE ${automationRules} SET actions = ${JSON.stringify([{ not: "an arm" }])} WHERE id = ${rule.id}`);
  armed = true;
  expect(await root.services.automation.runRuleNow({ principal, ruleId: rule.id })).toEqual({ outcome: "action_error" });
  expect((await storedRule(root, rule.id)).enabled).toBe(false);
  expect(refreshReads, "the committed disable reached the physical refresh read refusal").toBe(1);
  await root.services.automation.handleEvent({ type: "chatOpened", chatId: chat.id });
  expect(refreshReads, "the next real event retried the stale index").toBe(2);
  expect(await root.services.automation.getGlobalVariable({ principal, key: "retry-witness" })).toBe("1");
  expect((await root.services.automation.listFires({ principal, ruleId: healthy.id })).map((fire) => fire.outcome)).toEqual(["fired"]);
});

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
