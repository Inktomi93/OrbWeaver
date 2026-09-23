// engine/budget-gate — the three pre-op fire-RATE belts: cooldown, per-rule/hour, per-SCOPE/hour (the fixed
// per-chat ceiling vs the owner-editable owner-global one, C5's two-scopes-one-policy). A refusal is not an
// error (budget_refused stays healthy); each belt's ceiling is pinned independently so a future change to one
// cannot silently widen another.

import { AUTOMATION_CHAT_MAX_FIRES_PER_HOUR } from "@orb/contracts/automation";
import { automationRules } from "@orb/db";
import type { AutomationRuleId, ChatId, UserId } from "@orb/kit/ids";
import { mintTypeId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { checkBudget } from "../../../../../packages/server/src/domain/automation/engine/budget-gate.ts";
import { upsertOwnerBudget } from "../../../../../packages/server/src/domain/automation/persistence/budgets.ts";
import { insertFire } from "../../../../../packages/server/src/domain/automation/persistence/fires.ts";
import { insertRule } from "../../../../../packages/server/src/domain/automation/persistence/rules.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FIXED_NOW_MS, seedChatFires, seedHostChat, seedUser } from "../_support.ts";

async function seedRule(
  db: Parameters<typeof insertRule>[0],
  ownerId: UserId,
  chatId: ChatId | null,
  opts: { readonly cooldownSeconds?: number; readonly maxFiresPerHour?: number } = {},
): Promise<AutomationRuleId> {
  const id = mintTypeId("automation_rule");
  await insertRule(db, {
    id,
    ownerId,
    chatId,
    name: "r",
    description: null,
    triggerBus: chatId === null ? "domain" : "chat",
    triggerType: chatId === null ? "character.updated" : "messageCommitted",
    predicateCel: null,
    actions: [{ type: "set_variable", scope: "chat", key: "k", op: "set", value: "v" }],
    rulePresetId: null,
    rulePresetKnobs: null,
    matchAutomationEvents: false,
    cooldownSeconds: opts.cooldownSeconds ?? 0,
    maxFiresPerHour: opts.maxFiresPerHour ?? 30,
    createdAt: FIXED_NOW_MS,
    updatedAt: FIXED_NOW_MS,
  });
  return id;
}

describe("checkBudget", () => {
  test("a live cooldown refuses with detail 'cooldown', ahead of every other belt", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const chatId = await seedHostChat(db, owner);
    const ruleId = await seedRule(db, owner, chatId, { cooldownSeconds: 3600 });
    await insertFire(db, {
      id: mintTypeId("automation_fire"),
      ruleId,
      chatId,
      triggerType: "messageCommitted",
      outcome: "fired",
      detail: null,
      automationDepth: 0,
      firedAt: FIXED_NOW_MS,
    });
    const [rule] = await db.select().from(automationRules).where(eq(automationRules.id, ruleId));
    expect(rule).toBeDefined();
    if (rule === undefined) {
      return;
    }
    const verdict = await checkBudget(db, { rule, scope: chatId, nowMs: FIXED_NOW_MS + 1000 });
    expect(verdict).toEqual({ ok: false, detail: "cooldown" });
  });

  test("a per-rule/hour ceiling refuses with detail 'rule_hourly' once the window is full", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const chatId = await seedHostChat(db, owner);
    const ruleId = await seedRule(db, owner, chatId, { maxFiresPerHour: 1 });
    await insertFire(db, {
      id: mintTypeId("automation_fire"),
      ruleId,
      chatId,
      triggerType: "messageCommitted",
      outcome: "fired",
      detail: null,
      automationDepth: 0,
      firedAt: FIXED_NOW_MS,
    });
    const [rule] = await db.select().from(automationRules).where(eq(automationRules.id, ruleId));
    if (rule === undefined) {
      expect.unreachable();
    }
    const verdict = await checkBudget(db, { rule, scope: chatId, nowMs: FIXED_NOW_MS + 1000 });
    expect(verdict).toEqual({ ok: false, detail: "rule_hourly" });
  });

  test("the chat-scope belt refuses ANY rule of that chat with 'chat_hourly' at the fixed ceiling, and not one fire before", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const chatId = await seedHostChat(db, owner);
    // The fires land on a DIFFERENT rule of the same chat, so only the chat belt can be what refuses.
    const filler = await seedRule(db, owner, chatId);
    const next = await seedRule(db, owner, chatId);
    const [rule] = await db.select().from(automationRules).where(eq(automationRules.id, next));
    if (rule === undefined) {
      expect.unreachable();
    }
    const nowMs = FIXED_NOW_MS + AUTOMATION_CHAT_MAX_FIRES_PER_HOUR;
    await seedChatFires(db, { ruleId: filler, chatId, count: AUTOMATION_CHAT_MAX_FIRES_PER_HOUR - 1, firedAt: FIXED_NOW_MS });
    expect(await checkBudget(db, { rule, scope: chatId, nowMs })).toEqual({ ok: true });
    await seedChatFires(db, { ruleId: filler, chatId, count: 1, firedAt: nowMs - 1 });
    expect(await checkBudget(db, { rule, scope: chatId, nowMs })).toEqual({ ok: false, detail: "chat_hourly" });
  });

  test("the owner-GLOBAL scope counts only the author's OWN chat-less fires — a busy chat rule never starves it", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const chatId = await seedHostChat(db, owner);
    const chatRule = await seedRule(db, owner, chatId);
    const globalRule = await seedRule(db, owner, null);
    await upsertOwnerBudget(db, owner, { maxFiresPerHour: 30 }, FIXED_NOW_MS);
    // A busy CHAT rule fires many times — the owner-global belt must not see these.
    for (let i = 0; i < 5; i += 1) {
      await insertFire(db, {
        id: mintTypeId("automation_fire"),
        ruleId: chatRule,
        chatId,
        triggerType: "messageCommitted",
        outcome: "fired",
        detail: null,
        automationDepth: 0,
        firedAt: FIXED_NOW_MS + i,
      });
    }
    const [rule] = await db.select().from(automationRules).where(eq(automationRules.id, globalRule));
    if (rule === undefined) {
      expect.unreachable();
    }
    const verdict = await checkBudget(db, { rule, scope: null, nowMs: FIXED_NOW_MS + 1000 });
    expect(verdict).toEqual({ ok: true });
  });
});
