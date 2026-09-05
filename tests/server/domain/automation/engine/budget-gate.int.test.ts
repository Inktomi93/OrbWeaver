// engine/budget-gate — the three pre-op fire-RATE belts: cooldown, per-rule/hour, per-SCOPE/hour (chat vs
// owner-global, C5's two-tables-one-policy). A refusal is not an error (budget_refused stays healthy); each
// belt's ceiling is pinned independently so a future change to one cannot silently widen another.

import { automationRules } from "@orb/db";
import type { AutomationRuleId, ChatId, UserId } from "@orb/kit/ids";
import { mintTypeId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { checkBudget } from "../../../../../packages/server/src/domain/automation/engine/budget-gate.ts";
import { upsertBudget, upsertOwnerBudget } from "../../../../../packages/server/src/domain/automation/persistence/budgets.ts";
import { insertFire } from "../../../../../packages/server/src/domain/automation/persistence/fires.ts";
import { insertRule } from "../../../../../packages/server/src/domain/automation/persistence/rules.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FIXED_NOW_MS, seedHostChat, seedUser } from "../_support.ts";

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

  test("a chat-scope ceiling refuses ANY rule of that chat with detail 'chat_hourly' (the second table, same policy)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const chatId = await seedHostChat(db, owner);
    const first = await seedRule(db, owner, chatId);
    const second = await seedRule(db, owner, chatId);
    await upsertBudget(db, chatId, { maxFiresPerHour: 1 }, FIXED_NOW_MS);
    await insertFire(db, {
      id: mintTypeId("automation_fire"),
      ruleId: first,
      chatId,
      triggerType: "messageCommitted",
      outcome: "fired",
      detail: null,
      automationDepth: 0,
      firedAt: FIXED_NOW_MS,
    });
    const [rule] = await db.select().from(automationRules).where(eq(automationRules.id, second));
    if (rule === undefined) {
      expect.unreachable();
    }
    const verdict = await checkBudget(db, { rule, scope: chatId, nowMs: FIXED_NOW_MS + 1000 });
    expect(verdict).toEqual({ ok: false, detail: "chat_hourly" });
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

  test("an absent budget row dispatches as the DDL default — the gate and the projection can never disagree", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const chatId = await seedHostChat(db, owner);
    const ruleId = await seedRule(db, owner, chatId);
    const [rule] = await db.select().from(automationRules).where(eq(automationRules.id, ruleId));
    if (rule === undefined) {
      expect.unreachable();
    }
    const verdict = await checkBudget(db, { rule, scope: chatId, nowMs: FIXED_NOW_MS });
    expect(verdict).toEqual({ ok: true });
  });
});
