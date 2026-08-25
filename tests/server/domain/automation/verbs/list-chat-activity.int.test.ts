// verb: listChatActivity — B11 the room ACTIVITY read: a chat's fire log ACROSS all its rules, newest
// first (host-only). Distinct from listFires (per-rule): it scopes by chat_id, so it merges every rule's
// fires into one room history in a single read. The cross-tenant refusal is proven here at the domain
// guard AND in tests/server/transport/cross-tenant-sweep.suite.int.test.ts at the transport boundary.

import type { Db } from "@orb/db";
import type { AutomationFireId, AutomationRuleId, ChatId } from "@orb/kit/ids";
import { insertFire } from "../../../../../packages/server/src/domain/automation/persistence/fires.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedParticipant } from "../../chat/_support.ts";
import { MSG_COMMITTED, principal, ruleFixture, SET_VAR, seedHostChat, seedUser } from "../_support.ts";

/** One fire row's seed shape — an explicit `firedAt` so a test can pin newest-first order. */
interface FireSeed {
  readonly id: AutomationFireId;
  readonly ruleId: AutomationRuleId;
  readonly chatId: ChatId;
  readonly firedAt: number;
  readonly outcome?: "fired" | "action_error";
  readonly detail?: Record<string, unknown> | null;
}

/** Seed one fire row for a rule in a chat. */
async function seedFire(db: Db, seed: FireSeed): Promise<void> {
  await insertFire(db, {
    id: seed.id,
    ruleId: seed.ruleId,
    chatId: seed.chatId,
    triggerType: "messageCommitted",
    outcome: seed.outcome ?? "fired",
    detail: seed.detail ?? null,
    automationDepth: 0,
    firedAt: seed.firedAt,
  });
}

test("listChatActivity merges fires across the chat's rules, newest first", async () => {
  const { host, chatId, svc, ctx, db } = await ruleFixture();
  const ruleA = await svc.createRule({ principal: principal(host), chatId, name: "a", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  const ruleB = await svc.createRule({ principal: principal(host), chatId, name: "b", trigger: MSG_COMMITTED, actions: [SET_VAR] });

  // Two rules' fires interleaved in time — the read must ORDER by firedAt, not group by rule.
  await seedFire(db, { id: ctx.newFireId(), ruleId: ruleA.id, chatId, firedAt: 1000 });
  await seedFire(db, { id: ctx.newFireId(), ruleId: ruleB.id, chatId, firedAt: 3000 });
  await seedFire(db, { id: ctx.newFireId(), ruleId: ruleA.id, chatId, firedAt: 2000, outcome: "action_error", detail: { error: "boom" } });

  const activity = await svc.listChatActivity({ principal: principal(host), chatId });
  expect(activity.map((f) => f.firedAt)).toEqual([3000, 2000, 1000]);
  // It really spanned BOTH rules (a per-rule read could not).
  expect(new Set(activity.map((f) => f.ruleId))).toEqual(new Set([ruleA.id, ruleB.id]));
});

test("listChatActivity carries the confirmer stamp a confirmed suggestion recorded", async () => {
  const { host, chatId, svc, ctx, db } = await ruleFixture();
  const rule = await svc.createRule({ principal: principal(host), chatId, name: "r", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  // A confirmed-suggestion fire is an ordinary `fired` row whose `detail` names who authorized it
  // (confirm-suggestion.ts stamps `confirmedByUserId`) — the Activity tab reads it to mark human-confirmed cards.
  await seedFire(db, { id: ctx.newFireId(), ruleId: rule.id, chatId, firedAt: 5000, detail: { confirmedByUserId: host, armType: "run_analysis" } });

  const activity = await svc.listChatActivity({ principal: principal(host), chatId });
  expect(activity[0]?.detail?.["confirmedByUserId"]).toBe(host);
});

test("listChatActivity is scoped to the asked chat — another room's fires never leak in", async () => {
  const { host, chatId, svc, ctx, db } = await ruleFixture();
  const mine = await svc.createRule({ principal: principal(host), chatId, name: "mine", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  await seedFire(db, { id: ctx.newFireId(), ruleId: mine.id, chatId, firedAt: 1000 });

  // A SECOND room the same host owns, with its own rule + fire — it must not bleed into the first room's read.
  const otherChat = await seedHostChat(db, host, "other");
  const otherRule = await svc.createRule({ principal: principal(host), chatId: otherChat, name: "other", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  await seedFire(db, { id: ctx.newFireId(), ruleId: otherRule.id, chatId: otherChat, firedAt: 9000 });

  const activity = await svc.listChatActivity({ principal: principal(host), chatId });
  expect(activity).toHaveLength(1);
  expect(activity[0]?.ruleId).toBe(mine.id);
});

test("listChatActivity refuses a non-member with a leak-free NOT_FOUND (the cross-tenant gate)", async () => {
  const { chatId, svc, db } = await ruleFixture();
  // A stranger who is not a participant of the chat at all — requireChatHost's loadCallerRole returns
  // undefined, so the verb throws AutomationChatNotFoundError before any fire row is read.
  const stranger = await seedUser(db, "user_stranger");
  await expect(svc.listChatActivity({ principal: principal(stranger), chatId })).rejects.toThrow();
});

test("listChatActivity refuses a NON-HOST member (fires are the host's hidden hand)", async () => {
  const { chatId, svc, db } = await ruleFixture();
  // A present MEMBER (not host) — loadCallerRole finds them, so `can()` propagates FORBIDDEN rather than
  // NOT_FOUND (a member already knows the room exists). Either way the read is refused.
  const member = await seedUser(db, "user_member");
  await seedParticipant(db, { chatId, key: "member_seat", userId: member, role: "member" });
  await expect(svc.listChatActivity({ principal: principal(member), chatId })).rejects.toThrow();
});
