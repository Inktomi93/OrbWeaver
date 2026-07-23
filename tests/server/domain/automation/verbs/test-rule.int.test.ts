// verb: testRule — the dry-run (host-only): renders arm previews + evaluates the predicate, executing
// NOTHING (no op, no budget), and logs a test_run fire. A predicate runtime error surfaces without throwing.

import { automationRules } from "@orb/db";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures";
import { MSG_COMMITTED, principal, ruleFixture, SET_VAR } from "../_support.ts";

describe("testRule", () => {
  test("renders arm previews + a true predicate, executes nothing, logs a test_run fire", async () => {
    const { db, host, chatId, svc } = await ruleFixture();
    const rule = await svc.createRule({
      principal: principal(host),
      chatId,
      name: "dry",
      trigger: MSG_COMMITTED,
      predicateCel: 'event.type == "messageCommitted"',
      actions: [{ type: "set_variable", scope: "chat", key: "greeting", op: "set", value: "hello {{time}}" }],
    });
    const result = await svc.testRule({ principal: principal(host), ruleId: rule.id });
    expect(result.predicate).toBe(true);
    expect(result.arms).toHaveLength(1);
    expect(result.arms[0]?.type).toBe("set_variable");
    expect(typeof result.arms[0]?.renderedPreview).toBe("string");
    const fires = await svc.listFires({ principal: principal(host), ruleId: rule.id });
    expect(fires[0]?.outcome).toBe("test_run");
    // The rule never actually fired — lastFiredAt is untouched (the dry run debits nothing).
    const [row] = await db.select({ lastFiredAt: automationRules.lastFiredAt }).from(automationRules).where(eq(automationRules.id, rule.id));
    expect(row?.lastFiredAt).toBeNull();
  });

  test("surfaces a predicate runtime error without throwing", async () => {
    const { host, chatId, svc } = await ruleFixture();
    // Reading a field the synthesized fact never populates → a runtime CEL error (no has() guard).
    const rule = await svc.createRule({
      principal: principal(host),
      chatId,
      name: "err",
      trigger: MSG_COMMITTED,
      predicateCel: 'event.message.role == "user"',
      actions: [SET_VAR],
    });
    const result = await svc.testRule({ principal: principal(host), ruleId: rule.id });
    expect(typeof result.predicate).toBe("object");
  });
});
