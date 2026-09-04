// Persistence: automation_rules query functions directly (the verbs wrap these). Pins position ordering,
// the total reorder (chat-scoped), and the lazy-parse fault isolation of `toRuleView`.

import type { AutomationRuleId, ChatId, UserId } from "@orb/kit/ids";
import { mintTypeId } from "@orb/kit/ids";
import { describe } from "vitest";
import {
  applyReorder,
  insertRule,
  listRuleIdsForChat,
  listRuleRowsForChat,
  maxPosition,
  selectRuleRow,
  toRuleView,
} from "../../../../../packages/server/src/domain/automation/persistence/rules.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FIXED_NOW_MS, seedHostChat, seedUser } from "../_support.ts";

const SET_ARM = { type: "set_variable" as const, scope: "chat" as const, key: "k", op: "set" as const, value: "v" };

async function seedRule(
  db: Parameters<typeof insertRule>[0],
  opts: { ownerId: UserId; chatId: ChatId; name: string; position: number },
): Promise<AutomationRuleId> {
  const id = mintTypeId("automation_rule");
  await insertRule(db, {
    id,
    ownerId: opts.ownerId,
    chatId: opts.chatId,
    name: opts.name,
    description: null,
    position: opts.position,
    triggerBus: "chat",
    triggerType: "messageCommitted",
    predicateCel: null,
    actions: [SET_ARM],
    rulePresetId: null,
    rulePresetKnobs: null,
    matchAutomationEvents: false,
    cooldownSeconds: 0,
    maxFiresPerHour: 30,
    createdAt: FIXED_NOW_MS,
    updatedAt: FIXED_NOW_MS,
  });
  return id;
}

describe("automation_rules persistence", () => {
  test("insertRule forces enabled=false; maxPosition tracks the highest position", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const chatId = await seedHostChat(db, owner);
    await expect(maxPosition(db, chatId, owner)).resolves.toBe(-1);
    const id = await seedRule(db, { ownerId: owner, chatId, name: "a", position: 0 });
    const row = await selectRuleRow(db, id);
    expect(row?.enabled).toBe(false);
    await expect(maxPosition(db, chatId, owner)).resolves.toBe(0);
  });

  test("applyReorder rewrites position as a total order; listRuleRowsForChat reads it", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const chatId = await seedHostChat(db, owner);
    const a = await seedRule(db, { ownerId: owner, chatId, name: "a", position: 0 });
    const b = await seedRule(db, { ownerId: owner, chatId, name: "b", position: 1 });
    await applyReorder(db, chatId, [b, a], FIXED_NOW_MS);
    const rows = await listRuleRowsForChat(db, chatId);
    expect(rows.map((r) => r.name)).toEqual(["b", "a"]);
  });

  test("toRuleView lazy-parses actions, degrading a corrupt blob to []", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const chatId = await seedHostChat(db, owner);
    const id = await seedRule(db, { ownerId: owner, chatId, name: "good", position: 0 });
    const good = await selectRuleRow(db, id);
    expect(good).toBeDefined();
    if (good === undefined) {
      return;
    }
    // A hand-built corrupt row projects to [] without throwing (an arm shape zod can't parse).
    const corrupt = { ...good, actions: [{ not: "an arm" }] };
    expect(toRuleView(good).actions).toEqual([SET_ARM]);
    expect(toRuleView(corrupt).actions).toEqual([]);
    // #1422 — the empty list is FLAGGED, not fabricated. Without this a rule nothing can read projects
    // identically to a rule whose author has not added an arm yet: same `[]`, same `enabled: true`, same
    // clean error ledger (the disable-on-corrupt is dispatch-time), so the management surface reads it as
    // benign until an event happens to arrive.
    expect(toRuleView(corrupt).actionsCorrupt).toBe(true);
    expect(toRuleView(good).actionsCorrupt).toBe(false);
    // The fault isolation itself is unchanged: nothing threw, and every other field passes through.
    expect(toRuleView(corrupt).enabled).toBe(good.enabled);
  });

  // #1429's read — the reorder verb's totality check compares against the chat's COMPLETE current id set.
  test("listRuleIdsForChat returns exactly that chat's rule ids, and no other chat's", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const chatId = await seedHostChat(db, owner);
    const otherChat = await seedHostChat(db, owner, "other");
    const a = await seedRule(db, { ownerId: owner, chatId, name: "a", position: 0 });
    const b = await seedRule(db, { ownerId: owner, chatId, name: "b", position: 1 });
    await seedRule(db, { ownerId: owner, chatId: otherChat, name: "elsewhere", position: 0 });

    expect((await listRuleIdsForChat(db, chatId)).toSorted()).toEqual([a, b].toSorted());
    expect(await listRuleIdsForChat(db, otherChat)).toHaveLength(1);
  });
});
