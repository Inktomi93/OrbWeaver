// verb: createRule — host authority + the whole validation gauntlet (reserved trigger/arm · bad CEL · arm
// cap · cooldown floor · unattached book), and the born-disabled/position-0 creation (04 §2).

import type { AutomationAction, AutomationTrigger } from "@orb/contracts/automation";
import { DomainForbiddenError } from "@orb/kit/errors";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { AutomationChatNotFoundError, AutomationReservedTriggerError, RuleValidationError } from "@orb/server/domain/automation";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures";
import { seedParticipant } from "../../chat/_support.ts";
import { FIXED_NOW_MS, MSG_COMMITTED, principal, ruleFixture, SET_VAR, seedUser } from "../_support.ts";

describe("createRule — authority", () => {
  test("a host creates a rule born disabled at position 0", async () => {
    const { host, chatId, svc } = await ruleFixture();
    const rule = await svc.createRule({ principal: principal(host), chatId, name: "greet", trigger: MSG_COMMITTED, actions: [SET_VAR] });
    expect(rule.enabled).toBe(false);
    expect(rule.position).toBe(0);
    expect(rule.trigger).toEqual(MSG_COMMITTED);
    expect(rule.actions).toEqual([SET_VAR]);
    expect(rule.createdAt).toBe(FIXED_NOW_MS);
  });

  test("a present member who is not host is forbidden", async () => {
    const { db, chatId, svc } = await ruleFixture();
    const member = await seedUser(db, "user_member");
    await seedParticipant(db, { chatId, key: "mem", userId: member, role: "member" });
    await expect(svc.createRule({ principal: principal(member), chatId, name: "x", trigger: MSG_COMMITTED, actions: [SET_VAR] })).rejects.toThrow(
      DomainForbiddenError,
    );
  });

  test("a non-member gets a leak-free chat-not-found", async () => {
    const { db, chatId, svc } = await ruleFixture();
    const stranger = await seedUser(db, "user_stranger");
    await expect(svc.createRule({ principal: principal(stranger), chatId, name: "x", trigger: MSG_COMMITTED, actions: [SET_VAR] })).rejects.toThrow(
      AutomationChatNotFoundError,
    );
  });
});

describe("createRule — validation refusals", () => {
  test("refuses a reserved trigger", async () => {
    const { host, chatId, svc } = await ruleFixture();
    const trigger: AutomationTrigger = { bus: "chat", type: "messageHidden" };
    await expect(svc.createRule({ principal: principal(host), chatId, name: "x", trigger, actions: [SET_VAR] })).rejects.toThrow(
      AutomationReservedTriggerError,
    );
  });

  test("refuses an unparseable CEL predicate", async () => {
    const { host, chatId, svc } = await ruleFixture();
    await expect(
      svc.createRule({ principal: principal(host), chatId, name: "x", trigger: MSG_COMMITTED, predicateCel: "event.role ==", actions: [SET_VAR] }),
    ).rejects.toThrow(RuleValidationError);
  });

  test("refuses more than 8 arms", async () => {
    const { host, chatId, svc } = await ruleFixture();
    const arms = Array.from({ length: 9 }, () => SET_VAR);
    await expect(svc.createRule({ principal: principal(host), chatId, name: "x", trigger: MSG_COMMITTED, actions: arms })).rejects.toThrow(RuleValidationError);
  });

  test("refuses a post_notification arm below the 60s cooldown floor", async () => {
    const { host, chatId, svc } = await ruleFixture();
    const arm: AutomationAction = { type: "post_notification", recipient: "host", messageTemplate: "hi" };
    await expect(
      svc.createRule({ principal: principal(host), chatId, name: "x", trigger: MSG_COMMITTED, cooldownSeconds: 10, actions: [arm] }),
    ).rejects.toThrow(RuleValidationError);
  });

  test("refuses a transform_draft arm mixed with a non-transform arm (transform_mix)", async () => {
    const { host, chatId, svc } = await ruleFixture();
    const arms: AutomationAction[] = [{ type: "transform_draft", target: "user_input", template: "{{draft}}" }, SET_VAR];
    const trigger: AutomationTrigger = { bus: "chat", type: "turnStarted" };
    await expect(svc.createRule({ principal: principal(host), chatId, name: "x", trigger, actions: arms })).rejects.toThrow(RuleValidationError);
  });

  test("refuses a transform_draft rule on a non-turnStarted trigger (transform_trigger)", async () => {
    const { host, chatId, svc } = await ruleFixture();
    const arm: AutomationAction = { type: "transform_draft", target: "user_input", template: "{{draft}}" };
    await expect(svc.createRule({ principal: principal(host), chatId, name: "x", trigger: MSG_COMMITTED, actions: [arm] })).rejects.toThrow(
      RuleValidationError,
    );
  });

  test("accepts a transform_draft rule on chat/turnStarted (all-transform)", async () => {
    const { host, chatId, svc } = await ruleFixture();
    const arm: AutomationAction = { type: "transform_draft", target: "assembled_dynamic", template: "{{draft}}!" };
    const trigger: AutomationTrigger = { bus: "chat", type: "turnStarted" };
    const rule = await svc.createRule({ principal: principal(host), chatId, name: "xf", trigger, actions: [arm] });
    expect(rule.actions).toEqual([arm]);
  });

  test("refuses an insert_world_info_entry arm whose (valid) book is not attached to the chat", async () => {
    const { host, chatId, svc } = await ruleFixture();
    const arm: AutomationAction = {
      type: "insert_world_info_entry",
      bookId: mintTypeId(ID_PREFIX.worldBook),
      entryKey: "e",
      keys: [],
      contentTemplate: "c",
      position: "before",
    };
    await expect(svc.createRule({ principal: principal(host), chatId, name: "x", trigger: MSG_COMMITTED, actions: [arm] })).rejects.toThrow(
      RuleValidationError,
    );
  });
});
