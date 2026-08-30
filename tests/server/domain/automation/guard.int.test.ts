// guard — the rule-authority chokepoint. Pins the header's asymmetry: a chat rule's authority check leak-free
// collapses a non-member to NOT_FOUND and lets a member-non-host propagate can()'s FORBIDDEN (existence is
// already visible to the room), while an owner-global rule's non-owner ALWAYS collapses to NOT_FOUND (the
// rule is visible to exactly one person, so "not yours" and "does not exist" must be indistinguishable).

import type { AutomationRuleId, ChatId } from "@orb/kit/ids";
import { mintTypeId } from "@orb/kit/ids";
import { can } from "@orb/server/domain/admin";
import { describe } from "vitest";
import { AutomationChatNotFoundError, RuleNotFoundError } from "../../../../packages/server/src/domain/automation/contract/errors.ts";
import { requireChatHost, requireRuleAuthority } from "../../../../packages/server/src/domain/automation/guard.ts";
import { insertRule } from "../../../../packages/server/src/domain/automation/persistence/rules.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { seedParticipant } from "../chat/_support.ts";
import { FIXED_NOW_MS, principal, ruleFixture, seedUser } from "./_support.ts";

async function seedRule(
  fixture: Awaited<ReturnType<typeof ruleFixture>>,
  ownerId = fixture.host,
  chatId: ChatId | null = fixture.chatId,
): Promise<AutomationRuleId> {
  const id = mintTypeId("automation_rule");
  await insertRule(fixture.db, {
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

describe("requireChatHost", () => {
  test("the host passes", async () => {
    const fixture = await ruleFixture();
    await expect(requireChatHost({ db: fixture.db, can }, principal(fixture.host), fixture.chatId)).resolves.toBeUndefined();
  });

  test("a non-member is a leak-free AutomationChatNotFoundError", async () => {
    const fixture = await ruleFixture();
    const outsider = await seedUser(fixture.db, "user_outsider");
    await expect(requireChatHost({ db: fixture.db, can }, principal(outsider), fixture.chatId)).rejects.toThrow(AutomationChatNotFoundError);
  });

  test("a present member who is not host is refused (can()'s own error propagates)", async () => {
    const fixture = await ruleFixture();
    const member = await seedUser(fixture.db, "user_member");
    await seedParticipant(fixture.db, { chatId: fixture.chatId, key: "member", userId: member, role: "member" });
    await expect(requireChatHost({ db: fixture.db, can }, principal(member), fixture.chatId)).rejects.toThrow();
    await expect(requireChatHost({ db: fixture.db, can }, principal(member), fixture.chatId)).rejects.not.toThrow(AutomationChatNotFoundError);
  });
});

describe("requireRuleAuthority — chat-scoped rule", () => {
  test("the host loads the rule with chatId narrowed non-null", async () => {
    const fixture = await ruleFixture();
    const ruleId = await seedRule(fixture);
    const rule = await requireRuleAuthority({ db: fixture.db, can }, principal(fixture.host), ruleId);
    expect(rule.chatId).toBe(fixture.chatId);
  });

  test("a non-member is a leak-free RuleNotFoundError, not FORBIDDEN — the room's existence would otherwise leak", async () => {
    const fixture = await ruleFixture();
    const ruleId = await seedRule(fixture);
    const outsider = await seedUser(fixture.db, "user_outsider");
    await expect(requireRuleAuthority({ db: fixture.db, can }, principal(outsider), ruleId)).rejects.toThrow(RuleNotFoundError);
  });

  test("an unknown ruleId is RuleNotFoundError", async () => {
    const fixture = await ruleFixture();
    await expect(requireRuleAuthority({ db: fixture.db, can }, principal(fixture.host), mintTypeId("automation_rule"))).rejects.toThrow(RuleNotFoundError);
  });
});

describe("requireRuleAuthority — owner-global rule (C5)", () => {
  test("the owner loads the rule with chatId narrowed null", async () => {
    const fixture = await ruleFixture();
    const ruleId = await seedRule(fixture, fixture.host, null);
    const rule = await requireRuleAuthority({ db: fixture.db, can }, principal(fixture.host), ruleId);
    expect(rule.chatId).toBeNull();
  });

  test("a NON-OWNER collapses to RuleNotFoundError — never FORBIDDEN, per the header's leak-free asymmetry", async () => {
    const fixture = await ruleFixture();
    const ruleId = await seedRule(fixture, fixture.host, null);
    const other = await seedUser(fixture.db, "user_other");
    await expect(requireRuleAuthority({ db: fixture.db, can }, principal(other), ruleId)).rejects.toThrow(RuleNotFoundError);
  });

  test("the same non-owner IS granted authority over their OWN chatless rule", async () => {
    const fixture = await ruleFixture();
    const other = await seedUser(fixture.db, "user_other");
    const ruleId = await seedRule(fixture, other, null);
    const rule = await requireRuleAuthority({ db: fixture.db, can }, principal(other), ruleId);
    expect(rule.chatId).toBeNull();
  });
});
