// Persistence: automation_fires insert + read (newest-first). The dispatch engine (A5) writes its terminals
// through the same insertFire; A4 exercises the test_run + a couple of outcomes.

import { automationFires } from "@orb/db";
import type { AutomationFireId, AutomationRuleId, ChatId, UserId } from "@orb/kit/ids";
import { mintTypeId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { upsertBudget, upsertOwnerBudget } from "../../../../../packages/server/src/domain/automation/persistence/budgets.ts";
import {
  finalizeReservedFire,
  insertFire,
  listFiresForChat,
  listFiresForRule,
  reserveFireBudget,
} from "../../../../../packages/server/src/domain/automation/persistence/fires.ts";
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
    position: 0,
    triggerBus: chatId === null ? "domain" : "chat",
    triggerType: chatId === null ? "character.updated" : "messageCommitted",
    predicateCel: null,
    actions: [{ type: "set_variable", scope: "chat", key: "k", op: "set", value: "v" }],
    matchAutomationEvents: false,
    cooldownSeconds: opts.cooldownSeconds ?? 0,
    maxFiresPerHour: opts.maxFiresPerHour ?? 30,
    createdAt: FIXED_NOW_MS,
    updatedAt: FIXED_NOW_MS,
  });
  return id;
}

function reservation(
  ruleId: AutomationRuleId,
  firedAt = FIXED_NOW_MS,
): { id: AutomationFireId; ruleId: AutomationRuleId; automationDepth: number; firedAt: number } {
  return { id: mintTypeId("automation_fire"), ruleId, automationDepth: 0, firedAt };
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

  test("a held cooldown reservation is fail-closed, hidden publicly, and released by an error terminal", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const chatId = await seedHostChat(db, owner);
    const ruleId = await seedRule(db, owner, chatId, { cooldownSeconds: 60 });
    const held = reservation(ruleId);

    await expect(reserveFireBudget(db, held)).resolves.toBe(true);
    await expect(listFiresForRule(db, ruleId)).resolves.toEqual([]);
    await expect(listFiresForChat(db, chatId)).resolves.toEqual([]);
    await expect(reserveFireBudget(db, reservation(ruleId))).resolves.toBe(false);
    const [stored] = await db.select().from(automationFires).where(eq(automationFires.id, held.id));
    expect(stored?.outcome).toBe("reserved"); // crash control: the durable hold exists even though the public log is empty

    await finalizeReservedFire(db, held.id, "action_error", { error: "provider failed" });
    expect((await listFiresForRule(db, ruleId)).map((row) => row.outcome)).toEqual(["action_error"]);
    await expect(reserveFireBudget(db, reservation(ruleId))).resolves.toBe(true); // completed failures retain today's retry semantics
  });

  test("a held reservation occupies the per-rule hourly ceiling", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const chatId = await seedHostChat(db, owner);
    const ruleId = await seedRule(db, owner, chatId, { maxFiresPerHour: 1 });

    const results = await Promise.all([reserveFireBudget(db, reservation(ruleId)), reserveFireBudget(db, reservation(ruleId))]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((result) => !result)).toHaveLength(1);
  });

  test("a held reservation occupies a chat ceiling across different rules", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const chatId = await seedHostChat(db, owner);
    const first = await seedRule(db, owner, chatId);
    const second = await seedRule(db, owner, chatId);
    await upsertBudget(db, chatId, { maxFiresPerHour: 1 }, FIXED_NOW_MS);

    const results = await Promise.all([reserveFireBudget(db, reservation(first)), reserveFireBudget(db, reservation(second))]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((result) => !result)).toHaveLength(1);
  });

  test("a held reservation occupies an owner-global ceiling across different rules", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const first = await seedRule(db, owner, null);
    const second = await seedRule(db, owner, null);
    await upsertOwnerBudget(db, owner, { maxFiresPerHour: 1 }, FIXED_NOW_MS);

    const results = await Promise.all([reserveFireBudget(db, reservation(first)), reserveFireBudget(db, reservation(second))]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((result) => !result)).toHaveLength(1);
  });
});
