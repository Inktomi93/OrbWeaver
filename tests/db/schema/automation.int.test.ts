// .int tests for schema/automation (D46 — the baseline rider). Real libSQL :memory: via freshDb
// (FK PRAGMA ON). Covers: the enum test-mirrors (trigger_bus ← AUTOMATION_TRIGGER_BUSES, outcome ←
// AUTOMATION_FIRE_OUTCOMES); automation_rules round-trip (born disabled, action blob, defaults) + the
// paired bus↔tuple trigger CHECK (a cross-bus trigger name is unrepresentable) + the 120-char name
// CHECK; automation_budgets defaults; automation_fires FK CASCADE off the rule; global_variables —
// composite (ownerId, key) PK (same key across owners coexists; same owner+key collides), the 128-char
// key CHECK, and the 64 KiB BYTE-accurate value CHECK (multibyte text counts bytes, not characters).

import type { ChatTriggerType } from "@orb/contracts/automation";
import { AUTOMATION_FIRE_OUTCOMES, AUTOMATION_TRIGGER_BUSES } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import { automationBudgets, automationFires, automationRules, chats, globalVariables } from "@orb/db";
import { isConstraintViolation } from "@orb/db/kit";
import type { AutomationFireId, AutomationRuleId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";
import { seedChat, seedUser } from "./_support.ts";

// Named lengths (`noMagicNumbers` is off in tests, but the caps are the POINT here — name them).
const NAME_CAP = 120;
const KEY_CAP = 128;
const VALUE_CAP_BYTES = 65_536;

async function seedOwnerAndChat(db: Db, tag: string): Promise<{ ownerId: UserId; chatId: ChatId }> {
  const ownerId = await seedUser(db, { id: `user_${tag}`, handle: castId<Handle>(`auto-${tag}`) });
  const chatId = await seedChat(db, { id: `chat_${tag}` });
  return { ownerId, chatId };
}

function ruleValues(id: string, ownerId: UserId, chatId: ChatId): typeof automationRules.$inferInsert {
  return {
    id: castId<AutomationRuleId>(id),
    ownerId,
    chatId,
    name: "on open, set POV",
    position: 1,
    triggerBus: "chat",
    triggerType: "chatOpened",
    actions: [{ type: "set_variable", key: "pov", value: "first" }],
  };
}

// ── Test-mirrors: the db columns derive the ONE contracts tuples ───────────────────────────────────────

test("automation_rules.trigger_bus enum mirrors AUTOMATION_TRIGGER_BUSES", () => {
  expect(automationRules.triggerBus.enumValues).toEqual([...AUTOMATION_TRIGGER_BUSES]);
});

test("automation_fires.outcome enum mirrors AUTOMATION_FIRE_OUTCOMES", () => {
  expect(automationFires.outcome.enumValues).toEqual([...AUTOMATION_FIRE_OUTCOMES]);
});

// ── automation_rules ───────────────────────────────────────────────────────────────────────────────────

test("automation_rules round-trips (born DISABLED, action blob, budget defaults)", async () => {
  const db = await freshDb();
  const { ownerId, chatId } = await seedOwnerAndChat(db, "rule_rt");
  const values = ruleValues("automation_rule_rt", ownerId, chatId);
  await db.insert(automationRules).values(values);

  const rows = await db.select().from(automationRules).where(eq(automationRules.id, values.id));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.enabled).toBe(false); // enabling is the consent act
  expect(rows[0]?.actions).toEqual(values.actions);
  expect(rows[0]?.predicateCel).toBeNull(); // NULL = always fire
  expect(rows[0]?.matchAutomationEvents).toBe(false); // the cascade opt-in defaults off
  expect(rows[0]?.cooldownSeconds).toBe(0);
  expect(rows[0]?.maxFiresPerHour).toBe(30);
  expect(rows[0]?.consecutiveErrors).toBe(0);
});

test("the paired trigger CHECK rejects a domain trigger name on the chat bus (and vice versa)", async () => {
  const db = await freshDb();
  const { ownerId, chatId } = await seedOwnerAndChat(db, "rule_pair");

  let chatBusDomainType: unknown;
  try {
    await db.insert(automationRules).values({
      ...ruleValues("automation_rule_x1", ownerId, chatId),
      triggerBus: "chat",
      triggerType: "character.updated", // a DOMAIN tuple member on the chat bus
    });
  } catch (err) {
    chatBusDomainType = err;
  }
  expect(isConstraintViolation(chatBusDomainType)?.kind).toBe("check");

  let domainBusChatType: unknown;
  try {
    await db.insert(automationRules).values({
      ...ruleValues("automation_rule_x2", ownerId, chatId),
      triggerBus: "domain",
      triggerType: "messageCommitted", // a CHAT tuple member on the domain bus
    });
  } catch (err) {
    domainBusChatType = err;
  }
  expect(isConstraintViolation(domainBusChatType)?.kind).toBe("check");

  let invented: unknown;
  try {
    await db.insert(automationRules).values({
      ...ruleValues("automation_rule_x3", ownerId, chatId),
      triggerType: "delta" as ChatTriggerType, // permanently EXCLUDED from the taxonomy (01 §1)
    });
  } catch (err) {
    invented = err;
  }
  expect(isConstraintViolation(invented)?.kind).toBe("check");
});

test("the name CHECK caps at 120 chars", async () => {
  const db = await freshDb();
  const { ownerId, chatId } = await seedOwnerAndChat(db, "rule_name");
  await db.insert(automationRules).values({
    ...ruleValues("automation_rule_n1", ownerId, chatId),
    name: "n".repeat(NAME_CAP), // at the cap — accepted
  });

  let caught: unknown;
  try {
    await db.insert(automationRules).values({
      ...ruleValues("automation_rule_n2", ownerId, chatId),
      name: "n".repeat(NAME_CAP + 1),
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("check");
});

test("automation_rules.chat_id is nullable from birth (the owner-global v2 seam) and CASCADEs with the chat", async () => {
  const db = await freshDb();
  const { ownerId, chatId } = await seedOwnerAndChat(db, "rule_scope");
  await db.insert(automationRules).values({ ...ruleValues("automation_rule_global", ownerId, chatId), chatId: null });
  await db.insert(automationRules).values(ruleValues("automation_rule_scoped", ownerId, chatId));

  await db.delete(chats).where(eq(chats.id, chatId));
  const remaining = await db.select().from(automationRules);
  expect(remaining).toHaveLength(1); // the chat-scoped rule cascaded; the global row survives
  expect(remaining[0]?.chatId).toBeNull();
});

// ── automation_fires + automation_budgets ──────────────────────────────────────────────────────────────

test("automation_fires round-trips and CASCADEs off its rule", async () => {
  const db = await freshDb();
  const { ownerId, chatId } = await seedOwnerAndChat(db, "fire_rt");
  const rule = ruleValues("automation_rule_fire", ownerId, chatId);
  await db.insert(automationRules).values(rule);
  await db.insert(automationFires).values({
    id: castId<AutomationFireId>("automation_fire_rt"),
    ruleId: rule.id,
    chatId,
    triggerType: "chatOpened",
    outcome: "test_run",
    detail: { arms: [] },
  });

  const rows = await db.select().from(automationFires);
  expect(rows[0]?.outcome).toBe("test_run");
  expect(rows[0]?.automationDepth).toBe(0); // 0 = human-initiated
  expect(rows[0]?.detail).toEqual({ arms: [] });

  await db.delete(automationRules).where(eq(automationRules.id, rule.id));
  expect(await db.select().from(automationFires)).toHaveLength(0);
});

test("automation_budgets borns the fire-rate cap (one row per chat)", async () => {
  const db = await freshDb();
  const { chatId } = await seedOwnerAndChat(db, "budget_rt");
  await db.insert(automationBudgets).values({ chatId });

  const rows = await db.select().from(automationBudgets);
  expect(rows[0]?.maxFiresPerHour).toBe(120);
});

// ── global_variables: the natural-key KV plane ─────────────────────────────────────────────────────────

test("global_variables keys on (ownerId, key): same key across owners coexists, same owner+key collides", async () => {
  const db = await freshDb();
  const { ownerId } = await seedOwnerAndChat(db, "gvar_a");
  const { ownerId: otherId } = await seedOwnerAndChat(db, "gvar_b");

  await db.insert(globalVariables).values({ ownerId, key: "mood", value: "grim" });
  await db.insert(globalVariables).values({ ownerId: otherId, key: "mood", value: "sunny" });

  let caught: unknown;
  try {
    await db.insert(globalVariables).values({ ownerId, key: "mood", value: "again" });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)).toBeDefined();
  expect(await db.select().from(globalVariables)).toHaveLength(2);
});

test("the key CHECK caps at 128 chars; the value CHECK caps at 64 KiB of BYTES (not characters)", async () => {
  const db = await freshDb();
  const { ownerId } = await seedOwnerAndChat(db, "gvar_caps");
  await db.insert(globalVariables).values({ ownerId, key: "k".repeat(KEY_CAP), value: "v".repeat(VALUE_CAP_BYTES) }); // both AT cap

  let longKey: unknown;
  try {
    await db.insert(globalVariables).values({ ownerId, key: "k".repeat(KEY_CAP + 1), value: "v" });
  } catch (err) {
    longKey = err;
  }
  expect(isConstraintViolation(longKey)?.kind).toBe("check");

  let bigValue: unknown;
  try {
    // 3-byte UTF-8 chars: 30 000 characters ≈ 90 000 bytes — under the cap in CHARACTERS, over in
    // BYTES. The blob-cast CHECK must count bytes and refuse.
    await db.insert(globalVariables).values({ ownerId, key: "big", value: "€".repeat(30_000) });
  } catch (err) {
    bigValue = err;
  }
  expect(isConstraintViolation(bigValue)?.kind).toBe("check");
});
