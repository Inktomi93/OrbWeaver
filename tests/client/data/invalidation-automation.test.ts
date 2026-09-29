// The automation room is live-only: terminal events must stale the right chat's durable reads,
// while reconnect gap-heal must also stale fire logs for rules that did not emit during the outage.

import { createTrpcClient, createTrpcProxy } from "@orb/client/data";
import type { AutomationBusEvent } from "@orb/contracts/automation";
import type { AutomationRuleId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { QueryClient } from "@tanstack/react-query";
import { allAutomationRoomFilters, automationEventFilters } from "../../../packages/client/src/data/invalidation-automation.ts";
import { expect, test } from "../../support/fixtures.ts";

const CHAT_ID = castId<ChatId>("chat_automation_filters");
const OTHER_CHAT_ID = castId<ChatId>("chat_other_automation_filters");
const RULE_ID = castId<AutomationRuleId>("rule_automation_filters");
const OTHER_RULE_ID = castId<AutomationRuleId>("rule_other_automation_filters");

test("a rule terminal stales its room and fire log without staling another room", async () => {
  const queryClient = new QueryClient();
  const trpc = createTrpcProxy(createTrpcClient("http://localhost/api/trpc"), queryClient);
  const roomRules = trpc.automation.listRules.queryKey({ chatId: CHAT_ID });
  const roomActivity = trpc.automation.listChatActivity.queryKey({ chatId: CHAT_ID, limit: 50 });
  const roomFires = trpc.automation.listFires.queryKey({ ruleId: RULE_ID });
  const otherRules = trpc.automation.listRules.queryKey({ chatId: OTHER_CHAT_ID });
  const otherActivity = trpc.automation.listChatActivity.queryKey({ chatId: OTHER_CHAT_ID, limit: 50 });
  const otherFires = trpc.automation.listFires.queryKey({ ruleId: OTHER_RULE_ID });
  for (const key of [roomRules, roomActivity, roomFires, otherRules, otherActivity, otherFires]) {
    queryClient.setQueryData(key, []);
  }

  const event: AutomationBusEvent = { type: "ruleErrored", chatId: CHAT_ID, ruleId: RULE_ID };
  for (const filter of automationEventFilters(event, trpc)) {
    await queryClient.invalidateQueries(filter);
  }

  expect(queryClient.getQueryState(roomRules)?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(roomActivity)?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(roomFires)?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(otherRules)?.isInvalidated).toBe(false);
  expect(queryClient.getQueryState(otherActivity)?.isInvalidated).toBe(false);
  expect(queryClient.getQueryState(otherFires)?.isInvalidated).toBe(false);
});

test("gap-heal stales fire logs across rules but scopes rule and activity lists to the open room", async () => {
  const queryClient = new QueryClient();
  const trpc = createTrpcProxy(createTrpcClient("http://localhost/api/trpc"), queryClient);
  const roomRules = trpc.automation.listRules.queryKey({ chatId: CHAT_ID });
  const roomActivity = trpc.automation.listChatActivity.queryKey({ chatId: CHAT_ID, limit: 50 });
  const otherRules = trpc.automation.listRules.queryKey({ chatId: OTHER_CHAT_ID });
  const otherActivity = trpc.automation.listChatActivity.queryKey({ chatId: OTHER_CHAT_ID, limit: 50 });
  const otherFires = trpc.automation.listFires.queryKey({ ruleId: OTHER_RULE_ID });
  for (const key of [roomRules, roomActivity, otherRules, otherActivity, otherFires]) {
    queryClient.setQueryData(key, []);
  }

  for (const filter of allAutomationRoomFilters(CHAT_ID, trpc)) {
    await queryClient.invalidateQueries(filter);
  }

  expect(queryClient.getQueryState(roomRules)?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(roomActivity)?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(otherFires)?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(otherRules)?.isInvalidated).toBe(false);
  expect(queryClient.getQueryState(otherActivity)?.isInvalidated).toBe(false);
});
