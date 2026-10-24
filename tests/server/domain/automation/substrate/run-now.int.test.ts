// @subject packages/server/src/domain/automation/substrate/run-now.ts
// @subject packages/server/src/domain/automation/service.ts
import { setImmediate as physicalTurn } from "node:timers/promises";
import { ruleRefusalReason } from "@orb/contracts/automation";
import { closeDb } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, freshHeldDb } from "@orb/testkit/node/composed";
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
