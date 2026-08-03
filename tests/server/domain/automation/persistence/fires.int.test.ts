// Persistence: automation_fires insert + read (newest-first). The dispatch engine (A5) writes its terminals
// through the same insertFire; A4 exercises the test_run + a couple of outcomes.

import type { AutomationRuleId, ChatId, UserId } from "@orb/kit/ids";
import { mintTypeId } from "@orb/kit/ids";
import { describe } from "vitest";
import { insertFire, listFiresForRule } from "../../../../../packages/server/src/domain/automation/persistence/fires.ts";
import { insertRule } from "../../../../../packages/server/src/domain/automation/persistence/rules.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FIXED_NOW_MS, seedHostChat, seedUser } from "../_support.ts";

async function seedRule(db: Parameters<typeof insertRule>[0], ownerId: UserId, chatId: ChatId): Promise<AutomationRuleId> {
  const id = mintTypeId("automation_rule");
  await insertRule(db, {
    id,
    ownerId,
    chatId,
    name: "r",
    description: null,
    position: 0,
    triggerBus: "chat",
    triggerType: "messageCommitted",
    predicateCel: null,
    actions: [{ type: "set_variable", scope: "chat", key: "k", op: "set", value: "v" }],
    matchAutomationEvents: false,
    cooldownSeconds: 0,
    maxFiresPerHour: 30,
    createdAt: FIXED_NOW_MS,
    updatedAt: FIXED_NOW_MS,
  });
  return id;
}

describe("automation_fires persistence", () => {
  test("insertFire writes; listFiresForRule reads newest-first", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const chatId = await seedHostChat(db, owner);
    const ruleId = await seedRule(db, owner, chatId);
    await insertFire(db, {
      id: mintTypeId("automation_fire"),
      ruleId,
      chatId,
      triggerType: "messageCommitted",
      outcome: "test_run",
      detail: { note: "dry" },
      automationDepth: 0,
      firedAt: FIXED_NOW_MS,
    });
    await insertFire(db, {
      id: mintTypeId("automation_fire"),
      ruleId,
      chatId,
      triggerType: "messageCommitted",
      outcome: "fired",
      detail: null,
      automationDepth: 0,
      firedAt: FIXED_NOW_MS + 1,
    });
    const fires = await listFiresForRule(db, ruleId);
    expect(fires.map((f) => f.outcome)).toEqual(["fired", "test_run"]);
    expect(fires[1]?.detail).toEqual({ note: "dry" });
  });
});
