// substrate/enabled-index — the watcher's in-process pre-check. Pins: a freshly-built index is empty until
// `reload()`, `reload()` re-derives BOTH the per-chat enabled Set and the domain-rules flag from live db
// state, and a chat with no enabled rule is absent from the set.

import type { AutomationRuleId } from "@orb/kit/ids";
import { mintTypeId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { describe } from "vitest";
import { insertRule, setRuleEnabledRow } from "../../../../../packages/server/src/domain/automation/persistence/rules.ts";
import { createEnabledRuleIndex } from "../../../../../packages/server/src/domain/automation/substrate/enabled-index.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FIXED_NOW_MS, ruleFixture } from "../_support.ts";

async function seedEnabledChatRule(fixture: Awaited<ReturnType<typeof ruleFixture>>): Promise<AutomationRuleId> {
  const id = mintTypeId("automation_rule");
  await insertRule(fixture.db, {
    timeZone: UTC_TIME_ZONE,
    id,
    ownerId: fixture.host,
    creationRequestId: null,
    chatId: fixture.chatId,
    name: "r",
    description: null,
    triggerBus: "chat",
    triggerType: "messageCommitted",
    predicateCel: null,
    actions: [{ type: "set_variable", scope: "chat", key: "k", op: "set", value: "v" }],
    rulePresetId: null,
    rulePresetKnobs: null,
    matchAutomationEvents: false,
    cooldownSeconds: 0,
    maxFiresPerHour: 30,
    createdAt: FIXED_NOW_MS,
    updatedAt: FIXED_NOW_MS,
  });
  await setRuleEnabledRow(fixture.db, id, true, FIXED_NOW_MS);
  return id;
}

describe("createEnabledRuleIndex", () => {
  test("before reload(), a freshly-built index has no enabled chats and no domain flag", async () => {
    const fixture = await ruleFixture();
    const index = createEnabledRuleIndex(fixture.db);
    expect(index.has(fixture.chatId)).toBe(false);
    expect(index.hasDomainRules()).toBe(false);
  });

  test("reload() populates the enabled-chat Set from live db state", async () => {
    const fixture = await ruleFixture();
    const index = createEnabledRuleIndex(fixture.db);
    expect(index.has(fixture.chatId)).toBe(false);
    await seedEnabledChatRule(fixture);
    await index.reload();
    expect(index.has(fixture.chatId)).toBe(true);
  });

  test("a chat with no enabled rule stays absent from the set", async () => {
    const fixture = await ruleFixture();
    const index = createEnabledRuleIndex(fixture.db);
    await index.reload();
    expect(index.has(fixture.chatId)).toBe(false);
  });

  test("hasDomainRules() reflects whether ANY enabled domain-bus rule exists, independent of the per-chat Set", async () => {
    const fixture = await ruleFixture();
    const index = createEnabledRuleIndex(fixture.db);
    await index.reload();
    expect(index.hasDomainRules()).toBe(false);
    const id = mintTypeId("automation_rule");
    await insertRule(fixture.db, {
      timeZone: UTC_TIME_ZONE,
      id,
      ownerId: fixture.host,
      creationRequestId: null,
      chatId: null,
      name: "global",
      description: null,
      triggerBus: "domain",
      triggerType: "character.updated",
      predicateCel: null,
      actions: [{ type: "set_variable", scope: "chat", key: "k", op: "set", value: "v" }],
      rulePresetId: null,
      rulePresetKnobs: null,
      matchAutomationEvents: false,
      cooldownSeconds: 0,
      maxFiresPerHour: 30,
      createdAt: FIXED_NOW_MS,
      updatedAt: FIXED_NOW_MS,
    });
    await setRuleEnabledRow(fixture.db, id, true, FIXED_NOW_MS);
    await index.reload();
    expect(index.hasDomainRules()).toBe(true);
    expect(index.has(fixture.chatId)).toBe(false); // the domain flag never leaks into the per-chat Set
  });
});
