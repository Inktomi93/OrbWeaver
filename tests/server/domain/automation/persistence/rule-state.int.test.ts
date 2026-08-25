// .int tests for persistence/rule-state (S5): the absent-row cold start, the upsert round-trip, the
// guidance write-boundary SLICE (the one bound the DDL CHECK mirrors — the CHECK can never bite in app
// flow because THIS slice runs first), the leave-guidance-untouched arm of the upsert (a watermark-only
// write must not re-decide the steer), and the S2 teaching read's three gates (this chat · enabled ·
// author-is-the-turn-host) + its newest-wins single-voice pick.

import { ANALYSIS_GUIDANCE_MAX } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import { automationRules } from "@orb/db";
import type { AutomationRuleId, ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { EMPTY_ANALYSIS_STATE } from "../../../../../packages/server/src/domain/automation/contract/analysis.ts";
import { selectChatGuidance, selectRuleState, upsertRuleState } from "../../../../../packages/server/src/domain/automation/persistence/rule-state.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedChat, seedParticipant } from "../../chat/_support.ts";
import { seedUser } from "../_support.ts";

const NOW = 1_700_000_000_000;

async function seedRule(db: Db, args: { readonly id: string; readonly ownerId: UserId; readonly chatId: ChatId }): Promise<AutomationRuleId> {
  const ruleId = castId<AutomationRuleId>(args.id);
  await db.insert(automationRules).values({
    id: ruleId,
    ownerId: args.ownerId,
    chatId: args.chatId,
    name: "r",
    position: 1,
    triggerBus: "chat",
    triggerType: "turnCompleted",
    actions: [],
    enabled: true,
  });
  return ruleId;
}

async function setup(): Promise<{ db: Db; host: UserId; chatId: ChatId; ruleId: AutomationRuleId }> {
  const db = await freshDb();
  const host = await seedUser(db, "user_host");
  const chatId = await seedChat(db, "rs");
  await seedParticipant(db, { chatId, key: "rs_host", userId: host, role: "host" });
  const ruleId = await seedRule(db, { id: "automation_rule_rs", ownerId: host, chatId });
  return { db, host, chatId, ruleId };
}

test("an absent row reads as the EMPTY state (a first pass is a cold start); the upsert round-trips", async () => {
  const { db, ruleId } = await setup();
  expect(await selectRuleState(db, ruleId)).toEqual({ state: EMPTY_ANALYSIS_STATE, guidance: "" });

  const state = { arc: "the debt", twists: ["a clue"], retiredTwists: ["spent"], settledThroughSeq: 7 };
  await upsertRuleState(db, { ruleId, state, guidance: "plant it", nowMs: NOW });
  expect(await selectRuleState(db, ruleId)).toEqual({ state, guidance: "plant it" });

  // A second upsert UPDATES the one row (rule-id natural PK).
  await upsertRuleState(db, { ruleId, state: { ...state, settledThroughSeq: 9 }, guidance: "", nowMs: NOW + 1 });
  expect((await selectRuleState(db, ruleId)).state.settledThroughSeq).toBe(9);
});

test("guidance SLICES at the write boundary (the bound the DDL CHECK mirrors) and `undefined` leaves it untouched", async () => {
  const { db, ruleId } = await setup();
  await upsertRuleState(db, { ruleId, state: EMPTY_ANALYSIS_STATE, guidance: "g".repeat(ANALYSIS_GUIDANCE_MAX * 2), nowMs: NOW });
  expect((await selectRuleState(db, ruleId)).guidance).toBe("g".repeat(ANALYSIS_GUIDANCE_MAX));

  // A watermark-only write (the confirmed-lore path) must not re-decide the steer.
  await upsertRuleState(db, { ruleId, state: { ...EMPTY_ANALYSIS_STATE, settledThroughSeq: 3 }, nowMs: NOW + 1 });
  const after = await selectRuleState(db, ruleId);
  expect(after.state.settledThroughSeq).toBe(3);
  expect(after.guidance).toBe("g".repeat(ANALYSIS_GUIDANCE_MAX));
});

test("selectChatGuidance gates on chat + enabled + author-is-the-turn-host, and picks the newest single voice", async () => {
  const { db, host, chatId, ruleId } = await setup();
  await upsertRuleState(db, { ruleId, state: EMPTY_ANALYSIS_STATE, guidance: "older voice", nowMs: NOW });

  // The happy read: enabled rule, this chat, author IS the resolved host.
  expect(await selectChatGuidance(db, chatId, host)).toBe("older voice");

  // Handoff fail-safe: `ownerId = runAsUserId` IS the author-still-holds-host check by identity — a turn
  // resolved under a NEW host reads nothing (§3-S5.3, both directions fail-safe).
  const stranger = await seedUser(db, "user_newhost");
  expect(await selectChatGuidance(db, chatId, stranger)).toBeNull();

  // A DISABLED rule's guidance stops teaching.
  const { eq } = await import("drizzle-orm");
  await db.update(automationRules).set({ enabled: false }).where(eq(automationRules.id, ruleId));
  expect(await selectChatGuidance(db, chatId, host)).toBeNull();
  await db.update(automationRules).set({ enabled: true }).where(eq(automationRules.id, ruleId));

  // Two guidance-bearing rules ⇒ the NEWEST-updated voice wins (ONE narrator instruction, never a chorus).
  const rule2 = await seedRule(db, { id: "automation_rule_rs2", ownerId: host, chatId });
  await upsertRuleState(db, { ruleId: rule2, state: EMPTY_ANALYSIS_STATE, guidance: "newer voice", nowMs: NOW + 10 });
  expect(await selectChatGuidance(db, chatId, host)).toBe("newer voice");

  // An empty-guidance row never teaches ("" = no standing guidance).
  await upsertRuleState(db, { ruleId: rule2, state: EMPTY_ANALYSIS_STATE, guidance: "", nowMs: NOW + 20 });
  expect(await selectChatGuidance(db, chatId, host)).toBe("older voice");
});
