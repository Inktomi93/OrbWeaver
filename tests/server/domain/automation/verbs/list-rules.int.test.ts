// verb: listRules — host-only list in position order, lazy-parse fault-isolated (a corrupt actions blob
// degrades to [] without nuking the list).

import { automationRules } from "@orb/db";
import { mintTypeId } from "@orb/kit/ids";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures";
import { FIXED_NOW_MS, MSG_COMMITTED, principal, ruleFixture, SET_VAR } from "../_support.ts";

describe("listRules", () => {
  test("lists the host's rules in position order", async () => {
    const { host, chatId, svc } = await ruleFixture();
    await svc.createRule({ principal: principal(host), chatId, name: "first", trigger: MSG_COMMITTED, actions: [SET_VAR] });
    const listed = await svc.listRules({ principal: principal(host), chatId });
    expect(listed.map((r) => r.name)).toEqual(["first"]);
    expect(listed[0]?.actions).toEqual([SET_VAR]);
  });

  test("is lazy-parse fault-isolated — a corrupt actions blob degrades to [] and never nukes the list", async () => {
    const { db, host, chatId, svc } = await ruleFixture();
    const good = await svc.createRule({ principal: principal(host), chatId, name: "good", trigger: MSG_COMMITTED, actions: [SET_VAR] });
    await db.insert(automationRules).values({
      id: mintTypeId("automation_rule"),
      ownerId: host,
      chatId,
      name: "corrupt",
      position: 1,
      triggerBus: "chat",
      triggerType: "messageCommitted",
      predicateCel: null,
      actions: [{ not: "an arm" }],
      createdAt: FIXED_NOW_MS,
      updatedAt: FIXED_NOW_MS,
    });
    const listed = await svc.listRules({ principal: principal(host), chatId });
    expect(listed).toHaveLength(2);
    expect(listed.find((r) => r.id === good.id)?.actions).toEqual([SET_VAR]);
    expect(listed.find((r) => r.name === "corrupt")?.actions).toEqual([]);
  });
});
