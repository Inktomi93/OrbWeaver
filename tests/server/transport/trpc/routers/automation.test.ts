// automation.{listRules,createRule,setBudgets,…} — the A8 rule-lifecycle wire-through (core/Tier-4-Transport.md).
// The router is a THIN driver: it validates the wire schema, injects `principal: ctx.auth` (NEVER from input —
// the acting identity is the resolved Principal), and delegates to `ctx.services.automation.<verb>`. The trigger/
// action VOCABULARY rides `@orb/contracts/automation` (not re-spelled). These assert the pass-through (the mapped
// fields reach the verb, the principal is the caller's) + that the contract action schema bites at the wire —
// driven through the real ladder via `createCaller`. Host authority + leak-free collapse are the domain guard's
// job (proven in the cross-tenant sweep + the automation domain tests), not re-tested here.

import type { AutomationRuleId, ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AutomationService, RuleView } from "@orb/server/domain/automation";
import type { Context } from "@orb/server/transport/trpc";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures";
import { caller, makeContext, principal } from "../_support.ts";

const OWNER = castId<UserId>("user_owner");
const CHAT = castId<ChatId>("chat_1");

function ctxWith(automation: Partial<AutomationService>): Context {
  return makeContext({ auth: principal("user", { userId: OWNER }), services: { automation } });
}

const RULE: RuleView = {
  id: castId<AutomationRuleId>("automationrule_1"),
  chatId: CHAT,
  name: "Greet",
  description: null,
  enabled: false,
  position: 1,
  trigger: { bus: "chat", type: "messageCommitted" },
  predicateCel: null,
  actions: [{ type: "set_variable", scope: "chat", key: "greeted", op: "set", value: "1" }],
  matchAutomationEvents: false,
  cooldownSeconds: 0,
  maxFiresPerHour: 30,
  consecutiveErrors: 0,
  lastError: null,
  lastFiredAt: null,
  createdAt: 1,
  updatedAt: 1,
};

describe("automation.listRules — chat wire-through", () => {
  test("passes the validated chatId and the caller's principal to the verb", async () => {
    const listRules = vi.fn<AutomationService["listRules"]>(async () => [RULE]);
    await caller(ctxWith({ listRules })).automation.listRules({ chatId: CHAT });
    expect(listRules).toHaveBeenCalledWith({ principal: expect.objectContaining({ userId: OWNER }), chatId: CHAT });
  });
});

describe("automation.createRule — editable-field wire-through", () => {
  test("injects the caller's principal (never from input) + maps the mandatory + present optional fields", async () => {
    const createRule = vi.fn<AutomationService["createRule"]>(async () => RULE);
    await caller(ctxWith({ createRule })).automation.createRule({
      chatId: CHAT,
      name: "Greet",
      trigger: { bus: "chat", type: "messageCommitted" },
      actions: [{ type: "set_variable", scope: "chat", key: "greeted", op: "set", value: "1" }],
      cooldownSeconds: 60,
    });
    expect(createRule).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: OWNER }),
      chatId: CHAT,
      name: "Greet",
      trigger: { bus: "chat", type: "messageCommitted" },
      actions: [{ type: "set_variable", scope: "chat", key: "greeted", op: "set", value: "1" }],
      cooldownSeconds: 60,
    });
  });

  test("omits an absent optional rather than passing it as undefined (exactOptional discipline)", async () => {
    const createRule = vi.fn<AutomationService["createRule"]>(async () => RULE);
    await caller(ctxWith({ createRule })).automation.createRule({
      chatId: CHAT,
      name: "Greet",
      trigger: { bus: "chat", type: "messageCommitted" },
      actions: [{ type: "set_variable", scope: "chat", key: "greeted", op: "set", value: "1" }],
    });
    const [args] = createRule.mock.calls[0] ?? [];
    expect(args && "cooldownSeconds" in args).toBe(false);
    expect(args && "description" in args).toBe(false);
  });

  test("rejects an empty action list at the wire (the contract action-arm min bites before the verb)", async () => {
    const createRule = vi.fn<AutomationService["createRule"]>(async () => RULE);
    await expect(
      caller(ctxWith({ createRule })).automation.createRule({
        chatId: CHAT,
        name: "Greet",
        trigger: { bus: "chat", type: "messageCommitted" },
        actions: [],
      }),
    ).rejects.toThrow();
    expect(createRule).not.toHaveBeenCalled();
  });
});

describe("automation.setBudgets — nullable clear wire-through", () => {
  test("threads maxUsdPerDay: null (the dollar-ceiling clear) through to the verb", async () => {
    const setBudgets = vi.fn<AutomationService["setBudgets"]>(async () => undefined);
    await caller(ctxWith({ setBudgets })).automation.setBudgets({ chatId: CHAT, maxUsdPerDay: null });
    expect(setBudgets).toHaveBeenCalledWith({ principal: expect.objectContaining({ userId: OWNER }), chatId: CHAT, maxUsdPerDay: null });
  });
});

describe("automation.getBudgets — chat wire-through", () => {
  test("passes the validated chatId + the caller's principal to the verb", async () => {
    const getBudgets = vi.fn<AutomationService["getBudgets"]>(async () => ({
      maxFiresPerHour: 120,
      maxSpendActionsPerDay: 10,
      maxUsdPerDay: 1,
      usdSpentToday: 0,
      spendDay: "",
    }));
    await caller(ctxWith({ getBudgets })).automation.getBudgets({ chatId: CHAT });
    expect(getBudgets).toHaveBeenCalledWith({ principal: expect.objectContaining({ userId: OWNER }), chatId: CHAT });
  });
});
