import "@orb/testkit/node/composed-real.ts";
import { automationTriggerFor } from "@orb/contracts/automation";
import { closeDb } from "@orb/db";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { freshHeldDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { vi } from "vitest";

const COUNTER = "observer-witness";

test("same-ID roots keep observer lanes independent and stop only their own tap before joining held work", async () => {
  await using database = new AsyncDisposableStack();
  const held = await freshHeldDb();
  database.defer(() => closeDb(held.db));
  await using first = await createServerHarness({ db: held.db });
  await using second = await createServerHarness();
  await Promise.all([first.settleBackground(), second.settleBackground()]);
  const firstPrincipal = await first.principalFor(first.ownerId);
  const secondPrincipal = await second.principalFor(second.ownerId);
  const firstCaller = await first.internalCallerFor(first.ownerId);
  const secondCaller = await second.internalCallerFor(second.ownerId);
  const firstChat = (await firstCaller.chat.startChat({ characterIds: [] })).chat;
  const secondChat = (await secondCaller.chat.startChat({ characterIds: [] })).chat;
  expect(first.ownerId).toBe(second.ownerId);
  expect(firstChat.id).toBe(secondChat.id);
  for (const [harness, principal, chat] of [
    [first, firstPrincipal, firstChat],
    [second, secondPrincipal, secondChat],
  ] as const) {
    const rule = await harness.services.automation.createRule({
      principal,
      chatId: chat.id,
      name: "Owned pending observer",
      timeZone: UTC_TIME_ZONE,
      trigger: automationTriggerFor("chatOpened"),
      actions: [{ type: "set_variable", scope: "global", key: COUNTER, op: "inc", value: "1" }],
    });
    await harness.services.automation.setRuleEnabled({ principal, ruleId: rule.id, enabled: true });
  }
  await Promise.all([first.settleBackground(), second.settleBackground()]);
  const gate = held.hold(/from "automation_rules".*"trigger_type"/u);
  const stopped = Promise.withResolvers<void>();
  const setTap = first.app.liveBuses.chatOpen.setChatOpenTap;
  const tap = vi.spyOn(first.app.liveBuses.chatOpen, "setChatOpenTap").mockImplementation((next) => {
    setTap.call(first.app.liveBuses.chatOpen, next);
    if (next === null) {
      stopped.resolve();
    }
  });
  let disposing: Promise<void> | undefined;
  try {
    first.app.liveBuses.chatOpen.notifyChatOpened(firstChat.id, first.ownerId);
    await gate.reached;
    second.app.liveBuses.chatOpen.notifyChatOpened(secondChat.id, second.ownerId);
    let secondSettled = false;
    const progress = second.settleBackground().then(() => {
      secondSettled = true;
    });
    await expect.poll(() => secondSettled).toBe(true);
    await progress;
    expect(await second.services.automation.getGlobalVariable({ principal: secondPrincipal, key: COUNTER })).toBe("1");
    let firstDisposed = false;
    disposing = Promise.resolve(first[Symbol.asyncDispose]()).then(() => {
      firstDisposed = true;
    });
    await stopped.promise;
    first.app.liveBuses.chatOpen.notifyChatOpened(firstChat.id, first.ownerId);
    second.app.liveBuses.chatOpen.notifyChatOpened(secondChat.id, second.ownerId);
    await second.settleBackground();
    expect(firstDisposed).toBe(false);
    expect(await second.services.automation.getGlobalVariable({ principal: secondPrincipal, key: COUNTER })).toBe("2");
  } finally {
    gate.release();
    await first.settleBackground();
    await second.settleBackground();
    await disposing;
    tap.mockRestore();
  }
  expect(await first.services.automation.getGlobalVariable({ principal: firstPrincipal, key: COUNTER })).toBe("1");
});
