// foundation/observability/debug/inspect/automation-fires — the principal-blind fire-log probe against a real
// libSQL :memory: db. Pins: newest-first across EVERY rule and chat (no principal in the path), the storage-only
// `reserved` reservation excluded (it is an in-flight budget hold, never a terminal), the `chatId` / `ruleId`
// narrowings, and the limit. Seeded with the same direct row inserts the domain's own persistence tests use.

import { automationFires, automationRules, chats, users } from "@orb/db";
import { handleKey } from "@orb/kit/handle-key";
import type { AutomationFireId, AutomationRuleId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { automationFireRows } from "@orb/server/foundation/observability/debug";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";

const NOW = 1_700_000_000_000;
const DEFAULT_LIMIT = 100;

/** An owner, two chats, and one rule per chat — the smallest tree the FK chain needs. */
async function seedTwoRooms(
  db: Awaited<ReturnType<typeof freshDb>>,
): Promise<{ chatA: ChatId; chatB: ChatId; ruleA: AutomationRuleId; ruleB: AutomationRuleId }> {
  const ownerId = castId<UserId>("user_fires");
  await db.insert(users).values({ id: ownerId, handle: castId<Handle>("user_fires"), handleKey: handleKey(castId<Handle>("user_fires")) });
  const chatA = castId<ChatId>("chat_fires_a");
  const chatB = castId<ChatId>("chat_fires_b");
  await db.insert(chats).values([
    { id: chatA, title: "A", updatedAt: NOW },
    { id: chatB, title: "B", updatedAt: NOW },
  ]);
  const ruleA = castId<AutomationRuleId>("automation_rule_fires_a");
  const ruleB = castId<AutomationRuleId>("automation_rule_fires_b");
  const rule = (id: AutomationRuleId, chatId: ChatId): typeof automationRules.$inferInsert => ({
    id,
    ownerId,
    chatId,
    name: "r",
    position: 0,
    triggerBus: "chat",
    triggerType: "messageCommitted",
    actions: [{ type: "set_variable", scope: "chat", key: "k", op: "set", value: "v" }],
  });
  await db.insert(automationRules).values([rule(ruleA, chatA), rule(ruleB, chatB)]);
  return { chatA, chatB, ruleA, ruleB };
}

type FireInsert = typeof automationFires.$inferInsert;
function fire(id: string, ruleId: AutomationRuleId, chatId: ChatId, at: { readonly outcome: FireInsert["outcome"]; readonly firedAt: number }): FireInsert {
  return {
    id: castId<AutomationFireId>(id),
    ruleId,
    chatId,
    triggerType: "messageCommitted",
    outcome: at.outcome,
    detail: { note: id },
    automationDepth: 0,
    firedAt: at.firedAt,
  };
}

test("serves every terminal across rules and chats newest-first, and never the in-flight `reserved` hold", async () => {
  const db = await freshDb();
  const { chatA, chatB, ruleA, ruleB } = await seedTwoRooms(db);
  await db.insert(automationFires).values([
    fire("automation_fire_1", ruleA, chatA, { outcome: "fired", firedAt: NOW + 1 }),
    fire("automation_fire_2", ruleB, chatB, { outcome: "predicate_false", firedAt: NOW + 3 }),
    fire("automation_fire_3", ruleA, chatA, { outcome: "reserved", firedAt: NOW + 4 }), // the storage-only hold — must NOT appear
    fire("automation_fire_4", ruleA, chatA, { outcome: "budget_refused", firedAt: NOW + 2 }),
  ]);
  const rows = await automationFireRows(db, { limit: DEFAULT_LIMIT });
  expect(rows.map((r) => r.id)).toEqual(["automation_fire_2", "automation_fire_4", "automation_fire_1"]);
  expect(rows[0]).toMatchObject({
    ruleId: ruleB,
    chatId: chatB,
    outcome: "predicate_false",
    detail: { note: "automation_fire_2" },
    automationDepth: 0,
    firedAt: NOW + 3,
  });
  expect(rows.map((r) => r.id)).not.toContain("automation_fire_3");
});

test("narrows by chatId, by ruleId, and honours the limit", async () => {
  const db = await freshDb();
  const { chatA, chatB, ruleA, ruleB } = await seedTwoRooms(db);
  await db
    .insert(automationFires)
    .values([
      fire("automation_fire_a1", ruleA, chatA, { outcome: "fired", firedAt: NOW + 1 }),
      fire("automation_fire_a2", ruleA, chatA, { outcome: "action_error", firedAt: NOW + 2 }),
      fire("automation_fire_b1", ruleB, chatB, { outcome: "fired", firedAt: NOW + 3 }),
    ]);
  expect((await automationFireRows(db, { chatId: chatB, limit: DEFAULT_LIMIT })).map((r) => r.id)).toEqual(["automation_fire_b1"]);
  expect((await automationFireRows(db, { ruleId: ruleA, limit: DEFAULT_LIMIT })).map((r) => r.id)).toEqual(["automation_fire_a2", "automation_fire_a1"]);
  expect((await automationFireRows(db, { ruleId: ruleA, limit: 1 })).map((r) => r.id)).toEqual(["automation_fire_a2"]);
  // A chat with no fires is an honest empty, not an error.
  expect(await automationFireRows(db, { chatId: castId<ChatId>("chat_fires_none"), limit: DEFAULT_LIMIT })).toEqual([]);
});

test("an empty ledger serves nothing (no fabricated rows)", async () => {
  const db = await freshDb();
  expect(await automationFireRows(db, { limit: DEFAULT_LIMIT })).toEqual([]);
});
